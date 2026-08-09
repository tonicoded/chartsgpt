/**
 * Market regime and structure inference — port of `inferMarketRegime` and
 * `inferMarketStructure` in `ChartGPT/MarketAnalysisEngine.swift` (lines ~8346-8576).
 *
 * The regime label is a user-visible string that also feeds the trade-setup generator's
 * suitability scoring, so both the exact wording and the vote arithmetic matter.
 */

import { rounded, suffix, toInt } from "./swift";
import type { TimeframeKind } from "./types";

export interface RegimeResult {
  label: string;
  confidence: number | null;
}

export interface RegimeInput {
  lastClose: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  structure: string;
  trendStrength: number | null;
  volatilityPct: number | null;
  rsi14: number | null;
  macdHistogram: number | null;
  adxValue: number | null;
  plusDI: number | null;
  minusDI: number | null;
  roc14: number | null;
}

/** Swift: `inferMarketRegime(...)`. */
export function inferMarketRegime(input: RegimeInput): RegimeResult {
  const {
    lastClose,
    ema20,
    ema50,
    ema200,
    structure,
    trendStrength,
    volatilityPct,
    rsi14,
    macdHistogram,
    adxValue,
    plusDI,
    minusDI,
    roc14
  } = input;

  const strength = trendStrength ?? 0;
  const structureLower = structure.toLowerCase();
  const structureIsBullish = structureLower.includes("higher highs and higher lows");
  const structureIsBearish = structureLower.includes("lower highs and lower lows");
  const structureIsMixed = structureLower.includes("mixed") || structureLower.includes("transition");

  let priceVs200: string | null;
  if (ema200 !== null && lastClose > 0) {
    priceVs200 = lastClose >= ema200 ? "above EMA200" : "below EMA200";
  } else {
    priceVs200 = null;
  }

  const emaSeparationPct: number | null =
    ema20 !== null && ema50 !== null
      ? Math.abs((ema20 - ema50) / Math.max(Math.abs(ema50), 0.000001))
      : null;

  const emaIsCompressed = (emaSeparationPct ?? 1) < 0.0035;
  const adxIsLow = (adxValue ?? 99) < 16;
  const adxIsDirectional = (adxValue ?? 0) >= 22;
  const highVolatility = (volatilityPct ?? 0) >= 3.0;
  const lowVolatility = (volatilityPct ?? 999) <= 0.45;
  const diSpread = Math.abs((plusDI ?? 0) - (minusDI ?? 0));
  const trendDirection: string =
    ema20 !== null && ema50 !== null ? (ema20 >= ema50 ? "bull" : "bear") : strength >= 0 ? "bull" : "bear";

  let bullishVotes = 0;
  let bearishVotes = 0;

  if (rsi14 !== null) {
    if (rsi14 >= 55) bullishVotes += 1.0;
    else if (rsi14 <= 45) bearishVotes += 1.0;
    if (rsi14 >= 65) bullishVotes += 0.5;
    else if (rsi14 <= 35) bearishVotes += 0.5;
  }
  if (macdHistogram !== null) {
    if (macdHistogram > 0) bullishVotes += 1.0;
    else if (macdHistogram < 0) bearishVotes += 1.0;
  }
  if (plusDI !== null && minusDI !== null) {
    if (plusDI > minusDI + 0.5) bullishVotes += 1.0;
    else if (minusDI > plusDI + 0.5) bearishVotes += 1.0;
    if (adxValue !== null && adxValue >= 20) {
      if (plusDI > minusDI + 0.5) bullishVotes += 0.5;
      else if (minusDI > plusDI + 0.5) bearishVotes += 0.5;
    }
  }
  if (roc14 !== null) {
    if (roc14 > 0.3) bullishVotes += 1.0;
    else if (roc14 < -0.3) bearishVotes += 1.0;
  }

  const strongBullishOpposition = bullishVotes >= bearishVotes + 1.5;
  const strongBearishOpposition = bearishVotes >= bullishVotes + 1.5;
  const rangeEvidenceCount = [
    emaIsCompressed,
    adxIsLow,
    structureIsMixed,
    Math.abs(strength) < 0.06,
    Math.abs(bullishVotes - bearishVotes) < 1.0
  ].filter(Boolean).length;
  const isRange = rangeEvidenceCount >= 3;
  const isCompression = isRange && lowVolatility && adxIsLow && Math.abs(strength) < 0.05;
  const trendHasConfirmation =
    adxIsDirectional ||
    Math.abs(strength) >= 0.1 ||
    structureIsBullish ||
    structureIsBearish ||
    Math.abs(bullishVotes - bearishVotes) >= 1.5;

  let coreLabel: string;
  if (isCompression) {
    coreLabel = "Compression / range";
  } else if (isRange) {
    coreLabel = "Range / consolidation";
  } else if (trendDirection === "bull" && trendHasConfirmation) {
    if (structureIsBearish) {
      // EMAs still bullish but price structure has flipped to lower highs/lows.
      // "Bullish pullback" is misleading here — structure is already bearish.
      if (ema200 !== null && lastClose < ema200) {
        coreLabel = "Bullish rebound (below EMA200)";
      } else if (priceVs200 !== null) {
        coreLabel = `Bearish reversal (${priceVs200})`;
      } else {
        coreLabel = "Bearish reversal";
      }
    } else if (structureIsMixed && strongBearishOpposition) {
      if (priceVs200 !== null) {
        coreLabel = `Bearish reversal (${priceVs200})`;
      } else {
        coreLabel = "Bearish reversal";
      }
    } else if (ema200 !== null && lastClose < ema200) {
      coreLabel = "Bullish rebound (below EMA200)";
    } else if (priceVs200 !== null) {
      coreLabel = `Bullish trend (${priceVs200})`;
    } else {
      coreLabel = "Bullish trend";
    }
  } else if (trendDirection === "bear" && trendHasConfirmation) {
    if (structureIsBullish) {
      // EMAs still bearish but price structure has flipped to higher highs/lows.
      // "Bearish rebound" is misleading — structure is already bullish.
      if (ema200 !== null && lastClose > ema200) {
        coreLabel = "Bearish pullback (above EMA200)";
      } else if (priceVs200 !== null) {
        coreLabel = `Bullish reversal (${priceVs200})`;
      } else {
        coreLabel = "Bullish reversal";
      }
    } else if (structureIsMixed && strongBullishOpposition) {
      if (priceVs200 !== null) {
        coreLabel = `Bullish reversal (${priceVs200})`;
      } else {
        coreLabel = "Bullish reversal";
      }
    } else if (ema200 !== null && lastClose > ema200) {
      coreLabel = "Bearish pullback (above EMA200)";
    } else if (priceVs200 !== null) {
      coreLabel = `Bearish trend (${priceVs200})`;
    } else {
      coreLabel = "Bearish trend";
    }
  } else {
    coreLabel = structureIsMixed ? "Range / consolidation" : "Transition / unclear";
  }

  let label = coreLabel;
  const directionalExpansion =
    highVolatility && adxIsDirectional && diSpread >= 4 && (structureIsBullish || structureIsBearish);
  if (directionalExpansion) {
    label += " expansion";
  } else if (highVolatility) {
    label += " (high volatility)";
  }

  const confidence: number | null = (() => {
    let score = 0;
    score += Math.min(Math.max(Math.abs(strength) * 100.0, 0), 35);
    if (emaSeparationPct !== null) {
      score += Math.min(emaSeparationPct * 5000.0, 45);
    }
    const voteSpread = Math.abs(bullishVotes - bearishVotes);
    score += Math.min(voteSpread * 8.0, 22);
    if (structureIsBullish || structureIsBearish) {
      score += structureIsMixed ? 0 : 8;
    }
    if (adxValue !== null) {
      if (adxValue >= 25) score += 8;
      else if (adxValue < 15) score -= 8;
    }
    if (priceVs200 !== null) score += trendHasConfirmation ? 5 : 2;
    if (isCompression) {
      score = Math.min(Math.max(score + 18, 45), 78);
    } else if (isRange) {
      score = Math.min(Math.max(score + 8, 35), 70);
    }
    if (directionalExpansion) {
      score += 10;
    }
    if (score <= 0) return null;
    return toInt(rounded(Math.min(Math.max(score, 10), 95)));
  })();

  return { label, confidence };
}

/** Swift: `inferMarketStructure(highs:lows:timeframeKind:)`. */
export function inferMarketStructure(
  highs: readonly number[],
  lows: readonly number[],
  timeframeKind: TimeframeKind
): string {
  let swingRadius: number;
  switch (timeframeKind) {
    case "intraday":
      swingRadius = 2;
      break;
    case "daily":
      swingRadius = 3;
      break;
    default:
      swingRadius = 4;
      break;
  }
  if (highs.length !== lows.length || !(highs.length > swingRadius * 2)) {
    return "Structure unclear";
  }

  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = swingRadius; i < highs.length - swingRadius; i += 1) {
    const high = highs[i];
    const low = lows[i];

    let isHigh = true;
    let isLow = true;
    for (let j = i - swingRadius; j <= i + swingRadius; j += 1) {
      if (j === i) continue;
      if (highs[j] > high) isHigh = false;
      if (lows[j] < low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) swingHighs.push(high);
    if (isLow) swingLows.push(low);
  }

  const lastHighs = suffix(swingHighs, 3);
  const lastLows = suffix(swingLows, 3);
  if (lastHighs.length >= 2 && lastLows.length >= 2) {
    const highsDown = lastHighs[lastHighs.length - 1] < lastHighs[lastHighs.length - 2];
    const lowsDown = lastLows[lastLows.length - 1] < lastLows[lastLows.length - 2];
    const highsUp = lastHighs[lastHighs.length - 1] > lastHighs[lastHighs.length - 2];
    const lowsUp = lastLows[lastLows.length - 1] > lastLows[lastLows.length - 2];

    if (highsDown && lowsDown) return "Lower highs and lower lows";
    if (highsUp && lowsUp) return "Higher highs and higher lows";
  }

  return "Mixed structure (range / transition)";
}
