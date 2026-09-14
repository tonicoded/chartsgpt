import { cryptoData, alignmentData, parseCryptoQuery, BinanceError } from '../../../../lib/market/binance';
import { analyzeNative } from '../../../../lib/engine/native';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const results = new Map<string, { until: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();
export async function GET(request: Request) {
  try {
    const { symbol, timeframe } = parseCryptoQuery(new URL(request.url).searchParams);
    const key = `${symbol}:${timeframe}`;
    const cached = results.get(key);
    if (cached && cached.until > Date.now()) return Response.json(cached.data);
    let task = pending.get(key);
    if (!task) {
      task = (async () => {
        const { candles, chartCandles, ticker } = await cryptoData(symbol, timeframe);
        const alignment = candles.length >= 250 ? await alignmentData(symbol, timeframe) : { contexts: [], missing: [] };
        const snapshot = candles.length >= 250 ? await analyzeNative({ symbol, timeframe, candles, higherTimeframes: alignment.contexts }) : null;
        const analysisNotice = snapshot ? (alignment.missing.length ? `Timeframe context unavailable: ${alignment.missing.join(', ')}. Retrying on the next scan.` : null) : `This timeframe has ${candles.length} candles. Full analysis requires at least 250. The chart remains available.`;
        const data = { symbol, timeframe, snapshot, analysisNotice, candles, chartCandles, ticker, fetchedAt: Date.now(), engine: 'ios-native', closedCandlesOnly: false };
        if (results.size >= 128) results.delete(results.keys().next().value!);
        results.set(key, { until: Date.now() + 500, data });
        return data;
      })();
      pending.set(key, task);
    }
    try { return Response.json(await task); } finally { pending.delete(key); }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Analysis failed.' }, { status: error instanceof BinanceError ? error.status : 503 });
  }
}
