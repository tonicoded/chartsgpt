/**
 * Confluence, indicator readouts, bias and risk notes — port of `buildSignals` in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines ~8972-9515).
 *
 * This is what fills the "Indicators" and "Confluence" sections of the result screen, and
 * it computes the bullish/bearish/neutral bias split that the probability layer and the
 * setup filters both read.
 *
 * The bias block at the bottom is a long sequence of clamps applied IN ORDER — each one
 * reads the values the previous one wrote. Reordering them changes the result even though
 * every individual rule looks independent.
 */

import { formatCompact } from "./format";
import { detectDeterministicPatterns } from "./patterns";
import { formatF, formatSignedF, prefix, rounded, suffix, sum, toInt } from "./swift";
import type {
  ADXPack,
  Bias,
  BollingerPack,
  Candle,
  IndicatorSelection,
  KeyLevel,
  OBVPack,
  SwingPoint,
  VolatilityRegime
} from "./types";
import type { AVWAPPack, RegressionChannelPack } from "./context";
import type { MarketStructureLayer } from "./structure";

export interface BuildSignalsInput {
  regimeLabel: string;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  stochK: number | null;
  stochD: number | null;
  atr14: number | null;
  volatilityPct: number | null;
  volatilityRegime: VolatilityRegime | null;
  trendStrength: number | null;
  structure: string;
  candles: readonly Candle[];
  levels: readonly KeyLevel[];
  fibConfluence: readonly string[];
  bollinger: BollingerPack;
  adx: ADXPack;
  obv: OBVPack;
  avwap: AVWAPPack | null;
  roc14: number | null;
  regressionChannel: RegressionChannelPack | null;
  divergenceSignals: readonly string[];
  structureLayer: MarketStructureLayer;
  swingPoints: readonly SwingPoint[];
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  indicatorSelection: IndicatorSelection;
}

export interface BuildSignalsResult {
  confluence: string[];
  indicators: string[];
  bias: Bias | null;
  riskNotes: string[];
}

const BEARISH_PATTERNS = new Set([
  "Descending triangle",
  "Head and shoulders",
  "Double top",
  "Bearish engulfing",
  "Evening star",
  "Shooting-star-like rejection candle"
]);

const BULLISH_PATTERNS = new Set([
  "Ascending triangle",
  "Inverse head and shoulders",
  "Double bottom",
  "Bullish engulfing",
  "Morning star",
  "Hammer-like rejection candle"
]);

/** Swift: `buildSignals(...)`. */
export function buildSignals(input: BuildSignalsInput): BuildSignalsResult {
  const {
    regimeLabel,
    ema20,
    ema50,
    ema200,
    rsi14,
    stochK,
    stochD,
    atr14,
    volatilityPct,
    volatilityRegime,
    trendStrength,
    structure,
    candles,
    fibConfluence,
    bollinger,
    adx,
    obv,
    avwap,
    roc14,
    regressionChannel,
    divergenceSignals,
    structureLayer,
    swingPoints,
    macd,
    macdSignal,
    macdHist,
    indicatorSelection
  } = input;

  const confluence: string[] = [];
  const indicators: string[] = [];
  const riskNotes: string[] = [];

  const lastCandle = candles.length === 0 ? null : candles[candles.length - 1];
  const lastCloseOrNull = lastCandle?.close ?? null;

  if (indicatorSelection.emaTrend && ema20 !== null && ema50 !== null) {
    confluence.push(ema20 >= ema50 ? "EMA20 above EMA50" : "EMA20 below EMA50");
    indicators.push(`EMA20: ${formatCompact(ema20)} • EMA50: ${formatCompact(ema50)}`);
  }

  if (indicatorSelection.emaTrend && ema200 !== null && lastCloseOrNull !== null) {
    confluence.push(lastCloseOrNull >= ema200 ? "Price above EMA200" : "Price below EMA200");
    indicators.push(`EMA200: ${formatCompact(ema200)}`);
  }

  if (indicatorSelection.rsi && rsi14 !== null) {
    let state: string;
    if (rsi14 >= 68) state = "overbought";
    else if (rsi14 <= 32) state = "oversold";
    else if (rsi14 > 55) state = "bullish";
    else if (rsi14 < 45) state = "bearish";
    else state = "neutral";
    if (state !== "neutral") {
      confluence.push(`RSI(14) ${state}`);
    }
    indicators.push(`RSI(14): ${formatF(rsi14, 0)}`);

    const regimeLower = regimeLabel.toLowerCase();
    if (regimeLower.includes("bearish") && rsi14 <= 35) {
      riskNotes.push("Oversold in a bearish tape: expect bounces, fake reversals, and chop before continuation.");
    } else if (regimeLower.includes("bullish") && rsi14 >= 65) {
      riskNotes.push("Overbought in a bullish tape: expect pauses or shakeouts before continuation.");
    }
  }

  if (stochK !== null && stochD !== null) {
    let state: string;
    if (stochK >= 80) state = "overbought";
    else if (stochK <= 20) state = "oversold";
    else state = "neutral";
    if (state !== "neutral") {
      confluence.push(`Stoch(14) ${state}`);
    }
    indicators.push(`Stoch(14): %K ${formatF(stochK, 0)} • %D ${formatF(stochD, 0)}`);
  }

  if (indicatorSelection.macd && macd !== null && macdSignal !== null && macdHist !== null) {
    const state = macdHist >= 0 ? "bullish" : "bearish";
    const lastPrice = lastCloseOrNull ?? 0;
    const histPctOfPrice = (Math.abs(macdHist) / Math.max(lastPrice, 0.0000001)) * 100.0;
    const histRelToSignal = Math.abs(macdHist) / Math.max(Math.abs(macdSignal), 0.0000001);
    const isMeaningful = histPctOfPrice >= 0.02 || histRelToSignal >= 0.1;
    if (isMeaningful) {
      confluence.push(`MACD ${state}`);
    }
    indicators.push(
      `MACD: ${formatSignedF(macd, 4)} • Signal: ${formatSignedF(macdSignal, 4)} • Hist: ${formatSignedF(macdHist, 4)}`
    );
  }

  if (indicatorSelection.adx && adx.adx !== null && adx.plusDI !== null && adx.minusDI !== null) {
    const adxValue = adx.adx;
    const plus = adx.plusDI;
    const minus = adx.minusDI;
    let strength: string;
    if (adxValue >= 25) strength = "strong";
    else if (adxValue <= 15) strength = "weak";
    else strength = "moderate";
    const direction = plus >= minus ? "DI+ > DI-" : "DI- > DI+";
    if (strength !== "moderate") {
      confluence.push(`ADX(14) ${strength} trend`);
    }
    if (Math.abs(plus - minus) >= 4.0) {
      confluence.push(direction);
    }
    indicators.push(`ADX(14): ${formatF(adxValue, 0)} • +DI ${formatF(plus, 0)} • -DI ${formatF(minus, 0)}`);
  }

  if (
    indicatorSelection.bollingerBands &&
    lastCloseOrNull !== null &&
    bollinger.middle !== null &&
    bollinger.upper !== null &&
    bollinger.lower !== null
  ) {
    const { middle, upper, lower } = bollinger;
    indicators.push(`BB(20,2): ${formatCompact(middle)} • U ${formatCompact(upper)} • L ${formatCompact(lower)}`);
    if (bollinger.widthPct !== null) {
      indicators.push(`BB width: ${formatF(bollinger.widthPct, 2)}%`);
      if (bollinger.widthPct >= 6.0) {
        riskNotes.push("Wide Bollinger Bands: volatility expanded.");
      }
    }

    if (lastCloseOrNull >= upper) {
      confluence.push("Above Bollinger upper band");
    } else if (lastCloseOrNull <= lower) {
      confluence.push("Below Bollinger lower band");
    } else {
      const halfWidth = Math.max((upper - lower) / 2.0, 0.0000001);
      const z = Math.abs(lastCloseOrNull - middle) / halfWidth;
      if (z >= 0.35) {
        confluence.push(lastCloseOrNull >= middle ? "Above BB midline" : "Below BB midline");
      }
    }
  }

  if (obv.obv !== null && obv.delta !== null) {
    const delta = obv.delta;
    const state = delta >= 0 ? "rising" : "falling";
    indicators.push(`OBV(Δ20): ${state} (${formatSignedF(delta, 0)})`);
    if (Math.abs(delta) === 0 && obv.obv !== 0) {
      indicators.push(`OBV: ${formatF(obv.obv, 0)}`);
    }

    const recent = suffix(candles, 20).map((candle) => candle.volume);
    const avgVol20 = recent.length === 0 ? 0 : sum(recent) / recent.length;
    if (avgVol20 > 0 && Math.abs(delta) >= avgVol20 * 6.0) {
      confluence.push(`OBV ${state}`);
    }
  }

  if (atr14 !== null) {
    indicators.push(`ATR(14): ${formatCompact(atr14)}`);
  }

  if (volatilityPct !== null) {
    indicators.push(`ATR(14) as %: ${formatF(volatilityPct, 2)}%`);
    if (volatilityPct >= 3.0) {
      riskNotes.push(`High volatility: ATR is ${formatF(volatilityPct, 2)}% of price.`);
    }
  }

  if (volatilityRegime !== null) {
    if (volatilityRegime.percentile !== null) {
      indicators.push(`Volatility regime: ${volatilityRegime.label} (p${volatilityRegime.percentile})`);
    } else {
      indicators.push(`Volatility regime: ${volatilityRegime.label}`);
    }
    const lowerLabel = volatilityRegime.label.toLowerCase();
    if (lowerLabel.includes("high")) {
      riskNotes.push("Volatility regime is high; expect wider swings and more whipsaw.");
    } else if (lowerLabel.includes("low")) {
      // ATR can read "high" in absolute terms while still sitting low in its own
      // distribution; avoid emitting two contradictory notes.
      if (volatilityPct !== null && volatilityPct >= 3.0) {
        if (volatilityRegime.percentile !== null) {
          riskNotes.push(
            `Volatility is low vs recent history (p${volatilityRegime.percentile}), but ATR is still ${formatF(volatilityPct, 2)}% — manage position sizing and stop distance.`
          );
        }
      } else {
        riskNotes.push("Volatility regime is low; breakouts may need confirmation to avoid false moves.");
      }
    }
  }

  if (trendStrength !== null) {
    const trendState = ((): string => {
      const absStrength = Math.abs(trendStrength);
      const adxValue = adx.adx ?? 0;
      const exhaustedUp = trendStrength > 0 && ((rsi14 ?? 50) >= 70 || (stochK ?? 50) >= 85);
      const exhaustedDown = trendStrength < 0 && ((rsi14 ?? 50) <= 30 || (stochK ?? 50) <= 15);
      if (exhaustedUp || exhaustedDown) return "Exhausted trend";
      if (absStrength < 0.04 || adxValue < 16) return "Transitioning trend";
      if (absStrength >= 0.2 || adxValue >= 32) return "Strong trend";
      if (absStrength >= 0.1 || adxValue >= 22) return "Healthy trend";
      return "Weak trend";
    })();
    indicators.push(`Trend strength: ${formatSignedF(trendStrength * 100.0, 0)} (${trendState})`);
  }

  if (structureLayer.events.length > 0) {
    for (const event of prefix(structureLayer.events, 8)) {
      indicators.push(`Structure: ${event}`);
    }
  }
  for (const item of structureLayer.confluenceItems) {
    if (!confluence.includes(item)) confluence.push(item);
  }
  for (const note of structureLayer.riskNotes) {
    if (!riskNotes.includes(note)) riskNotes.push(note);
  }

  if (roc14 !== null) {
    let state: string;
    if (roc14 >= 1.5) state = "strong up";
    else if (roc14 <= -1.5) state = "strong down";
    else if (roc14 > 0.3) state = "up";
    else if (roc14 < -0.3) state = "down";
    else state = "flat";
    if (state !== "flat") {
      confluence.push(`ROC(14) ${state}`);
    }
    indicators.push(`ROC(14): ${formatSignedF(roc14, 2)}%`);
  }

  if (avwap !== null && avwap.vwap !== null && lastCloseOrNull !== null) {
    const vwap = avwap.vwap;
    indicators.push(`AVWAP: ${formatCompact(vwap)} (${avwap.anchorLabel})`);
    if (avwap.upper1 !== null && avwap.lower1 !== null) {
      indicators.push(`AVWAP band: U ${formatCompact(avwap.upper1)} • L ${formatCompact(avwap.lower1)}`);
      if (lastCloseOrNull >= avwap.upper1) {
        confluence.push("Above AVWAP upper band");
      } else if (lastCloseOrNull <= avwap.lower1) {
        confluence.push("Below AVWAP lower band");
      }
    }
    if (atr14 !== null && atr14 > 0 && Math.abs(lastCloseOrNull - vwap) >= atr14 * 0.25) {
      confluence.push(lastCloseOrNull >= vwap ? "Above AVWAP" : "Below AVWAP");
    }
  }

  if (regressionChannel !== null) {
    indicators.push(
      `Regression: mid ${formatCompact(regressionChannel.mid)} • U ${formatCompact(regressionChannel.upper)} • L ${formatCompact(regressionChannel.lower)}`
    );
    const halfWidth = Math.max((regressionChannel.upper - regressionChannel.lower) / 2.0, 0.0000001);
    const z = Math.abs((lastCloseOrNull ?? regressionChannel.mid) - regressionChannel.mid) / halfWidth;
    if (z >= 0.35) {
      confluence.push(regressionChannel.positionLabel);
    }
    if (regressionChannel.slopePctPerBar !== null) {
      indicators.push(`Regression slope: ${formatSignedF(regressionChannel.slopePctPerBar, 2)}%/bar`);
    }
  }

  if (indicatorSelection.fibonacci) {
    confluence.push(...fibConfluence);
  }
  for (const signal of divergenceSignals) {
    if (!confluence.includes(signal)) {
      confluence.push(signal);
    }
  }

  const detectedPatterns = detectDeterministicPatterns(candles, swingPoints);
  const detectedBullishPatterns = detectedPatterns.filter((pattern) => BULLISH_PATTERNS.has(pattern));
  const detectedBearishPatterns = detectedPatterns.filter((pattern) => BEARISH_PATTERNS.has(pattern));
  const hasPatternConflict = detectedBullishPatterns.length > 0 && detectedBearishPatterns.length > 0;

  if (detectedPatterns.length === 0) {
    indicators.push("Pattern: none clear");
  } else if (hasPatternConflict) {
    indicators.push("Pattern: conflict / none clear");
    riskNotes.push(
      "Pattern conflict: bullish and bearish formations are both present — reduce conviction and rely more on live confirmation."
    );
  } else {
    for (const pattern of prefix(detectedPatterns, 6)) {
      indicators.push(`Pattern: ${pattern}`);
    }

    // Cross-check: flag when a detected pattern contradicts the regime direction.
    const regimeLower = regimeLabel.toLowerCase();
    const regimeIsBullish = regimeLower.includes("bullish");
    const regimeIsBearish = regimeLower.includes("bearish");
    for (const pattern of prefix(detectedPatterns, 6)) {
      if (regimeIsBullish && BEARISH_PATTERNS.has(pattern)) {
        riskNotes.push(
          `Pattern conflict: ${pattern} is typically bearish but regime reads bullish — watch for trend reversal.`
        );
      } else if (regimeIsBearish && BULLISH_PATTERNS.has(pattern)) {
        riskNotes.push(
          `Pattern conflict: ${pattern} is typically bullish but regime reads bearish — watch for trend reversal.`
        );
      }
    }
  }

  if (lastCandle !== null) {
    const rangePct = ((lastCandle.high - lastCandle.low) / Math.max(lastCandle.close, 0.000001)) * 100.0;
    indicators.push(`Last candle range: ${formatF(rangePct, 2)}%`);
  }

  const bias = computeBias({
    ...input,
    hasPatternConflict,
    lastClose: lastCloseOrNull,
    structure,
    regimeLabel
  });

  return { confluence, indicators, bias, riskNotes };
}

interface BiasInput extends BuildSignalsInput {
  hasPatternConflict: boolean;
  lastClose: number | null;
}

/**
 * The bias block from `buildSignals`. Scores weighted votes, then applies a chain of
 * order-dependent clamps: neutral floors for range/transition/reversal contexts, a
 * dominant-side cap, and 5% minimum floors on all three buckets.
 */
function computeBias(input: BiasInput): Bias {
  const {
    ema20,
    ema50,
    ema200,
    rsi14,
    stochK,
    adx,
    avwap,
    obv,
    roc14,
    structure,
    structureLayer,
    regimeLabel,
    divergenceSignals,
    macdHist,
    indicatorSelection,
    hasPatternConflict,
    lastClose
  } = input;

  let bullPoints = 0.0;
  let bearPoints = 0.0;
  let bullishVotes = 0;
  let bearishVotes = 0;

  const addBull = (points: number, vote = true): void => {
    bullPoints += points;
    if (vote) bullishVotes += 1;
  };
  const addBear = (points: number, vote = true): void => {
    bearPoints += points;
    if (vote) bearishVotes += 1;
  };

  if (indicatorSelection.emaTrend && ema20 !== null && ema50 !== null) {
    if (ema20 >= ema50) addBull(2.0);
    else addBear(2.0);
  }
  if (indicatorSelection.emaTrend && ema200 !== null && lastClose !== null) {
    if (lastClose >= ema200) addBull(2.0);
    else addBear(2.0);
  }
  if (indicatorSelection.macd && macdHist !== null) {
    if (macdHist >= 0) addBull(1.2);
    else addBear(1.2);
  }
  if (indicatorSelection.rsi && rsi14 !== null) {
    if (rsi14 >= 68) addBear(0.8);
    else if (rsi14 <= 32) addBull(0.8);
    else if (rsi14 > 55) addBull(1.0);
    else if (rsi14 < 45) addBear(1.0);
  }
  if (stochK !== null) {
    if (stochK >= 85) addBear(0.7);
    else if (stochK <= 15) addBull(0.7);
  }
  if (indicatorSelection.adx && adx.adx !== null && adx.plusDI !== null && adx.minusDI !== null) {
    const plus = adx.plusDI;
    const minus = adx.minusDI;
    if (adx.adx >= 20) {
      if (plus >= minus) addBull(1.2);
      else addBear(1.2);
    } else {
      if (plus >= minus + 1.0) addBull(0.5);
      else if (minus >= plus + 1.0) addBear(0.5);
    }
  }

  if (lastClose !== null && avwap !== null && avwap.vwap !== null) {
    if (lastClose >= avwap.vwap) addBull(1.1);
    else addBear(1.1);
    if (avwap.upper1 !== null && lastClose >= avwap.upper1) addBull(0.4, false);
    if (avwap.lower1 !== null && lastClose <= avwap.lower1) addBear(0.4, false);
  }

  if (obv.delta !== null) {
    if (obv.delta > 0) addBull(0.8);
    else if (obv.delta < 0) addBear(0.8);
  }

  if (roc14 !== null) {
    if (roc14 > 0.3) addBull(0.8);
    else if (roc14 < -0.3) addBear(0.8);
  }

  const structureLower = structure.toLowerCase();
  if (structureLower.includes("higher highs")) {
    addBull(2.0);
  } else if (structureLower.includes("lower highs")) {
    addBear(2.0);
  }

  switch (structureLayer.bias) {
    case "bullish":
      addBull(2.0);
      break;
    case "bearish":
      addBear(2.0);
      break;
    default:
      addBull(0.4, false);
      addBear(0.4, false);
      break;
  }
  if (structureLayer.hasBullishBOS || structureLayer.hasBullishCHoCH) addBull(1.2);
  if (structureLayer.hasBearishBOS || structureLayer.hasBearishCHoCH) addBear(1.2);
  if (structureLayer.hasBullishSweep || structureLayer.hasBullishReclaim || structureLayer.hasBullishReaction) {
    addBull(0.9);
  }
  if (structureLayer.hasBearishSweep || structureLayer.hasBearishReclaim || structureLayer.hasBearishReaction) {
    addBear(0.9);
  }

  const regimeLower = regimeLabel.toLowerCase();
  if (regimeLower.includes("bullish trend")) {
    addBull(2.0);
  } else if (regimeLower.includes("bearish trend")) {
    addBear(2.0);
  } else if (regimeLower.includes("bearish reversal")) {
    addBear(1.5);
    addBull(0.5, false);
  } else if (regimeLower.includes("bullish reversal")) {
    addBull(1.5);
    addBear(0.5, false);
  } else if (regimeLower.includes("bullish pullback") || regimeLower.includes("bearish rebound")) {
    addBull(1.0, false);
    addBear(1.0, false);
  } else if (regimeLower.includes("bullish rebound")) {
    addBull(1.0, false);
    addBear(1.0, false);
  } else if (regimeLower.includes("range") || regimeLower.includes("consolidation")) {
    addBull(1.0, false);
    addBear(1.0, false);
  }

  const mixedStructure = structureLower.includes("mixed") || structureLower.includes("transition");
  const rangeLikeRegime = regimeLower.includes("range") || regimeLower.includes("consolidation");
  const reversalLikeRegime =
    regimeLower.includes("reversal") || regimeLower.includes("rebound") || regimeLower.includes("pullback");
  const hasDivergence = divergenceSignals.length > 0;
  const conflictingEvidence = bullishVotes >= 2 && bearishVotes >= 2;
  const strongDirectionalDisagreement =
    Math.abs(bullishVotes - bearishVotes) <= 1 && Math.min(bullishVotes, bearishVotes) >= 2;

  const liveTapeBullish = (macdHist ?? 0) >= 0 && (adx.plusDI ?? 0) >= (adx.minusDI ?? 0) && (obv.delta ?? 0) >= 0;
  const liveTapeBearish = (macdHist ?? 0) < 0 && (adx.minusDI ?? 0) > (adx.plusDI ?? 0) && (obv.delta ?? 0) < 0;
  const regimeVsTapeConflict =
    (regimeLower.includes("bullish") && liveTapeBearish) || (regimeLower.includes("bearish") && liveTapeBullish);

  if (conflictingEvidence) {
    bullPoints *= 0.92;
    bearPoints *= 0.92;
  }
  if (regimeVsTapeConflict) {
    bullPoints *= 0.9;
    bearPoints *= 0.9;
  }
  if (hasPatternConflict) {
    bullPoints *= 0.9;
    bearPoints *= 0.9;
  }

  const total = Math.max(1.0, bullPoints + bearPoints);
  let bullish = toInt(rounded((bullPoints / total) * 100.0));
  let bearish = toInt(rounded((bearPoints / total) * 100.0));
  // Independent rounding can push the sum past 100; take it off the dominant side.
  const rawSum = bullish + bearish;
  if (rawSum > 100) {
    if (bullish >= bearish) bullish -= rawSum - 100;
    else bearish -= rawSum - 100;
  }
  let neutral = Math.max(0, 100 - bullish - bearish);

  const diff = Math.abs(bullish - bearish);
  if (diff <= 10) {
    neutral = Math.max(neutral, 20);
    const remaining = 100 - neutral;
    bullish = Math.trunc(remaining / 2);
    bearish = remaining - bullish;
  } else if (diff <= 20) {
    neutral = Math.max(neutral, 10);
    const remaining = 100 - neutral;
    if (bullish > bearish) {
      bullish = Math.min(bullish, remaining);
      bearish = remaining - bullish;
    } else {
      bearish = Math.min(bearish, remaining);
      bullish = remaining - bearish;
    }
  }

  if (rangeLikeRegime || mixedStructure) {
    const neutralFloor = diff <= 20 ? 40 : 30;
    if (neutral < neutralFloor) {
      neutral = neutralFloor;
      const remaining = 100 - neutral;
      const directionalTotal = Math.max(1.0, bullPoints + bearPoints);
      bullish = toInt(rounded((bullPoints / directionalTotal) * remaining));
      bearish = Math.max(0, remaining - bullish);
    }

    const directionalCap = 45;
    if (bullish > bearish) {
      bullish = Math.min(bullish, directionalCap);
      bearish = Math.max(0, 100 - neutral - bullish);
    } else if (bearish > bullish) {
      bearish = Math.min(bearish, directionalCap);
      bullish = Math.max(0, 100 - neutral - bearish);
    }
  }

  if (reversalLikeRegime) {
    neutral = Math.max(neutral, 20);
    const remaining = 100 - neutral;
    const dominantCap = 60;
    if (bullish > bearish) {
      bullish = Math.min(bullish, dominantCap);
      bearish = Math.max(0, remaining - bullish);
    } else if (bearish > bullish) {
      bearish = Math.min(bearish, dominantCap);
      bullish = Math.max(0, remaining - bearish);
    } else {
      bullish = Math.trunc(remaining / 2);
      bearish = remaining - bullish;
    }
  }

  if (
    conflictingEvidence ||
    strongDirectionalDisagreement ||
    hasDivergence ||
    regimeVsTapeConflict ||
    hasPatternConflict
  ) {
    const neutralFloor = ((): number => {
      if (hasPatternConflict) return 25;
      if (regimeVsTapeConflict) return 22;
      if (hasDivergence) return 20;
      return 15;
    })();
    neutral = Math.max(neutral, neutralFloor);
    const remaining = 100 - neutral;
    const directionalTotal = Math.max(1.0, bullPoints + bearPoints);
    bullish = toInt(rounded((bullPoints / directionalTotal) * remaining));
    bearish = Math.max(0, remaining - bullish);
  }

  const dominantCap = ((): number => {
    if (rangeLikeRegime || mixedStructure) return 55;
    if (regimeVsTapeConflict || hasPatternConflict) return 60;
    if (reversalLikeRegime || conflictingEvidence || hasDivergence) return 68;
    return 85;
  })();
  if (bullish > bearish) {
    bullish = Math.min(bullish, dominantCap);
    bearish = Math.max(0, 100 - neutral - bullish);
  } else if (bearish > bullish) {
    bearish = Math.min(bearish, dominantCap);
    bullish = Math.max(0, 100 - neutral - bearish);
  }

  // A 0% bucket would claim absolute certainty, which is never warranted.
  const minDirectional = 5;
  if (bullish < minDirectional) {
    const deficit = minDirectional - bullish;
    bullish = minDirectional;
    if (bearish > bullish) bearish -= deficit;
    else neutral -= deficit;
    neutral = Math.max(0, 100 - bullish - bearish);
  }
  if (bearish < minDirectional) {
    const deficit = minDirectional - bearish;
    bearish = minDirectional;
    if (bullish > bearish) bullish -= deficit;
    else neutral -= deficit;
    neutral = Math.max(0, 100 - bullish - bearish);
  }
  if (neutral < minDirectional) {
    const deficit = minDirectional - neutral;
    neutral = minDirectional;
    // Take it from the dominant direction.
    if (bullish >= bearish) bullish -= deficit;
    else bearish -= deficit;
    bullish = Math.max(minDirectional, bullish);
    bearish = Math.max(minDirectional, bearish);
    neutral = 100 - bullish - bearish;
  }

  return { bullish, bearish, neutral };
}
