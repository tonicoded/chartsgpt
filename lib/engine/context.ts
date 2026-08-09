/**
 * Contextual overlays — port of `anchoredVWAPPack`, `regressionChannelPack`,
 * `divergenceSignals` and `fibonacciPackage` in `ChartGPT/MarketAnalysisEngine.swift`.
 *
 * These produce the "AVWAP: …", "Regression: …", "Fib …" and divergence lines on the
 * result screen, and the fib levels feed `mergeKeyLevels` as extra levels.
 */

import { formatCompact, formatPrice, roundToStep, roundingStep } from "./format";
import { linearRegression } from "./indicators";
import { dropLast, suffix, sum } from "./swift";
import type { Candle, KeyLevel, SwingPoint, TimeframeKind } from "./types";

export interface AVWAPPack {
  vwap: number | null;
  upper1: number | null;
  lower1: number | null;
  anchorLabel: string;
}

/**
 * Swift: `anchoredVWAPPack(candles:volumes:currentPrice:regimeLabel:structure:swingPoints:)`.
 *
 * Anchors to the most recent swing low in a bullish read and the most recent swing high in
 * a bearish one. Zero-volume instruments (FX via Yahoo) fall back to a weight of 1 per bar,
 * which turns this into a plain typical-price average rather than disabling it.
 */
export function anchoredVWAPPack(
  candles: readonly Candle[],
  volumes: readonly number[],
  currentPrice: number,
  regimeLabel: string,
  structure: string,
  swingPointsList: readonly SwingPoint[]
): AVWAPPack | null {
  if (candles.length < 50 || volumes.length !== candles.length) return null;
  const lowerRegime = regimeLabel.toLowerCase();
  const lowerStructure = structure.toLowerCase();
  const preferHigh = lowerRegime.includes("bear") || lowerStructure.includes("lower highs");

  let candidate: SwingPoint | null = null;
  for (let i = swingPointsList.length - 1; i >= 0; i -= 1) {
    const point = swingPointsList[i];
    if (preferHigh ? point.kind === "high" : point.kind === "low") {
      candidate = point;
      break;
    }
  }
  const anchorIndex = candidate?.index ?? Math.max(0, candles.length - 60);

  let sumPV = 0;
  let sumV = 0;
  for (let i = anchorIndex; i < candles.length; i += 1) {
    const candle = candles[i];
    const typical = (candle.high + candle.low + candle.close) / 3.0;
    const v = Math.max(0.0, volumes[i]);
    const weight = v > 0 ? v : 1.0;
    sumPV += typical * weight;
    sumV += weight;
  }
  if (!(sumV > 0)) return null;
  const vwap = sumPV / sumV;

  const closes = candles.slice(anchorIndex).map((candle) => candle.close);
  const diffs = closes.map((close) => close - vwap);
  let squared = 0;
  for (const diff of diffs) squared += diff * diff;
  const variance = squared / Math.max(diffs.length, 1);
  const stdev = Math.sqrt(Math.max(variance, 0));
  const upper1 = vwap + stdev;
  const lower1 = Math.max(0.0000001, vwap - stdev);

  const anchorPrice = candidate?.price ?? currentPrice;
  const label = `${preferHigh ? "anchor: swing high" : "anchor: swing low"} @ ${formatCompact(anchorPrice)}`;
  return { vwap, upper1, lower1, anchorLabel: label };
}

export interface RegressionChannelPack {
  mid: number;
  upper: number;
  lower: number;
  positionLabel: string;
  slopePctPerBar: number | null;
}

/**
 * Swift: `regressionChannelPack(closes:currentPrice:timeframeKind:)`.
 * Regression is run on LOG prices, so the channel is multiplicative and the slope reads
 * as a percentage per bar.
 */
export function regressionChannelPack(
  closes: readonly number[],
  currentPrice: number,
  timeframeKind: TimeframeKind
): RegressionChannelPack | null {
  let lookback: number;
  switch (timeframeKind) {
    case "intraday":
      lookback = 160;
      break;
    case "daily":
      lookback = 220;
      break;
    case "weekly":
      lookback = 180;
      break;
    default:
      lookback = 160;
      break;
  }
  const recent = suffix(closes, Math.min(lookback, closes.length)).filter(
    (value) => Number.isFinite(value) && value > 0
  );
  if (recent.length < 80) return null;

  const y = recent.map((value) => Math.log(value));
  const regression = linearRegression(y);
  if (regression === null) return null;
  const { a, b } = regression;

  const n = y.length;
  const lastX = n - 1;
  const midLog = a + b * lastX;
  const residuals = y.map((value, idx) => value - (a + b * idx));
  const meanResidual = sum(residuals) / residuals.length;
  let squared = 0;
  for (const value of residuals) {
    const diff = value - meanResidual;
    squared += diff * diff;
  }
  const variance = squared / residuals.length;
  const stdev = Math.sqrt(Math.max(variance, 0));

  const k = 1.6;
  const upper = Math.exp(midLog + k * stdev);
  const lower = Math.exp(midLog - k * stdev);
  const mid = Math.exp(midLog);

  let positionLabel: string;
  if (currentPrice >= upper) positionLabel = "Above regression upper channel";
  else if (currentPrice <= lower) positionLabel = "Below regression lower channel";
  else if (currentPrice >= mid) positionLabel = "Above regression midline";
  else positionLabel = "Below regression midline";

  const slopePctPerBar = (Math.exp(b) - 1.0) * 100.0;
  return { mid, upper, lower, positionLabel, slopePctPerBar };
}

/**
 * Swift: `divergenceSignals(candles:rsiSeries:swingPoints:)`.
 * Compares the last two swing lows / highs against RSI at the same bars, requiring a
 * 2.5-point RSI gap before calling a divergence.
 */
export function divergenceSignals(
  candles: readonly Candle[],
  rsiSeries: readonly number[],
  swingPointsList: readonly SwingPoint[]
): string[] {
  if (candles.length < 80 || rsiSeries.length < 20) return [];
  const lastIndex = candles.length - 1;

  const lows = suffix(swingPointsList.filter((point) => point.kind === "low"), 6);
  const highs = suffix(swingPointsList.filter((point) => point.kind === "high"), 6);

  // The RSI series is shorter than the candle series; align by its tail offset.
  const rsiAt = (candleIndex: number): number | null => {
    const offset = candles.length - rsiSeries.length;
    const idx = candleIndex - offset;
    if (idx < 0 || idx >= rsiSeries.length) return null;
    return rsiSeries[idx];
  };

  const signals: string[] = [];

  if (lows.length >= 2) {
    const dropped = dropLast(lows);
    const a = dropped.length === 0 ? null : dropped[dropped.length - 1];
    const b = lows[lows.length - 1];
    if (a !== null && a.index < lastIndex && b.index < lastIndex) {
      const rsiA = rsiAt(a.index);
      const rsiB = rsiAt(b.index);
      if (rsiA !== null && rsiB !== null && b.price < a.price && rsiB > rsiA + 2.5) {
        signals.push("Bullish RSI divergence");
      }
    }
  }

  if (highs.length >= 2) {
    const dropped = dropLast(highs);
    const a = dropped.length === 0 ? null : dropped[dropped.length - 1];
    const b = highs[highs.length - 1];
    if (a !== null && a.index < lastIndex && b.index < lastIndex) {
      const rsiA = rsiAt(a.index);
      const rsiB = rsiAt(b.index);
      if (rsiA !== null && rsiB !== null && b.price > a.price && rsiB < rsiA - 2.5) {
        signals.push("Bearish RSI divergence");
      }
    }
  }

  return signals;
}

export interface FibonacciPackage {
  labels: string[];
  keyLevels: KeyLevel[];
  extensionLevels: KeyLevel[];
  confluence: string[];
}

/**
 * Swift: `fibonacciPackage(candles:currentPrice:timeframeKind:)`.
 *
 * Retracements are always measured down from the swing high. Extensions project from
 * whichever end of the range price is closer to, and negative projections are dropped
 * because spot instruments cannot trade below zero.
 */
export function fibonacciPackage(
  candles: readonly Candle[],
  currentPrice: number,
  timeframeKind: TimeframeKind
): FibonacciPackage {
  const empty: FibonacciPackage = { labels: [], keyLevels: [], extensionLevels: [], confluence: [] };
  if (candles.length < 60) return empty;

  let lookback: number;
  switch (timeframeKind) {
    case "intraday":
      lookback = 80;
      break;
    case "daily":
      lookback = 120;
      break;
    case "weekly":
      lookback = 160;
      break;
    default:
      lookback = 200;
      break;
  }
  const recent = suffix(candles, Math.min(lookback, candles.length));

  let swingHigh = currentPrice;
  let swingLow = currentPrice;
  if (recent.length > 0) {
    swingHigh = recent[0].high;
    swingLow = recent[0].low;
    for (const candle of recent) {
      if (candle.high > swingHigh) swingHigh = candle.high;
      if (candle.low < swingLow) swingLow = candle.low;
    }
  }
  const range = swingHigh - swingLow;
  if (!(range > 0)) return empty;

  const retracements: Array<{ name: string; factor: number }> = [
    { name: "23.6%", factor: 0.236 },
    { name: "38.2%", factor: 0.382 },
    { name: "50.0%", factor: 0.5 },
    { name: "61.8%", factor: 0.618 },
    { name: "78.6%", factor: 0.786 }
  ];

  const retracementPrices = retracements.map((item) => ({
    name: item.name,
    raw: swingHigh - range * item.factor
  }));

  const labels: string[] = [];
  const keyLevels: KeyLevel[] = [];

  const rounding = roundingStep(currentPrice);
  for (const { name, raw } of retracementPrices) {
    const price = roundToStep(raw, rounding);
    if (price <= 0) continue;
    labels.push(`Fib ${name}: ${formatPrice(price)}`);
    keyLevels.push({
      price: formatPrice(price),
      kind: price <= currentPrice ? "support" : "resistance",
      note: `Fib retracement ${name}`
    });
  }

  const confluence: string[] = [];
  const tolerance = 0.008;
  for (const { name, raw } of retracementPrices) {
    const diff = Math.abs(currentPrice - raw) / Math.max(currentPrice, 0.000001);
    if (diff <= tolerance) {
      confluence.push(`Near Fib ${name} (${formatPrice(roundToStep(raw, rounding))})`);
      break;
    }
  }

  const extensions: Array<{ name: string; factor: number }> = [
    { name: "127.2%", factor: 0.272 },
    { name: "138.2%", factor: 0.382 },
    { name: "161.8%", factor: 0.618 },
    { name: "200.0%", factor: 1.0 },
    { name: "261.8%", factor: 1.618 }
  ];

  const midpoint = (swingHigh + swingLow) / 2.0;
  const isBullish = currentPrice > midpoint;
  const base = isBullish ? swingHigh : swingLow;

  const extensionLevels: KeyLevel[] = [];
  for (const item of extensions) {
    const raw = isBullish ? base + range * item.factor : base - range * item.factor;
    const price = roundToStep(raw, rounding);
    // Crypto/FX spot cannot go below zero; negative extension levels are not actionable.
    if (price <= 0) continue;
    extensionLevels.push({
      price: formatPrice(price),
      kind: isBullish ? "resistance" : "support",
      note: `Fib extension ${item.name}`
    });
  }

  return { labels, keyLevels, extensionLevels, confluence };
}
