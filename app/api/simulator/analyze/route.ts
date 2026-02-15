import { NextResponse } from "next/server";
import { analyzeMarketCandles } from "../../../simulator/market-analysis";
import { fetchMarketCandles } from "../../../simulator/market-data";

export const runtime = "nodejs";

function asString(value: string | null, fallback = "") {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function asInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const exchange = asString(url.searchParams.get("exchange"), "binance-futures");
  const symbol = asString(url.searchParams.get("symbol"), "BTCUSDT");
  const timeframe = asString(url.searchParams.get("timeframe"), "1h");
  const limit = Math.min(600, Math.max(60, asInt(url.searchParams.get("limit"), 220)));

  try {
    const market = await fetchMarketCandles({ exchange, symbol, timeframe, limit });
    const analysis = analyzeMarketCandles({
      exchange: market.sourceExchange,
      symbol: market.sourceSymbol,
      timeframe: market.sourceTimeframe,
      candles: market.candles
    });

    const res = NextResponse.json(
      {
        ok: true as const,
        market: {
          exchange: market.sourceExchange,
          symbol: market.sourceSymbol,
          timeframe: market.sourceTimeframe,
          candleCount: market.candles.length,
          start: market.candles[0]?.openTime ?? null,
          end: market.candles.at(-1)?.openTime ?? null,
          lastClose: market.candles.at(-1)?.close ?? null
        },
        analysis
      },
      { status: 200 }
    );

    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false as const, error: message }, { status: 400 });
  }
}
