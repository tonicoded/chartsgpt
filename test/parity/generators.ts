/**
 * Deterministic candle generators, ported from `ChartGPTTests/ChartGPTTests.swift`.
 *
 * These MUST stay byte-identical to the Swift versions: the golden fixtures were produced
 * by running the iOS engine over exactly these candles, so any drift here would compare
 * the two engines on different inputs and quietly hide a real parity break.
 */

import type { Candle, DerivativesDigest, MacroCalendarDigest, MarketNewsDigest } from "../../lib/engine/types";

/** Swift: `Date(timeIntervalSince1970: 1_700_000_000)`. */
export const FIXTURE_BASE_UNIX = 1_700_000_000;

// MARK: - Indicator suite (parity/scan_engine_golden_v1.json)

export interface ScanGoldenCase {
  id: string;
  generator: string;
  count: number;
  price: number;
  expected: Record<string, number>;
}

export interface ScanGoldenSuite {
  version: number;
  cases: ScanGoldenCase[];
}

type Row = [open: number, high: number, low: number, close: number];

export function candlesForScanCase(item: ScanGoldenCase): Candle[] {
  let rows: Row[];

  switch (item.generator) {
    case "flat":
      rows = Array.from({ length: item.count }, () => [item.price, item.price, item.price, item.price] as Row);
      break;
    case "bollingerAlternating":
      rows = Array.from({ length: item.count }, (_unused, index) => {
        const close = index >= item.count - 20 && index % 2 === 1 ? 102.0 : 100.0;
        return [close, close, close, close] as Row;
      });
      break;
    case "constantRange":
      rows = Array.from({ length: item.count }, () => [100.0, 102.0, 98.0, 100.0] as Row);
      break;
    case "stochastic75":
      rows = [
        ...Array.from({ length: item.count - 14 }, () => [100.0, 100.0, 100.0, 100.0] as Row),
        ...Array.from({ length: 13 }, () => [100.0, 110.0, 90.0, 100.0] as Row),
        [100.0, 110.0, 90.0, 105.0] as Row
      ];
      break;
    case "rsiUp":
      rows = Array.from({ length: item.count }, (_unused, index) => {
        const close = item.price + index;
        return [close, close, close, close] as Row;
      });
      break;
    case "rsiDown":
      rows = Array.from({ length: item.count }, (_unused, index) => {
        const close = item.price - index;
        return [close, close, close, close] as Row;
      });
      break;
    default:
      throw new Error(`Unknown shared parity generator: ${item.generator}`);
  }

  return rows.map((row, index) => ({
    openTime: FIXTURE_BASE_UNIX + index * 900,
    open: row[0],
    high: row[1],
    low: row[2],
    close: row[3],
    volume: 1000
  }));
}

// MARK: - Full snapshot suite (parity/full_snapshot_golden_v1.json)

export interface SnapshotAsset {
  symbol: string;
  exchange: string;
  base: number;
  drift: number;
  wave: number;
  volume: number;
}

export interface SnapshotSuite {
  version: number;
  count: number;
  timeframes: string[];
  riskModes: string[];
  assets: SnapshotAsset[];
}

export function intervalSeconds(timeframe: string): number {
  if (timeframe === "15m") return 900;
  if (timeframe === "1h") return 3600;
  return 86400;
}

/**
 * Swift: the candle builder inside `fullSnapshotGolden…`. Two sine waves plus a linear
 * drift, with the open offset by a third sine so bodies alternate direction.
 */
export function candlesForAsset(asset: SnapshotAsset, timeframe: string, count: number): Candle[] {
  const interval = intervalSeconds(timeframe);
  const candles: Candle[] = [];

  for (let index = 0; index < count; index += 1) {
    const close =
      asset.base +
      asset.drift * index +
      Math.sin(index / 7.0) * asset.wave +
      Math.sin(index / 19.0) * asset.wave * 0.35;
    const spread = Math.max(Math.abs(close) * 0.0025, asset.wave * 0.08);
    const open = close - Math.sin(index / 3.0) * spread * 0.25;

    candles.push({
      openTime: FIXTURE_BASE_UNIX + index * interval,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: asset.volume * (1 + (index % 11) * 0.03)
    });
  }

  return candles;
}

/** Swift: the `MarketNewsDigest` fixture attached to every snapshot case. */
export function newsFixture(symbol: string): MarketNewsDigest {
  return {
    query: symbol,
    lookbackDays: 7,
    fetchedAt: FIXTURE_BASE_UNIX,
    summary: null,
    errorMessage: null,
    items: [
      { title: "Market rally extends", url: "", source: "fixture", publishedAt: null, snippet: null, tone: 0.5 },
      { title: "Investors assess risk", url: "", source: "fixture", publishedAt: null, snippet: null, tone: -0.1 }
    ]
  };
}

export function macroFixture(): MacroCalendarDigest {
  return {
    fetchedAt: FIXTURE_BASE_UNIX,
    currencies: ["USD"],
    lookaheadDays: 7,
    source: "fixture",
    errorMessage: null,
    events: []
  };
}

/** Only BTCUSDT carries derivatives data in the fixture. */
export function derivativesFixture(symbol: string): DerivativesDigest | null {
  if (symbol !== "BTCUSDT") return null;
  return {
    fetchedAt: FIXTURE_BASE_UNIX,
    source: "fixture",
    errorMessage: null,
    fundingRate: 0.0004,
    fundingRateNextAt: null,
    openInterest: null,
    openInterestChange24h: 6,
    longShortRatio: 1.2,
    longAccountPct: 0.55,
    shortAccountPct: null
  };
}
