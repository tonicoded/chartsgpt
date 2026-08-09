/**
 * Market structure layer — port of `marketStructureLayer` and `applyMarketStructureLayer`
 * in `ChartGPT/MarketAnalysisEngine.swift` (lines ~7636-7852).
 *
 * This is the smart-money-concepts pass: break of structure, change of character,
 * liquidity sweeps, level reclaims and reactions. It produces the "Structure: …" lines the
 * result screen shows, and it can *delete* trade setups (a mean-reversion fade inside a
 * trending context is dropped outright), so it runs before the setups are scored.
 */

import { formatCompact } from "./format";
import { parseDoubleStrict } from "./format";
import { dropLast, prefix, suffix } from "./swift";
import type { Candle, KeyLevel, SwingPoint, TimeframeKind, TradeSetup } from "./types";

export type StructureBias = "bullish" | "bearish" | "mixed";

export interface MarketStructureLayer {
  swingLabel: string;
  bias: StructureBias;
  events: string[];
  confluenceItems: string[];
  riskNotes: string[];
  hasBullishBOS: boolean;
  hasBearishBOS: boolean;
  hasBullishCHoCH: boolean;
  hasBearishCHoCH: boolean;
  hasBullishSweep: boolean;
  hasBearishSweep: boolean;
  hasBullishReclaim: boolean;
  hasBearishReclaim: boolean;
  hasBullishReaction: boolean;
  hasBearishReaction: boolean;
  isRangeLike: boolean;
}

export const emptyStructureLayer: MarketStructureLayer = {
  swingLabel: "Structure layer: insufficient swing data",
  bias: "mixed",
  events: [],
  confluenceItems: [],
  riskNotes: [],
  hasBullishBOS: false,
  hasBearishBOS: false,
  hasBullishCHoCH: false,
  hasBearishCHoCH: false,
  hasBullishSweep: false,
  hasBearishSweep: false,
  hasBullishReclaim: false,
  hasBearishReclaim: false,
  hasBullishReaction: false,
  hasBearishReaction: false,
  isRangeLike: false
};

interface NumericLevel {
  value: number;
  kind: string;
  price: string;
}

/**
 * Swift's `min(by:)` — returns the FIRST minimum on a tie, because the element only
 * replaces the incumbent when it compares strictly smaller.
 */
function minBy<T>(values: readonly T[], isLess: (lhs: T, rhs: T) => boolean): T | null {
  if (values.length === 0) return null;
  let result = values[0];
  for (const element of values.slice(1)) {
    if (isLess(element, result)) result = element;
  }
  return result;
}

/** Swift's `last(where:)`. */
function lastWhere<T>(values: readonly T[], predicate: (value: T) => boolean): T | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (predicate(values[i])) return values[i];
  }
  return null;
}

/** Swift: `marketStructureLayer(candles:swingPoints:levels:atr14:timeframeKind:)`. */
export function marketStructureLayer(
  candles: readonly Candle[],
  swingPointsList: readonly SwingPoint[],
  levels: readonly KeyLevel[],
  atr14: number | null,
  timeframeKind: TimeframeKind
): MarketStructureLayer {
  if (candles.length < 12) return emptyStructureLayer;
  const last = candles[candles.length - 1];

  const swingHighs = swingPointsList.filter((point) => point.kind === "high");
  const swingLows = swingPointsList.filter((point) => point.kind === "low");
  const recentHighs = suffix(swingHighs, 3);
  const recentLows = suffix(swingLows, 3);
  const lastClose = last.close;
  const atrValue = atr14 ?? Math.max(lastClose * 0.006, 0.0000001);
  const tolerance = Math.max(atrValue * 0.12, lastClose * 0.0004);

  const hh =
    recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price + tolerance;
  const lh =
    recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price - tolerance;
  const hl =
    recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price + tolerance;
  const ll =
    recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price - tolerance;

  const swingLabel = (() => {
    if (hh && hl) return "Structure layer: HH/HL";
    if (lh && ll) return "Structure layer: LH/LL";
    if (hh && ll) return "Structure layer: expansion / transition";
    if (hl && lh) return "Structure layer: compression / triangle";
    return "Structure layer: mixed swings";
  })();

  const previousSwingHigh = lastWhere(swingHighs, (point) => point.index < candles.length - 1);
  const previousSwingLow = lastWhere(swingLows, (point) => point.index < candles.length - 1);
  const bullishBOS = previousSwingHigh !== null ? lastClose > previousSwingHigh.price + tolerance : false;
  const bearishBOS = previousSwingLow !== null ? lastClose < previousSwingLow.price - tolerance : false;
  const priorBearishStructure = lh || ll;
  const priorBullishStructure = hh || hl;
  const bullishCHoCH = bullishBOS && priorBearishStructure;
  const bearishCHoCH = bearishBOS && priorBullishStructure;

  const bearishSweep =
    previousSwingHigh !== null
      ? last.high > previousSwingHigh.price + tolerance && last.close < previousSwingHigh.price
      : false;
  const bullishSweep =
    previousSwingLow !== null
      ? last.low < previousSwingLow.price - tolerance && last.close > previousSwingLow.price
      : false;
  const failedBreakout = bearishSweep;
  const failedBreakdown = bullishSweep;

  const previousCandle = dropLast(candles as Candle[]);
  const previousClose = previousCandle.length === 0 ? null : previousCandle[previousCandle.length - 1].close;

  const numericLevels: NumericLevel[] = [];
  for (const level of levels) {
    const value = parseDoubleStrict(level.price);
    if (value === null || !Number.isFinite(value) || !(value > 0)) continue;
    numericLevels.push({ value, kind: level.kind.toLowerCase(), price: level.price });
  }
  const supportLevels = numericLevels
    .filter((level) => level.kind.includes("support"))
    .sort((lhs, rhs) => lhs.value - rhs.value);
  const resistanceLevels = numericLevels
    .filter((level) => level.kind.includes("resistance"))
    .sort((lhs, rhs) => lhs.value - rhs.value);

  const nearestSupport = minBy(
    supportLevels,
    (lhs, rhs) => Math.abs(lhs.value - lastClose) < Math.abs(rhs.value - lastClose)
  );
  const nearestResistance = minBy(
    resistanceLevels,
    (lhs, rhs) => Math.abs(lhs.value - lastClose) < Math.abs(rhs.value - lastClose)
  );

  const bullishReclaim =
    nearestSupport !== null && previousClose !== null
      ? previousClose < nearestSupport.value - tolerance && lastClose > nearestSupport.value + tolerance
      : false;
  const bearishReclaim =
    nearestResistance !== null && previousClose !== null
      ? previousClose > nearestResistance.value + tolerance && lastClose < nearestResistance.value - tolerance
      : false;

  const bullishReaction =
    nearestSupport !== null
      ? last.low <= nearestSupport.value + tolerance && lastClose > nearestSupport.value + tolerance
      : false;
  const bearishReaction =
    nearestResistance !== null
      ? last.high >= nearestResistance.value - tolerance && lastClose < nearestResistance.value - tolerance
      : false;

  const events: string[] = [];
  events.push(swingLabel);
  if (bullishBOS) {
    events.push(`BOS bullish above ${previousSwingHigh !== null ? formatCompact(previousSwingHigh.price) : "swing high"}`);
  }
  if (bearishBOS) {
    events.push(`BOS bearish below ${previousSwingLow !== null ? formatCompact(previousSwingLow.price) : "swing low"}`);
  }
  if (bullishCHoCH) events.push("CHoCH bullish");
  if (bearishCHoCH) events.push("CHoCH bearish");
  if (bullishSweep) events.push("Liquidity sweep: sell-side sweep");
  if (bearishSweep) events.push("Liquidity sweep: buy-side sweep");
  if (failedBreakdown) events.push("Failed breakdown");
  if (failedBreakout) events.push("Failed breakout");
  if (bullishReclaim) events.push(`Reclaim above support ${nearestSupport?.price ?? ""}`);
  if (bearishReclaim) events.push(`Reclaim below resistance ${nearestResistance?.price ?? ""}`);
  if (bullishReaction) events.push(`Key level reaction: support held ${nearestSupport?.price ?? ""}`);
  if (bearishReaction) events.push(`Key level reaction: resistance rejected ${nearestResistance?.price ?? ""}`);

  const bias: StructureBias = (() => {
    let bull = 0;
    let bear = 0;
    if (hh) bull += 1;
    if (hl) bull += 1;
    if (lh) bear += 1;
    if (ll) bear += 1;
    if (bullishBOS) bull += 2;
    if (bearishBOS) bear += 2;
    if (bullishCHoCH || bullishSweep || bullishReclaim || bullishReaction) bull += 2;
    if (bearishCHoCH || bearishSweep || bearishReclaim || bearishReaction) bear += 2;
    if (bull >= bear + 2) return "bullish";
    if (bear >= bull + 2) return "bearish";
    return "mixed";
  })();

  const isRangeLike = (() => {
    if (bullishBOS || bearishBOS || bullishCHoCH || bearishCHoCH) return false;
    if (timeframeKind === "intraday") {
      return (hh && ll) || (hl && lh) || (!hh && !hl && !lh && !ll);
    }
    return (hh && ll) || (hl && lh);
  })();

  const confluenceItems: string[] = [...prefix(events, 8)];
  if (bias !== "mixed") {
    confluenceItems.push(`Structure bias: ${bias}`);
  }

  const riskNotes: string[] = [];
  if (bullishSweep || bearishSweep) {
    riskNotes.push(
      "Liquidity sweep detected: wait for acceptance; trap risk is elevated until the reclaim holds."
    );
  }
  if (failedBreakout || failedBreakdown) {
    riskNotes.push(
      "Failed break detected: continuation setups need confirmation; failed moves often rotate back through the range."
    );
  }
  if (isRangeLike) {
    riskNotes.push("Structure layer is range-like: prefer confirmed rotations/reclaims over blind continuation.");
  }

  return {
    swingLabel,
    bias,
    events,
    confluenceItems,
    riskNotes,
    hasBullishBOS: bullishBOS,
    hasBearishBOS: bearishBOS,
    hasBullishCHoCH: bullishCHoCH,
    hasBearishCHoCH: bearishCHoCH,
    hasBullishSweep: bullishSweep,
    hasBearishSweep: bearishSweep,
    hasBullishReclaim: bullishReclaim,
    hasBearishReclaim: bearishReclaim,
    hasBullishReaction: bullishReaction,
    hasBearishReaction: bearishReaction,
    isRangeLike
  };
}

/**
 * Swift: `applyMarketStructureLayer(setups:structureLayer:regimeLabel:structure:)`.
 *
 * Note the `compactMap`: a mean-reversion fade inside a trending, non-range context is
 * removed entirely rather than penalised. Everything else gains a rationale line and,
 * where structure disagrees, a confidence-cap note.
 */
export function applyMarketStructureLayer(
  setups: readonly TradeSetup[],
  structureLayer: MarketStructureLayer,
  regimeLabel: string,
  structure: string
): TradeSetup[] {
  if (setups.length === 0) return [...setups];
  const trendText = `${regimeLabel} ${structure}`.toLowerCase();
  const isTrendingContext =
    trendText.includes("bullish trend") ||
    trendText.includes("bearish trend") ||
    trendText.includes("higher highs") ||
    trendText.includes("lower highs");

  const result: TradeSetup[] = [];

  for (const setup of setups) {
    const directionText = setup.direction.toLowerCase();
    const text = `${setup.setup} ${setup.trigger}`.toLowerCase();
    const isBullish = directionText.includes("bull");
    const isBearish = directionText.includes("bear");
    const isRangeRotation = text.includes("range rotation");
    const isMeanReversionFade =
      isRangeRotation || text.includes("resistance fade") || text.includes("support bounce");
    const isWatch = text.includes("watch") || text.includes("reclaim") || text.includes("breakdown");
    const bullishStructureSupport =
      structureLayer.bias === "bullish" ||
      structureLayer.hasBullishBOS ||
      structureLayer.hasBullishCHoCH ||
      structureLayer.hasBullishSweep ||
      structureLayer.hasBullishReclaim ||
      structureLayer.hasBullishReaction;
    const bearishStructureSupport =
      structureLayer.bias === "bearish" ||
      structureLayer.hasBearishBOS ||
      structureLayer.hasBearishCHoCH ||
      structureLayer.hasBearishSweep ||
      structureLayer.hasBearishReclaim ||
      structureLayer.hasBearishReaction;

    if (isMeanReversionFade && isTrendingContext && !structureLayer.isRangeLike) {
      continue;
    }

    const updated: TradeSetup = {
      ...setup,
      notes: [...setup.notes],
      rationale: [...setup.rationale],
      targets: [...setup.targets]
    };
    const eventLine = `Structure layer: ${prefix(structureLayer.events, 5).join(" • ")}`;
    if (!updated.rationale.includes(eventLine)) {
      updated.rationale.push(eventLine);
    }

    if (isBullish && !bullishStructureSupport && structureLayer.bias === "bearish") {
      const note = isWatch
        ? "Structure conflict: bearish structure; bullish idea stays conditional. Confidence cap: 60 until BOS/CHoCH or reclaim confirms."
        : "Structure conflict: bearish structure against this long. Confidence cap: 60.";
      if (!updated.notes.includes(note)) updated.notes.push(note);
    } else if (isBearish && !bearishStructureSupport && structureLayer.bias === "bullish") {
      const note = isWatch
        ? "Structure conflict: bullish structure; bearish idea stays conditional. Confidence cap: 60 until BOS/CHoCH or breakdown confirms."
        : "Structure conflict: bullish structure against this short. Confidence cap: 60.";
      if (!updated.notes.includes(note)) updated.notes.push(note);
    } else if (structureLayer.isRangeLike && !isRangeRotation && text.includes("continuation") && !isWatch) {
      const note = "Structure layer is range-like; continuation requires acceptance. Confidence cap: 75.";
      if (!updated.notes.includes(note)) updated.notes.push(note);
    }

    if ((structureLayer.hasBullishSweep && isBullish) || (structureLayer.hasBearishSweep && isBearish)) {
      const note = "Liquidity sweep supports this direction only after acceptance; trap risk remains elevated.";
      if (!updated.notes.includes(note)) updated.notes.push(note);
    }
    result.push(updated);
  }

  return result;
}
