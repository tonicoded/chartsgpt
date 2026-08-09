/**
 * Deterministic candlestick and chart-pattern detection — port of
 * `detectDeterministicPatterns` in `ChartGPT/MarketAnalysisEngine.swift` (lines ~9517-9672).
 *
 * "Deterministic" is the point: these are computed from the candles, never guessed by the
 * model, so the same chart always yields the same pattern list.
 */

import { maxOf, minOf, suffix, sum } from "./swift";
import type { Candle, SwingPoint } from "./types";

const body = (c: Candle): number => Math.abs(c.close - c.open);
const range = (c: Candle): number => Math.max(c.high - c.low, 0.0000001);
const upperWick = (c: Candle): number => c.high - Math.max(c.open, c.close);
const lowerWick = (c: Candle): number => Math.min(c.open, c.close) - c.low;
const isBull = (c: Candle): boolean => c.close > c.open;
const isBear = (c: Candle): boolean => c.close < c.open;
const bodyMid = (c: Candle): number => (c.open + c.close) / 2.0;

/** Swift: `detectDeterministicPatterns(candles:swingPoints:)`. */
export function detectDeterministicPatterns(
  candles: readonly Candle[],
  swingPointsList: readonly SwingPoint[]
): string[] {
  if (candles.length < 4) return [];
  const patterns: string[] = [];

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles.length >= 3 ? candles[candles.length - 3] : prev;

  const recent = suffix(candles, 20);
  const avgRange = Math.max(sum(recent.map(range)) / Math.max(recent.length, 1), 0.0000001);
  const avgBody = Math.max(sum(recent.map(body)) / Math.max(recent.length, 1), 0.0000001);
  const lastClose = Math.max(last.close, 0.0000001);
  const levelTolerance = Math.max(0.0035, Math.min(0.012, (avgRange / lastClose) * 0.75));
  const prominenceReq = Math.max(0.006, Math.min(0.025, (avgRange / lastClose) * 1.1));

  if (
    isBear(prev) &&
    isBull(last) &&
    last.open <= prev.close &&
    last.close >= prev.open &&
    body(last) >= avgBody * 0.8
  ) {
    patterns.push("Bullish engulfing");
  }
  if (
    isBull(prev) &&
    isBear(last) &&
    last.open >= prev.close &&
    last.close <= prev.open &&
    body(last) >= avgBody * 0.8
  ) {
    patterns.push("Bearish engulfing");
  }

  const dojiBodyRatio = body(last) / range(last);
  if (dojiBodyRatio <= 0.12) {
    patterns.push("Doji candle");
  }

  if (candles.length >= 3) {
    const morningStar =
      isBear(prev2) &&
      body(prev2) >= avgBody * 0.8 &&
      body(prev) <= avgBody * 0.55 &&
      isBull(last) &&
      last.close >= bodyMid(prev2);
    if (morningStar) patterns.push("Morning star");

    const eveningStar =
      isBull(prev2) &&
      body(prev2) >= avgBody * 0.8 &&
      body(prev) <= avgBody * 0.55 &&
      isBear(last) &&
      last.close <= bodyMid(prev2);
    if (eveningStar) patterns.push("Evening star");
  }

  const lastBody = Math.max(body(last), 0.0000001);
  const lastUpper = upperWick(last);
  const lastLower = lowerWick(last);
  if (lastLower >= lastBody * 2.0 && lastUpper <= lastBody * 0.8) {
    patterns.push("Hammer-like rejection candle");
  }
  if (lastUpper >= lastBody * 2.0 && lastLower <= lastBody * 0.8) {
    patterns.push("Shooting-star-like rejection candle");
  }

  const clampedCandleSlice = (startIndex: number, endIndex: number): Candle[] | null => {
    if (candles.length === 0) return null;
    const lo = Math.max(0, Math.min(startIndex, endIndex));
    const hi = Math.min(candles.length - 1, Math.max(startIndex, endIndex));
    if (lo > hi) return null;
    return candles.slice(lo, hi + 1);
  };

  const highs = suffix(swingPointsList.filter((point) => point.kind === "high"), 8);
  if (highs.length >= 2) {
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    const avg = Math.max((a.price + b.price) / 2.0, 0.000001);
    const similarity = Math.abs(a.price - b.price) / avg;
    if (similarity <= levelTolerance) {
      const start = Math.min(a.index, b.index);
      const end = Math.max(a.index, b.index);
      const slice = clampedCandleSlice(start, end);
      const midLow = slice === null ? avg : minOf(slice.map((c) => c.low)) ?? avg;
      if ((avg - midLow) / avg >= prominenceReq && last.close < midLow * (1.0 - levelTolerance * 0.5)) {
        patterns.push("Double top");
      }
    }
  }

  const lows = suffix(swingPointsList.filter((point) => point.kind === "low"), 8);
  if (lows.length >= 2) {
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    const avg = Math.max((a.price + b.price) / 2.0, 0.000001);
    const similarity = Math.abs(a.price - b.price) / avg;
    if (similarity <= levelTolerance) {
      const start = Math.min(a.index, b.index);
      const end = Math.max(a.index, b.index);
      const slice = clampedCandleSlice(start, end);
      const midHigh = slice === null ? avg : maxOf(slice.map((c) => c.high)) ?? avg;
      if ((midHigh - avg) / avg >= prominenceReq && last.close > midHigh * (1.0 + levelTolerance * 0.5)) {
        patterns.push("Double bottom");
      }
    }
  }

  if (highs.length >= 3) {
    const recentHighs = suffix(highs, 3);
    const a = recentHighs[0];
    const b = recentHighs[1];
    const c = recentHighs[2];
    const shoulderSimilarity = Math.abs(a.price - c.price) / Math.max((a.price + c.price) / 2.0, 0.000001);
    const headProminence = (b.price - Math.max(a.price, c.price)) / Math.max(b.price, 0.000001);
    const start = Math.min(a.index, c.index);
    const end = Math.max(a.index, c.index);
    const slice = clampedCandleSlice(start, end);
    const neckline =
      slice === null ? Math.min(a.price, c.price) : minOf(slice.map((x) => x.low)) ?? Math.min(a.price, c.price);
    if (
      b.price > a.price &&
      b.price > c.price &&
      shoulderSimilarity <= Math.max(levelTolerance * 1.8, 0.006) &&
      headProminence >= prominenceReq &&
      last.close < neckline * (1.0 - levelTolerance * 0.4)
    ) {
      patterns.push("Head and shoulders");
    }
  }

  if (lows.length >= 3) {
    const recentLows = suffix(lows, 3);
    const a = recentLows[0];
    const b = recentLows[1];
    const c = recentLows[2];
    const shoulderSimilarity = Math.abs(a.price - c.price) / Math.max((a.price + c.price) / 2.0, 0.000001);
    const headProminence =
      (Math.min(a.price, c.price) - b.price) / Math.max(Math.min(a.price, c.price), 0.000001);
    const start = Math.min(a.index, c.index);
    const end = Math.max(a.index, c.index);
    const slice = clampedCandleSlice(start, end);
    const neckline =
      slice === null ? Math.max(a.price, c.price) : maxOf(slice.map((x) => x.high)) ?? Math.max(a.price, c.price);
    if (
      b.price < a.price &&
      b.price < c.price &&
      shoulderSimilarity <= Math.max(levelTolerance * 1.8, 0.006) &&
      headProminence >= prominenceReq &&
      last.close > neckline * (1.0 + levelTolerance * 0.4)
    ) {
      patterns.push("Inverse head and shoulders");
    }
  }

  if (highs.length >= 3 && lows.length >= 3) {
    const recentHighs = suffix(highs, 3);
    const recentLows = suffix(lows, 3);
    const high0 = recentHighs[0].price;
    const high2 = recentHighs[2].price;
    const low0 = recentLows[0].price;
    const low2 = recentLows[2].price;

    const highsFlat = Math.abs(high0 - high2) / Math.max((high0 + high2) / 2.0, 0.000001) <= levelTolerance;
    const lowsFlat = Math.abs(low0 - low2) / Math.max((low0 + low2) / 2.0, 0.000001) <= levelTolerance;
    const lowsRising = low2 > low0;
    const highsFalling = high2 < high0;

    if (highsFlat && lowsRising && last.close < Math.max(high0, high2) * (1.0 - levelTolerance * 0.3)) {
      patterns.push("Ascending triangle");
    }
    if (lowsFlat && highsFalling && last.close > Math.min(low0, low2) * (1.0 + levelTolerance * 0.3)) {
      patterns.push("Descending triangle");
    }
  }

  // Swift wraps the result in NSOrderedSet: de-duplicate, keeping first occurrence.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const pattern of patterns) {
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    unique.push(pattern);
  }
  return unique;
}
