/**
 * Scenarios and time-horizon targets — port of `buildScenariosAndTargets` in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines ~8714-8970).
 *
 * Produces the three scenarios (Bullish / Bearish / Range) and the short/medium/long
 * target rows. Probabilities are left null here and filled in later by
 * `applyProbabilityLayerToScenarios`.
 *
 * FX gets its own branch: Yahoo FX levels are sparse, so when no real level exists on one
 * side the engine synthesises one from a timeframe-scaled percentage rather than leaving
 * the scenario without a trigger.
 */

import { parseDoubleStrict } from "./format";
import { dropFirst, dropLast, formatF, prefix as takePrefix, rounded, suffix } from "./swift";
import type { KeyLevel, Scenario, TimeHorizonTargets } from "./types";

type ScenarioDirection = "bullish" | "bearish" | "range" | "other";

interface NumericLevel {
  value: number;
  display: string;
}

export interface ScenariosAndTargets {
  scenarios: Scenario[];
  targets: TimeHorizonTargets;
}

/** Swift: `buildScenariosAndTargets(levels:lastPrice:symbol:timeframe:)`. */
export function buildScenariosAndTargets(
  levels: readonly KeyLevel[],
  lastPrice: number,
  symbol: string,
  timeframe: string
): ScenariosAndTargets {
  const symbolUpper = symbol.toUpperCase();
  const isYahooFX = symbolUpper.endsWith("=X");
  const timeframeLower = timeframe.toLowerCase();

  const numeric: NumericLevel[] = [];
  for (const level of levels) {
    const value = parseDoubleStrict(level.price);
    if (value === null || !(value > 0)) continue;
    numeric.push({ value, display: level.price });
  }
  numeric.sort((lhs, rhs) => lhs.value - rhs.value);

  const below = numeric.filter((item) => item.value < lastPrice);
  const above = numeric.filter((item) => item.value > lastPrice);

  const isJPYPair = symbolUpper.includes("JPY");
  const fxRoundingStep = isJPYPair ? 0.01 : 0.0005;
  const displayDecimals = isJPYPair ? 3 : 4;

  const roundFX = (value: number): number => rounded(value / fxRoundingStep) * fxRoundingStep;
  const formatFX = (value: number): string => formatF(roundFX(value), displayDecimals);

  const syntheticFXOffset = (): number => {
    let pct: number;
    switch (timeframeLower) {
      case "15m":
        pct = 0.0008;
        break;
      case "30m":
        pct = 0.001;
        break;
      case "1h":
        pct = 0.0012;
        break;
      case "2h":
        pct = 0.0016;
        break;
      case "4h":
        pct = 0.0022;
        break;
      case "1d":
        pct = 0.012;
        break;
      case "1w":
        pct = 0.035;
        break;
      case "1m":
      case "1mo":
        pct = 0.07;
        break;
      default:
        pct = 0.002;
        break;
    }
    return Math.max(lastPrice * pct, fxRoundingStep * 2.0);
  };

  const cleanLevelText = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const syntheticOffset = syntheticFXOffset();
  const nearestBelowLevel = below.length === 0 ? null : below[below.length - 1];
  const nearestAboveLevel = above.length === 0 ? null : above[0];

  const support: string | null =
    nearestBelowLevel?.display ?? (isYahooFX ? formatFX(lastPrice - syntheticOffset) : null);
  const resistance: string | null =
    nearestAboveLevel?.display ?? (isYahooFX ? formatFX(lastPrice + syntheticOffset) : null);

  const secondAbove = dropFirst(above)[0];
  const secondBelowList = dropLast(below);
  const secondBelow = secondBelowList[secondBelowList.length - 1];
  const thirdAbove = dropFirst(above, 2)[0];
  const thirdBelowList = dropLast(below, 2);
  const thirdBelow = thirdBelowList[thirdBelowList.length - 1];

  const explicitNextAbove = cleanLevelText(secondAbove?.display);
  const explicitNextBelow = cleanLevelText(secondBelow?.display);
  const explicitHigherAbove = cleanLevelText(thirdAbove?.display);
  const explicitDeeperBelow = cleanLevelText(thirdBelow?.display);

  const nextAbove = explicitNextAbove ?? (isYahooFX ? formatFX(lastPrice + syntheticOffset * 2.0) : null);
  const nextBelow = explicitNextBelow ?? (isYahooFX ? formatFX(lastPrice - syntheticOffset * 2.0) : null);

  // Always end up with both a support and a resistance so scenarios and targets have
  // something concrete to reference, even when the derived levels sit on one side only.
  const pct = ((): number => {
    switch (timeframeLower) {
      case "15m":
        return 0.003;
      case "30m":
        return 0.005;
      case "1h":
        return 0.008;
      case "2h":
        return 0.012;
      case "4h":
        return 0.018;
      case "6h":
      case "8h":
        return 0.025;
      case "1d":
        return 0.04;
      case "1w":
        return 0.06;
      default:
        return 0.01;
    }
  })();

  const syntheticLevel = (price: number, percent: number, decimals: number): string =>
    formatF(price * (1.0 + percent), decimals);
  const syntheticLevelDown = (price: number, percent: number, decimals: number): string =>
    formatF(price * (1.0 - percent), decimals);

  const nearestExplicitResistance = cleanLevelText(nearestAboveLevel?.display);
  const nearestExplicitSupport = cleanLevelText(nearestBelowLevel?.display);
  const effectiveResistance =
    cleanLevelText(resistance) ?? nearestExplicitResistance ?? syntheticLevel(lastPrice, pct, displayDecimals);
  const effectiveSupport =
    cleanLevelText(support) ?? nearestExplicitSupport ?? syntheticLevelDown(lastPrice, pct, displayDecimals);
  const effectiveNextAbove =
    cleanLevelText(nextAbove) ??
    cleanLevelText(secondAbove?.display) ??
    syntheticLevel(lastPrice, pct * 2.5, displayDecimals);
  const effectiveNextBelow =
    cleanLevelText(nextBelow) ??
    cleanLevelText(secondBelow?.display) ??
    syntheticLevelDown(lastPrice, pct * 2.5, displayDecimals);

  const nearestAboveDistancePct =
    nearestAboveLevel !== null ? (nearestAboveLevel.value - lastPrice) / Math.max(lastPrice, 0.000001) : null;
  const nearestBelowDistancePct =
    nearestBelowLevel !== null ? (lastPrice - nearestBelowLevel.value) / Math.max(lastPrice, 0.000001) : null;

  const maxExplicitScenarioMovePct = (): number => {
    switch (timeframeLower) {
      case "15m":
        return 0.012;
      case "30m":
        return 0.018;
      case "1h":
        return 0.025;
      case "2h":
        return 0.04;
      case "4h":
        return 0.065;
      case "6h":
      case "8h":
        return 0.09;
      case "1d":
        return 0.14;
      case "1w":
        return 0.22;
      default:
        return isYahooFX ? 0.02 : 0.08;
    }
  };

  /** Drops explicit targets that sit implausibly far away for the timeframe. */
  const shouldKeepExplicitTarget = (display: string | null, direction: ScenarioDirection): boolean => {
    if (display === null) return false;
    const value = parseDoubleStrict(display);
    if (value === null || !Number.isFinite(value) || !(lastPrice > 0)) return false;
    const distancePct = Math.abs(value - lastPrice) / lastPrice;
    let nearestPct: number;
    switch (direction) {
      case "bullish":
        nearestPct = nearestAboveDistancePct ?? 0;
        break;
      case "bearish":
        nearestPct = nearestBelowDistancePct ?? 0;
        break;
      default:
        nearestPct = 0;
        break;
    }
    const adaptiveCap = Math.max(maxExplicitScenarioMovePct(), nearestPct * 4.0);
    return distancePct <= adaptiveCap;
  };

  const followThroughPath = (
    values: readonly (string | null)[],
    fallback: string,
    linePrefix: string | null = null
  ): string => {
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const value of values) {
      if (value === null) continue;
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      clean.push(trimmed);
    }
    if (clean.length === 0) return fallback;
    const joined = clean.join(", ");
    if (linePrefix !== null && linePrefix.length > 0) {
      return `${linePrefix} ${joined}`;
    }
    return `Potential follow-through toward ${joined}`;
  };

  const directionalPath = (
    direction: ScenarioDirection,
    values: readonly (string | null)[],
    fallback: string,
    linePrefix: string | null = null
  ): string => {
    const filtered = values.filter((value) => shouldKeepExplicitTarget(value, direction));
    return followThroughPath(filtered, fallback, linePrefix);
  };

  let bullish: Scenario;
  let bearish: Scenario;
  let rangeScenario: Scenario;

  if (isYahooFX) {
    const bullishFXTargets = [explicitNextAbove, explicitHigherAbove];
    const bearishFXTargets = [explicitNextBelow, explicitDeeperBelow];
    // The fallback and prefix decisions look at the UNFILTERED lists, unlike the path itself.
    const bullishHasTargets = bullishFXTargets.some((value) => value !== null);
    const bearishHasTargets = bearishFXTargets.some((value) => value !== null);
    const bullishFXFallback = bullishHasTargets
      ? "FX continuation toward higher levels"
      : "FX continuation toward higher areas if momentum expands";
    const bearishFXFallback = bearishHasTargets
      ? "FX breakdown toward lower levels"
      : "FX breakdown toward lower areas if pressure expands";

    bullish = {
      name: "Bullish",
      trigger: `Break and hold above ${effectiveResistance}`,
      path: directionalPath(
        "bullish",
        bullishFXTargets,
        bullishFXFallback,
        bullishHasTargets ? "FX continuation toward" : null
      ),
      invalidation: `Back below ${effectiveSupport}`,
      probability: null
    };

    bearish = {
      name: "Bearish",
      trigger: `Break and hold below ${effectiveSupport}`,
      path: directionalPath(
        "bearish",
        bearishFXTargets,
        bearishFXFallback,
        bearishHasTargets ? "FX breakdown toward" : null
      ),
      invalidation: `Back above ${effectiveResistance}`,
      probability: null
    };

    rangeScenario = {
      name: "Range",
      trigger: `Range holds between ${effectiveSupport} and ${effectiveResistance}`,
      path: `FX range rotation remains active between ${effectiveSupport} and ${effectiveResistance}`,
      invalidation: `A decisive close above ${effectiveResistance} or below ${effectiveSupport} ends the range state`,
      probability: null
    };
  } else {
    const bullishExplicitTargets = [explicitNextAbove, explicitHigherAbove];
    const bearishExplicitTargets = [explicitNextBelow, explicitDeeperBelow];
    const bullishFallback = bullishExplicitTargets.some((value) => value !== null)
      ? "Continuation toward the next overhead levels"
      : "Continuation toward the next overhead area if momentum confirms";
    const bearishFallback = bearishExplicitTargets.some((value) => value !== null)
      ? "Continuation toward lower supports"
      : "Continuation toward lower support areas if breakdown confirms";

    bullish = {
      name: "Bullish",
      trigger: `Acceptance above ${effectiveResistance}`,
      path: directionalPath("bullish", bullishExplicitTargets, bullishFallback),
      invalidation: `Back below ${effectiveSupport}`,
      probability: null
    };

    bearish = {
      name: "Bearish",
      trigger: `Acceptance below ${effectiveSupport}`,
      path: directionalPath("bearish", bearishExplicitTargets, bearishFallback),
      invalidation: `Back above ${effectiveResistance}`,
      probability: null
    };

    rangeScenario = {
      name: "Range",
      trigger: `Holds between ${effectiveSupport} and ${effectiveResistance}`,
      path: `Mean reversion between ${effectiveSupport} ↔ ${effectiveResistance}`,
      invalidation: `Break and hold above ${effectiveResistance} (bullish) or below ${effectiveSupport} (bearish)`,
      probability: null
    };
  }

  const directionalTarget = (item: NumericLevel): string | null => {
    const epsilon = Math.max(lastPrice * 0.0001, 0.0000001);
    if (item.value > lastPrice + epsilon) return `↑ ${item.display}`;
    if (item.value < lastPrice - epsilon) return `↓ ${item.display}`;
    return null;
  };

  const longTermCandidates = [...suffix(above, 2), ...takePrefix(below, 2)];
  const longTermSeen = new Set<string>();
  const longTerm: string[] = [];
  for (const item of longTermCandidates) {
    const target = directionalTarget(item);
    if (target === null) continue;
    if (longTermSeen.has(target)) continue;
    longTermSeen.add(target);
    longTerm.push(target);
  }

  const targets: TimeHorizonTargets = {
    shortTerm: [`↑ ${effectiveResistance}`, `↓ ${effectiveSupport}`],
    mediumTerm: [`↑ ${effectiveNextAbove}`, `↓ ${effectiveNextBelow}`],
    longTerm
  };

  return { scenarios: [bullish, bearish, rangeScenario], targets };
}
