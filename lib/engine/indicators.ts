/**
 * Technical indicators — a line-for-line port of the indicator section of
 * `ChartGPT/MarketAnalysisEngine.swift` (lines ~7292-7640).
 *
 * Every guard, warm-up length and smoothing constant is reproduced exactly, including
 * the ones that look like quirks: the engine's downstream labels are threshold-based, so
 * an off-by-one warm-up silently flips a "Trending up" into a "Range" and the golden
 * snapshots stop matching.
 */

import type {
  ADXPack,
  BollingerPack,
  Candle,
  OBVPack,
  StochasticPack,
  SwingPoint,
  TimeframeKind,
  VolatilityRegime
} from "./types";
import { dropFirst, last, prefix, rounded, sortedAscending, suffix, sum } from "./swift";

// MARK: - Moving averages

/** Swift: `ema(values:period:)`. Seeds with an SMA of the first `period` values. */
export function ema(values: readonly number[], period: number): number[] {
  if (!(period > 1) || values.length < period) return [];
  const k = 2.0 / (period + 1);
  const result: number[] = [];

  const start = sum(prefix(values, period)) / period;
  let prev = start;
  result.push(prev);

  for (const value of dropFirst(values, period)) {
    prev = (value - prev) * k + prev;
    result.push(prev);
  }
  return result;
}

/** Swift: `rsi(closes:period:)`. Wilder smoothing after the initial average. */
export function rsi(closes: readonly number[], period: number): number[] {
  if (!(period > 1) || closes.length < period + 1) return [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += -delta;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const rsiValue = (gain: number, loss: number): number => {
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  };

  const result: number[] = [];
  result.push(rsiValue(avgGain, avgLoss));

  if (closes.length <= period + 1) return result;

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(rsiValue(avgGain, avgLoss));
  }

  return result;
}

/** Swift: `atr(candles:period:)`. Wilder-smoothed true range. */
export function atr(candles: readonly Candle[], period: number): number[] {
  if (!(period > 1) || candles.length < period + 1) return [];

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return [];

  const result: number[] = [];
  let prevAtr = sum(prefix(trueRanges, period)) / period;
  result.push(prevAtr);

  if (trueRanges.length === period) return result;

  for (const tr of dropFirst(trueRanges, period)) {
    prevAtr = (prevAtr * (period - 1) + tr) / period;
    result.push(prevAtr);
  }
  return result;
}

export interface MACDPack {
  macd: number[];
  signal: number[];
  histogram: number[];
}

/** Swift: `macd(closes:)`. Fixed 12/26/9, requires 35 closes. */
export function macd(closes: readonly number[]): MACDPack {
  if (closes.length < 35) return { macd: [], signal: [], histogram: [] };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  if (ema12.length === 0 || ema26.length === 0) return { macd: [], signal: [], histogram: [] };

  const count = Math.min(ema12.length, ema26.length);
  if (!(count > 0)) return { macd: [], signal: [], histogram: [] };

  const tail12 = suffix(ema12, count);
  const tail26 = suffix(ema26, count);
  const macdLine = tail12.map((value, index) => value - tail26[index]);
  const signalLine = ema(macdLine, 9);
  if (signalLine.length === 0) return { macd: macdLine, signal: [], histogram: [] };

  const histCount = Math.min(macdLine.length, signalLine.length);
  const macdTail = suffix(macdLine, histCount);
  const signalTail = suffix(signalLine, histCount);
  const histogram = macdTail.map((value, index) => value - signalTail[index]);
  return { macd: macdTail, signal: signalTail, histogram };
}

// MARK: - Bands and oscillators

/** Swift: `bollingerBands(closes:period:stdevMultiplier:)`. Population stdev over the last `period`. */
export function bollingerBands(
  closes: readonly number[],
  period: number,
  stdevMultiplier: number
): BollingerPack {
  const empty: BollingerPack = { middle: null, upper: null, lower: null, widthPct: null };
  if (!(period > 1) || closes.length < period) return empty;

  const window = suffix(closes, period);
  const meanValue = sum(window) / period;
  if (!Number.isFinite(meanValue) || meanValue === 0) return empty;

  let accumulator = 0;
  for (const value of window) {
    const diff = value - meanValue;
    accumulator += diff * diff;
  }
  const variance = accumulator / period;
  const stdev = Math.sqrt(Math.max(0, variance));

  const upper = meanValue + stdevMultiplier * stdev;
  const lower = meanValue - stdevMultiplier * stdev;
  const widthPct = ((upper - lower) / Math.abs(meanValue)) * 100.0;
  return { middle: meanValue, upper, lower, widthPct };
}

/**
 * Swift: `stochasticOscillator(candles:period:smoothing:)`.
 *
 * Note this walks BACKWARDS from the last candle, so `k` is the most recent %K and `d`
 * averages the last `smoothing` values — not the textbook forward-rolling formulation.
 */
export function stochasticOscillator(
  candles: readonly Candle[],
  period: number,
  smoothing: number
): StochasticPack {
  if (!(period > 1) || !(smoothing > 0) || candles.length < period) return { k: null, d: null };

  const lastIndex = candles.length - 1;
  const kValues: number[] = [];

  for (let offset = 0; offset < smoothing; offset += 1) {
    const index = lastIndex - offset;
    const start = index - (period - 1);
    if (start < 0) break;
    const window = candles.slice(start, index + 1);
    if (window.length === 0) continue;
    let high = window[0].high;
    let low = window[0].low;
    for (const candle of window) {
      if (candle.high > high) high = candle.high;
      if (candle.low < low) low = candle.low;
    }
    const denom = Math.max(0.0000001, high - low);
    const k = ((candles[index].close - low) / denom) * 100.0;
    kValues.push(k);
  }

  const k = kValues.length === 0 ? null : kValues[0];
  const d = kValues.length === 0 ? null : sum(kValues) / kValues.length;
  return { k, d };
}

/** Swift: `adx(candles:period:)`. Wilder's directional movement index. */
export function adx(candles: readonly Candle[], period: number): ADXPack {
  if (!(period > 1) || candles.length < period * 2 + 1) {
    return { adx: null, plusDI: null, minusDI: null };
  }

  const trs: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    const pdm = upMove > downMove && upMove > 0 ? upMove : 0;
    const mdm = downMove > upMove && downMove > 0 ? downMove : 0;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
    plusDM.push(pdm);
    minusDM.push(mdm);
  }

  const di = (dm: number, tr: number): number => {
    if (!(tr > 0)) return 0;
    return (dm / tr) * 100.0;
  };

  let trSmooth = sum(prefix(trs, period));
  let plusSmooth = sum(prefix(plusDM, period));
  let minusSmooth = sum(prefix(minusDM, period));

  let plusDI = di(plusSmooth, trSmooth);
  let minusDI = di(minusSmooth, trSmooth);

  const dx = (plus: number, minus: number): number => {
    const denom = plus + minus;
    if (!(denom > 0)) return 0;
    return (Math.abs(plus - minus) / denom) * 100.0;
  };

  const dxValues: number[] = [];
  dxValues.push(dx(plusDI, minusDI));

  if (trs.length > period) {
    for (let i = period; i < trs.length; i += 1) {
      trSmooth = trSmooth - trSmooth / period + trs[i];
      plusSmooth = plusSmooth - plusSmooth / period + plusDM[i];
      minusSmooth = minusSmooth - minusSmooth / period + minusDM[i];

      plusDI = di(plusSmooth, trSmooth);
      minusDI = di(minusSmooth, trSmooth);
      dxValues.push(dx(plusDI, minusDI));
    }
  }

  if (dxValues.length < period) {
    return { adx: null, plusDI, minusDI };
  }

  let adxValue = sum(prefix(dxValues, period)) / period;
  if (dxValues.length > period) {
    for (const value of dropFirst(dxValues, period)) {
      adxValue = (adxValue * (period - 1) + value) / period;
    }
  }

  return { adx: adxValue, plusDI, minusDI };
}

/** Swift: `obv(candles:lookback:)`. Returns the running OBV and its change over `lookback` bars. */
export function obv(candles: readonly Candle[], lookback: number): OBVPack {
  if (candles.length < 2) return { obv: null, delta: null };

  const series: number[] = [];
  let value = 0;
  series.push(value);

  for (let i = 1; i < candles.length; i += 1) {
    const prevClose = candles[i - 1].close;
    const close = candles[i].close;
    if (close > prevClose) value += candles[i].volume;
    else if (close < prevClose) value -= candles[i].volume;
    series.push(value);
  }

  const lastValue = last(series);
  const index = Math.max(0, series.length - 1 - Math.max(0, lookback));
  const delta = (lastValue ?? 0) - series[index];
  return { obv: lastValue, delta };
}

/** Swift: `roc(values:period:)`. Rate of change in percent. */
export function roc(values: readonly number[], period: number): number[] {
  if (!(period > 1) || values.length <= period) return [];
  const result: number[] = [];
  for (let i = period; i < values.length; i += 1) {
    const prev = values[i - period];
    if (prev === 0) continue;
    result.push(((values[i] - prev) / prev) * 100.0);
  }
  return result;
}

// MARK: - Volatility regime

/** Swift: `atrPctSeries(candles:period:)`. ATR expressed as a percentage of close, aligned to the close tail. */
export function atrPctSeries(candles: readonly Candle[], period: number): number[] {
  const atrSeries = atr(candles, period);
  if (atrSeries.length === 0) return [];
  const closes = candles.map((candle) => candle.close);
  const count = Math.min(atrSeries.length, closes.length);
  const atrTail = suffix(atrSeries, count);
  const closeTail = suffix(closes, count);

  const result: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const close = closeTail[i];
    if (!(close > 0)) continue;
    result.push((atrTail[i] / close) * 100.0);
  }
  return result;
}

/** Swift: `volatilityRegimeLabel(currentATRpct:history:)`. Percentile rank of current ATR%. */
export function volatilityRegimeLabel(
  currentATRpct: number | null,
  history: readonly number[]
): VolatilityRegime | null {
  if (currentATRpct === null) return null;
  if (!Number.isFinite(currentATRpct) || !(currentATRpct > 0) || history.length < 40) return null;

  const sorted = sortedAscending(history.filter((value) => Number.isFinite(value) && value > 0));
  if (sorted.length < 2) return null;

  let rank = 0;
  for (const value of sorted) rank += value <= currentATRpct ? 1 : 0;
  const percentile = rounded((rank / Math.max(sorted.length, 1)) * 100.0);

  let label: string;
  if (percentile >= 80) label = "High";
  else if (percentile <= 30) label = "Low";
  else label = "Normal";
  return { label, percentile };
}

// MARK: - Regression

/** Swift: `linearRegression(values:)`. Returns intercept `a` and slope `b`, or null. */
export function linearRegression(values: readonly number[]): { a: number; b: number } | null {
  const n = values.length;
  if (n < 2) return null;

  const xMean = (n - 1) / 2.0;
  const yMean = sum(values) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i;
    num += (x - xMean) * (values[i] - yMean);
    den += (x - xMean) * (x - xMean);
  }
  if (den === 0) return null;
  const b = num / den;
  const a = yMean - b * xMean;
  return { a, b };
}

/** Swift: `linearRegressionSlope(values:)`. Needs at least 3 points and a positive denominator. */
export function linearRegressionSlope(values: readonly number[]): number | null {
  const n = values.length;
  if (n < 3) return null;

  const xMean = (n - 1) / 2.0;
  const yMean = sum(values) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    numerator += dx * (values[i] - yMean);
    denominator += dx * dx;
  }
  if (!(denominator > 0)) return null;
  return numerator / denominator;
}

/**
 * Swift: `calculateTrendStrength(closes:ema20:ema50:)`.
 * Signed -1…1: magnitude from the log-price regression slope, sign from EMA alignment.
 */
export function calculateTrendStrength(
  closes: readonly number[],
  ema20: number | null,
  ema50: number | null
): number | null {
  if (closes.length < 60) return null;

  const lookback = Math.min(120, Math.max(60, closes.length));
  const recent = suffix(closes, lookback).filter((value) => Number.isFinite(value) && value > 0);
  if (recent.length < 50) return null;

  const logValues = recent.map((value) => Math.log(value));
  const slope = linearRegressionSlope(logValues);
  if (slope === null) return null;

  const slopeStrength = Math.min(Math.abs(slope) * 200.0, 1.0);
  let alignment: number;
  if (ema20 !== null && ema50 !== null) {
    alignment = ema20 >= ema50 ? 1.0 : -1.0;
  } else {
    alignment = slope >= 0 ? 1.0 : -1.0;
  }
  return alignment * slopeStrength;
}

// MARK: - Swing points

/** Swift: `swingPoints(candles:timeframeKind:)`. Fractal pivots, most recent 24 kept. */
export function swingPoints(
  candles: readonly Candle[],
  timeframeKind: TimeframeKind
): SwingPoint[] {
  let radius: number;
  switch (timeframeKind) {
    case "intraday":
      radius = 2;
      break;
    case "daily":
      radius = 3;
      break;
    default:
      radius = 4;
      break;
  }
  if (!(candles.length > radius * 2 + 10)) return [];

  const points: SwingPoint[] = [];
  for (let i = radius; i < candles.length - radius; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - radius; j <= i + radius; j += 1) {
      if (j === i) continue;
      if (candles[j].high > high) isHigh = false;
      if (candles[j].low < low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) points.push({ index: i, kind: "high", price: high });
    if (isLow) points.push({ index: i, kind: "low", price: low });
  }

  // Keep the most recent swings.
  return suffix(points, 24);
}
