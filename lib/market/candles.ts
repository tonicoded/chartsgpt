/**
 * Candle fetching — the subset of `ChartGPT/MarketDataService.swift` the web app needs.
 *
 * Runs SERVER-SIDE only. Binance, Yahoo and Stooq all reject cross-origin browser
 * requests, so the app calls these through a route handler rather than from the client.
 *
 * The timeframe→interval mapping and the aggregation are ported from iOS: the engine's
 * warm-up lengths and swing radii assume candles of exactly these shapes, so fetching
 * "close enough" bars would silently shift every level.
 */

import type { Candle } from "../engine/types";

export type DataSource = "binance" | "binancefutures" | "yahoo" | "stooq";

export interface CandlesResult {
  sourceExchange: string;
  sourceSymbol: string;
  sourceTimeframe: string;
  candles: Candle[];
}

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataError";
  }
}

/** Swift: `aggregateCandles(_:groupSize:)`. Drops the trailing partial group. */
export function aggregateCandles(candles: readonly Candle[], groupSize: number): Candle[] {
  if (groupSize <= 1) return [...candles];
  if (candles.length < groupSize) return [...candles];

  const usableCount = candles.length - (candles.length % groupSize);
  if (usableCount <= 0) return [...candles];

  const base = candles.slice(0, usableCount);
  const aggregated: Candle[] = [];

  for (let index = 0; index < base.length; index += groupSize) {
    const slice = base.slice(index, Math.min(index + groupSize, base.length));
    if (slice.length === 0) break;
    const first = slice[0];
    const last = slice[slice.length - 1];
    let high = first.high;
    let low = first.low;
    let volume = 0;
    for (const candle of slice) {
      if (candle.high > high) high = candle.high;
      if (candle.low < low) low = candle.low;
      volume += candle.volume;
    }
    aggregated.push({
      openTime: first.openTime,
      open: first.open,
      high,
      low,
      close: last.close,
      volume
    });
  }
  return aggregated;
}

// MARK: - Binance

const BINANCE_INTERVALS = new Set([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M"
]);

/** Swift: `binanceInterval(from:)` plus `normalizeBinanceTimeframeCandidate`. */
function binanceInterval(timeframe: string): { interval: string; groupSize: number } {
  const trimmed = timeframe.trim();
  const lower = trimmed.toLowerCase();

  // Uppercase "M" means months on iOS; Binance spells that "1M".
  if (/^\d+M$/.test(trimmed)) return { interval: trimmed, groupSize: 1 };
  if (lower === "1mo" || lower === "1mon") return { interval: "1M", groupSize: 1 };

  if (BINANCE_INTERVALS.has(lower)) return { interval: lower, groupSize: 1 };
  // 3h has no native Binance interval; iOS builds it from 1h.
  if (lower === "3h") return { interval: "1h", groupSize: 3 };

  throw new MarketDataError(`Unsupported timeframe: ${timeframe}`);
}

async function fetchBinanceKlines(
  host: string,
  path: string,
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const url = `https://${host}${path}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message: string | null = null;
    try {
      message = (JSON.parse(body) as { msg?: string }).msg ?? null;
    } catch {
      message = null;
    }
    throw new MarketDataError(`Binance request failed (${response.status})${message ? `: ${message}` : ""}`);
  }

  const rows = (await response.json()) as unknown[];
  if (!Array.isArray(rows)) throw new MarketDataError("Could not parse Binance response.");

  return rows.map((row) => {
    const entry = row as [number, string, string, string, string, string, ...unknown[]];
    return {
      openTime: Math.floor(entry[0] / 1000),
      open: Number(entry[1]),
      high: Number(entry[2]),
      low: Number(entry[3]),
      close: Number(entry[4]),
      volume: Number(entry[5])
    };
  });
}

// MARK: - Yahoo

interface YahooPlan {
  requestInterval: string;
  fallbackRequestInterval: string | null;
  outputTimeframe: string;
  groupSize: number;
  fallbackGroupSize: number | null;
}

/** Swift: `yahooAggregationPlan(for:)`. Yahoo has no native >1h intraday bars. */
function yahooAggregationPlan(timeframe: string): YahooPlan {
  const trimmed = timeframe.trim();
  const lower = trimmed.toLowerCase();

  const plain = (requestInterval: string, outputTimeframe: string, groupSize: number): YahooPlan => ({
    requestInterval,
    fallbackRequestInterval: null,
    outputTimeframe,
    groupSize,
    fallbackGroupSize: null
  });

  if (lower === "15m") return plain("15m", "15m", 1);
  if (lower === "30m") return plain("30m", "30m", 1);
  if (lower === "1h") return plain("60m", "1h", 1);
  if (lower === "2h") return plain("60m", "2h", 2);
  if (lower === "3h") return plain("60m", "3h", 3);
  if (lower === "4h") return plain("60m", "4h", 4);
  if (lower === "6h") return plain("60m", "6h", 6);
  if (lower === "8h") return plain("60m", "8h", 8);
  if (lower === "1d" || lower === "d") return plain("1d", "1d", 1);
  if (lower === "1w" || lower === "w") {
    // Prefer Yahoo's weekly bars; fall back to aggregating dailies when unsupported.
    return {
      requestInterval: "1wk",
      fallbackRequestInterval: "1d",
      outputTimeframe: "1w",
      groupSize: 1,
      fallbackGroupSize: 5
    };
  }
  if (trimmed === "1M" || lower === "1mo" || lower === "1mon") {
    return {
      requestInterval: "1mo",
      fallbackRequestInterval: "1d",
      outputTimeframe: "1mo",
      groupSize: 1,
      fallbackGroupSize: 21
    };
  }

  throw new MarketDataError(`Unsupported timeframe: ${timeframe}`);
}

/** Yahoo needs a `range` wide enough to contain `limit` bars of `interval`. */
function yahooRange(interval: string, limit: number): string {
  const perDay: Record<string, number> = { "15m": 26, "30m": 13, "60m": 7 };
  if (interval in perDay) {
    const days = Math.ceil(limit / perDay[interval]) + 5;
    // Yahoo caps 15m/30m at 60 days and 60m at 730.
    const cap = interval === "60m" ? 730 : 60;
    return `${Math.min(Math.max(days, 7), cap)}d`;
  }
  if (interval === "1d") return limit > 500 ? "5y" : limit > 250 ? "2y" : "1y";
  if (interval === "1wk") return limit > 260 ? "10y" : "5y";
  return "max";
}

async function fetchYahooCandles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const range = yahooRange(interval, limit);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=false`;

  const response = await fetch(url, {
    cache: "no-store",
    // Yahoo rejects requests without a browser-ish User-Agent.
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new MarketDataError(`Yahoo request failed (${response.status}) for ${symbol}.`);
  }

  const payload = (await response.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
      }>;
      error?: { description?: string } | null;
    };
  };

  const error = payload.chart?.error;
  if (error) throw new MarketDataError(error.description ?? `Yahoo returned an error for ${symbol}.`);

  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) throw new MarketDataError(`No Yahoo data for ${symbol}.`);

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    // Yahoo pads gaps with nulls; those rows are not candles.
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({
      openTime: timestamps[i],
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0
    });
  }
  if (candles.length === 0) throw new MarketDataError(`No usable Yahoo candles for ${symbol}.`);
  return candles;
}

// MARK: - Stooq (daily-only fallback)

/** Swift: `stooqSymbolFromYahoo(_:)`, reduced to the cases the web app can hit. */
function stooqSymbolFromYahoo(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper.endsWith("=X")) {
    const base = upper.slice(0, -2);
    return `${base.toLowerCase()}`;
  }
  if (upper.startsWith("^")) return upper.slice(1).toLowerCase();
  return `${upper.toLowerCase()}.us`;
}

async function fetchStooqDailyCandles(symbol: string, limit: number): Promise<Candle[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new MarketDataError(`Stooq request failed (${response.status}).`);

  const csv = await response.text();
  const lines = csv.trim().split("\n");
  if (lines.length < 2) throw new MarketDataError(`No Stooq data for ${symbol}.`);

  const candles: Candle[] = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close, volume] = line.split(",");
    if (!date || !close) continue;
    const time = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(time)) continue;
    candles.push({
      openTime: Math.floor(time / 1000),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0)
    });
  }
  if (candles.length === 0) throw new MarketDataError(`Could not parse Stooq data for ${symbol}.`);
  return candles.slice(-limit);
}

// MARK: - Dispatch

export interface FetchCandlesInput {
  source: DataSource;
  symbol: string;
  timeframe: string;
  limit?: number;
}

/**
 * Swift: `MarketDataService.fetchCandles(exchange:symbol:timeframe:limit:)`.
 *
 * The engine needs a long warm-up — EMA200 alone consumes 200 bars before it emits a
 * single value, and `volatilityRegimeLabel` wants 40 ATR% samples on top — so the default
 * limit is 320, matching the golden fixtures.
 */
export async function fetchCandles(input: FetchCandlesInput): Promise<CandlesResult> {
  const { source, symbol, timeframe, limit = 320 } = input;

  if (source === "binance" || source === "binancefutures") {
    const { interval, groupSize } = binanceInterval(timeframe);
    const host = source === "binancefutures" ? "fapi.binance.com" : "api.binance.com";
    const path = source === "binancefutures" ? "/fapi/v1/klines" : "/api/v3/klines";
    const upper = symbol.trim().toUpperCase();
    const base = await fetchBinanceKlines(host, path, upper, interval, limit * groupSize);
    const candles = groupSize > 1 ? aggregateCandles(base, groupSize) : base;
    return {
      sourceExchange: source === "binancefutures" ? "Binance Futures" : "Binance",
      sourceSymbol: upper,
      sourceTimeframe: timeframe,
      candles: candles.slice(-limit)
    };
  }

  if (source === "stooq") {
    const plan = yahooAggregationPlan(timeframe);
    const stooqSymbol = stooqSymbolFromYahoo(symbol);
    const base = await fetchStooqDailyCandles(stooqSymbol, Math.max(limit * plan.groupSize, limit));
    const candles = plan.groupSize > 1 ? aggregateCandles(base, plan.groupSize) : base;
    return {
      sourceExchange: "Stooq",
      sourceSymbol: stooqSymbol.toUpperCase(),
      sourceTimeframe: plan.outputTimeframe,
      candles: candles.slice(-limit)
    };
  }

  // Yahoo, with the plan's fallback interval and finally Stooq behind it.
  const plan = yahooAggregationPlan(timeframe);
  const upper = symbol.trim().toUpperCase();

  let base: Candle[] = [];
  let groupSize = plan.groupSize;
  let lastError: unknown = null;

  try {
    base = await fetchYahooCandles(upper, plan.requestInterval, Math.max(limit * plan.groupSize, limit));
  } catch (error) {
    lastError = error;
  }

  if (base.length === 0 && plan.fallbackRequestInterval !== null && plan.fallbackGroupSize !== null) {
    try {
      base = await fetchYahooCandles(
        upper,
        plan.fallbackRequestInterval,
        Math.max(limit * plan.fallbackGroupSize, limit)
      );
      groupSize = plan.fallbackGroupSize;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
  }

  if (base.length === 0) {
    // Stooq only has dailies, so it can serve 1d and anything aggregated from it.
    try {
      const stooqSymbol = stooqSymbolFromYahoo(upper);
      const daily = await fetchStooqDailyCandles(stooqSymbol, Math.max(limit * plan.groupSize, limit));
      const candles = plan.groupSize > 1 ? aggregateCandles(daily, plan.groupSize) : daily;
      return {
        sourceExchange: "Stooq",
        sourceSymbol: stooqSymbol.toUpperCase(),
        sourceTimeframe: plan.outputTimeframe,
        candles: candles.slice(-limit)
      };
    } catch {
      throw lastError instanceof Error ? lastError : new MarketDataError(`No market data for ${upper}.`);
    }
  }

  const candles = groupSize > 1 ? aggregateCandles(base, groupSize) : base;
  return {
    sourceExchange: "Yahoo Finance",
    sourceSymbol: upper,
    sourceTimeframe: plan.outputTimeframe,
    candles: candles.slice(-limit)
  };
}
