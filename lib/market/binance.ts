import type { Candle } from '../engine/types';

export const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export type CryptoTimeframe = typeof TIMEFRAMES[number];
export interface CryptoMarket { symbol: string; baseAsset: string; quoteAsset: string }
export interface CryptoTicker { price: number; change: number; high: number; low: number; volume: number }

export class BinanceError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const cache = new Map<string, { until: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function request<T>(path: string, ttl: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.data as T;
  if (pending.has(path)) return pending.get(path) as Promise<T>;
  const task = (async () => {
    let response: Response;
    try { response = await fetch(`https://api.binance.com/api/v3/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) }); }
    catch { throw new BinanceError('Binance is unreachable. Please try again.'); }
    if (!response.ok) throw new BinanceError(response.status === 429 || response.status === 418
      ? 'Binance rate limit reached. Retrying shortly.'
      : response.status === 451 ? 'Binance is unavailable from this server location.' : `Unable to load Binance market data (${response.status}).`);
    const data = await response.json();
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(path, { until: Date.now() + ttl, data });
    return data;
  })();
  pending.set(path, task);
  try { return await task as T; } finally { pending.delete(path); }
}

export async function cryptoMarkets(): Promise<CryptoMarket[]> {
  const data = await request<{ symbols: Array<CryptoMarket & { status: string; isSpotTradingAllowed: boolean }> }>('exchangeInfo', 3600000);
  if (!Array.isArray(data.symbols)) throw new BinanceError('Invalid market information from Binance.');
  return data.symbols.filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed)
    .map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset })).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function parseCryptoQuery(query: URLSearchParams) {
  const symbol = (query.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const timeframe = query.get('timeframe') ?? '1h';
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) throw new BinanceError('Select a valid Binance USDT crypto pair.', 400);
  if (!(TIMEFRAMES as readonly string[]).includes(timeframe)) throw new BinanceError('Unsupported timeframe.', 400);
  return { symbol, timeframe: timeframe as CryptoTimeframe };
}

export function decodeKlines(rows: unknown, now: number): Candle[] {
  if (!Array.isArray(rows)) throw new BinanceError('Invalid Binance candles.');
  let previous = -1;
  return rows.filter(row => {
    if (!Array.isArray(row) || row.length < 7 || !Number.isFinite(Number(row[6]))) throw new BinanceError('Invalid Binance candle.');
    return Number(row[6]) < now;
  }).map(row => {
    const [time, open, high, low, close, volume] = row.slice(0, 6).map(Number);
    if (![time, open, high, low, close, volume].every(Number.isFinite) || time <= previous || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || volume < 0)
      throw new BinanceError('Incomplete or invalid Binance candles.');
    previous = time;
    return { openTime: time / 1000, open, high, low, close, volume };
  });
}

export async function cryptoData(symbol: string, timeframe: CryptoTimeframe) {
  const markets = await cryptoMarkets();
  if (!markets.some(m => m.symbol === symbol)) throw new BinanceError('This pair is not active on Binance Spot.', 400);
  const [rows, tick] = await Promise.all([
    request<unknown>(`klines?symbol=${symbol}&interval=${timeframe}&limit=900`, 500),
    request<Record<string, string>>(`ticker/24hr?symbol=${symbol}`, 500)
  ]);
  const chartCandles = decodeKlines(rows, Infinity).slice(-900);
  const candles = chartCandles;
  if (chartCandles.length === 0) throw new BinanceError('No candles are available for this pair yet.', 422);
  const ticker: CryptoTicker = { price: +tick.lastPrice, change: +tick.priceChangePercent, high: +tick.highPrice, low: +tick.lowPrice, volume: +tick.quoteVolume };
  if (!Object.values(ticker).every(Number.isFinite)) throw new BinanceError('Invalid Binance price information.');
  return { candles, chartCandles, ticker };
}

export async function alignmentData(symbol: string, timeframe: CryptoTimeframe) {
  const intervals = ['1h', '4h', '1d'].filter(tf => timeframe === '1d' || tf !== timeframe);
  const results = await Promise.allSettled(intervals.map(async tf => ({
    timeframe: tf,
    candles: decodeKlines(await request<unknown>(`klines?symbol=${symbol}&interval=${tf}&limit=500`, 500), Infinity)
  })));
  return { contexts: results.flatMap(r => r.status === 'fulfilled' && r.value.candles.length >= 250 ? [r.value] : []),
    missing: intervals.filter((_, i) => results[i].status === 'rejected' || (results[i] as PromiseFulfilledResult<{ candles: Candle[] }>).value?.candles.length < 250) };
}
