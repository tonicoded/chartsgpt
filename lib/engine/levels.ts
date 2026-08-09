/**
 * Support/resistance derivation — port of `deriveSupportResistance`, `deriveMicroLevels`,
 * `pivotLevels`, `compactLevelSet` and `mergeKeyLevels` in
 * `ChartGPT/MarketAnalysisEngine.swift`.
 *
 * Levels are carried around as their FORMATTED string and re-parsed on every hop, exactly
 * as iOS does. That is lossy on purpose — the rounding is what makes two nearby swings
 * collapse into one level — so the port must not "improve" it by keeping the raw doubles.
 */

import { clusterLevels, formatPrice, parseDoubleStrict, roundToStep, roundingStep } from "./format";
import { dropFirst, prefix, rounded, suffix, toInt } from "./swift";
import type { Candle, KeyLevel, TimeframeKind } from "./types";

function swingRadiusFor(kind: TimeframeKind): number {
  switch (kind) {
    case "intraday":
      return 2;
    case "daily":
      return 3;
    default:
      return 4;
  }
}

/** Swift: `deriveSupportResistance(highs:lows:currentPrice:timeframeKind:)`. */
export function deriveSupportResistance(
  highs: readonly number[],
  lows: readonly number[],
  currentPrice: number,
  timeframeKind: TimeframeKind
): KeyLevel[] {
  const swingRadius = swingRadiusFor(timeframeKind);
  if (highs.length !== lows.length || !(highs.length > swingRadius * 2)) return [];

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

  let recentCount: number;
  switch (timeframeKind) {
    case "intraday":
      recentCount = 30;
      break;
    case "daily":
      recentCount = 50;
      break;
    case "weekly":
      recentCount = 80;
      break;
    default:
      recentCount = 100;
      break;
  }
  const recentHighs = suffix(swingHighs, recentCount);
  const recentLows = suffix(swingLows, recentCount);

  const step = roundingStep(currentPrice);
  const clusteredHighs = clusterLevels(recentHighs, 0.006, step);
  const clusteredLows = clusterLevels(recentLows, 0.006, step);

  const levels: KeyLevel[] = [];

  for (const price of clusteredLows) {
    const isSupport = price <= currentPrice;
    levels.push({
      price: formatPrice(price),
      kind: isSupport ? "support" : "resistance",
      note: isSupport ? "swing low cluster" : "prior swing low (overhead)"
    });
  }
  for (const price of clusteredHighs) {
    const isResistance = price >= currentPrice;
    levels.push({
      price: formatPrice(price),
      kind: isResistance ? "resistance" : "support",
      note: isResistance ? "swing high cluster" : "prior swing high (below)"
    });
  }

  const sorted = levels
    .map((level) => ({ value: parseDoubleStrict(level.price), level }))
    .filter((item): item is { value: number; level: KeyLevel } => item.value !== null)
    .sort((lhs, rhs) => lhs.value - rhs.value)
    .map((item) => item.level);

  return compactLevelSet(suffix(sorted, 12), currentPrice, 10);
}

/** Swift: `deriveMicroLevels(candles:currentPrice:timeframeKind:)`. */
export function deriveMicroLevels(
  candles: readonly Candle[],
  currentPrice: number,
  timeframeKind: TimeframeKind
): KeyLevel[] {
  if (candles.length < 20) return [];

  let lookback: number;
  switch (timeframeKind) {
    case "intraday":
      lookback = 40;
      break;
    case "daily":
      lookback = 30;
      break;
    case "weekly":
      lookback = 24;
      break;
    default:
      lookback = 18;
      break;
  }

  const recent = suffix(candles, Math.min(lookback, candles.length));
  const step = roundingStep(currentPrice);

  let recentHigh: number | null = null;
  let recentLow: number | null = null;
  for (const candle of recent) {
    if (recentHigh === null || candle.high > recentHigh) recentHigh = candle.high;
    if (recentLow === null || candle.low < recentLow) recentLow = candle.low;
  }

  const levels: KeyLevel[] = [];

  if (recentLow !== null) {
    const price = roundToStep(recentLow, step);
    if (price > 0) {
      const isSupport = price <= currentPrice;
      levels.push({
        price: formatPrice(price),
        kind: isSupport ? "support" : "resistance",
        note: isSupport ? `recent ${recent.length}-bar low` : `recent ${recent.length}-bar low (overhead)`
      });
    }
  }

  if (recentHigh !== null) {
    const price = roundToStep(recentHigh, step);
    if (price > 0) {
      const isResistance = price >= currentPrice;
      levels.push({
        price: formatPrice(price),
        kind: isResistance ? "resistance" : "support",
        note: isResistance ? `recent ${recent.length}-bar high` : `recent ${recent.length}-bar high (below)`
      });
    }
  }

  // Add close/open based levels. These often matter on scanned chart screenshots because
  // users visually anchor to bodies, not only wicks.
  const bodyLevels: number[] = [];
  for (const candle of suffix(recent, Math.min(18, recent.length))) {
    bodyLevels.push(candle.open, candle.close);
  }
  const clusteredBodies = clusterLevels(bodyLevels, 0.0035, step).filter((price) => {
    if (!(currentPrice > 0)) return false;
    return Math.abs(price - currentPrice) / currentPrice <= 0.055;
  });
  for (const price of prefix(clusteredBodies, 4)) {
    if (!(price > 0)) continue;
    levels.push({
      price: formatPrice(price),
      kind: price <= currentPrice ? "support" : "resistance",
      note: "recent body cluster"
    });
  }

  return compactLevelSet(levels, currentPrice, 8);
}

/** Swift: `pivotLevels(candles:currentPrice:)`. Classic floor-trader pivots off the last completed bar. */
export function pivotLevels(candles: readonly Candle[], currentPrice: number): KeyLevel[] {
  if (candles.length < 3) return [];
  const step = roundingStep(currentPrice);

  // Use the last completed candle as the pivot basis.
  const prev = candles[candles.length - 2];
  const high = prev.high;
  const low = prev.low;
  const close = prev.close;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return [];
  if (!(high > low) || !(low > 0)) return [];

  const p = (high + low + close) / 3.0;
  const r1 = 2.0 * p - low;
  const s1 = 2.0 * p - high;
  const r2 = p + (high - low);
  const s2 = p - (high - low);

  const raw: Array<{ name: string; value: number }> = [
    { name: "Pivot", value: p },
    { name: "Pivot R1", value: r1 },
    { name: "Pivot S1", value: s1 },
    { name: "Pivot R2", value: r2 },
    { name: "Pivot S2", value: s2 }
  ];

  const levels: KeyLevel[] = [];
  for (const item of raw) {
    const price = roundToStep(item.value, step);
    if (!Number.isFinite(price) || !(price > 0)) continue;
    levels.push({
      price: formatPrice(price),
      kind: price <= currentPrice ? "support" : "resistance",
      note: item.name
    });
  }
  return levels;
}

interface ParsedLevel {
  value: number;
  level: KeyLevel;
}

function notePriority(note: string | null): number {
  const lower = (note ?? "").toLowerCase();
  if (lower.includes("swing") || lower.includes("recent")) return 5;
  if (lower.includes("pivot")) return 4;
  if (lower.includes("fib retracement")) return 3;
  if (lower.includes("fib extension")) return 2;
  return 1;
}

/**
 * Swift: `compactLevelSet(_:currentPrice:maxCount:)`.
 *
 * Drops levels further than 45% from price, merges everything inside a proximity band into
 * a single representative, and blends the merged notes. When trimming to `maxCount` the
 * split is deliberately lopsided — `maxCount / 2` below (integer division) and the
 * remainder above.
 */
export function compactLevelSet(
  levels: readonly KeyLevel[],
  currentPrice: number,
  maxCount: number
): KeyLevel[] {
  const maxDistancePct = 0.45;
  const parsed: ParsedLevel[] = [];
  for (const level of levels) {
    const value = parseDoubleStrict(level.price);
    if (value === null || !Number.isFinite(value) || !(value > 0)) continue;
    if (currentPrice > 0 && Math.abs(value - currentPrice) / currentPrice > maxDistancePct) continue;
    parsed.push({ value, level });
  }
  parsed.sort((lhs, rhs) => lhs.value - rhs.value);
  if (parsed.length === 0) return [];

  const proximityTolerance = Math.max(currentPrice * 0.0012, roundingStep(currentPrice) * 1.5);

  const clusters: ParsedLevel[][] = [];
  let currentCluster: ParsedLevel[] = [parsed[0]];
  for (const item of dropFirst(parsed)) {
    const lastValue = currentCluster.length === 0 ? item.value : currentCluster[currentCluster.length - 1].value;
    if (Math.abs(item.value - lastValue) <= proximityTolerance) {
      currentCluster.push(item);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
    }
  }
  clusters.push(currentCluster);

  const collapsed: KeyLevel[] = [];
  for (const cluster of clusters) {
    // Swift's `max(by:)` keeps the FIRST element on a tie; replicate that rather than
    // relying on reduce semantics that would keep the last.
    let representative: ParsedLevel | null = null;
    let representativeScore = 0;
    for (const candidate of cluster) {
      const score = notePriority(candidate.level.note) * 10 - toInt(Math.abs(candidate.value - currentPrice));
      if (representative === null || representativeScore < score) {
        representative = candidate;
        representativeScore = score;
      }
    }
    if (representative === null) continue;

    const rep: KeyLevel = { ...representative.level };

    if (cluster.length > 1) {
      const rawNotes = cluster
        .map((item) => item.level.note?.trim() ?? null)
        .filter((note): note is string => note !== null && note.length > 0);
      const fragments: string[] = [];
      for (const note of rawNotes) {
        for (const piece of note.split("•")) {
          const trimmed = piece.trim();
          if (trimmed.length > 0) fragments.push(trimmed);
        }
      }

      const kind = rep.kind.toLowerCase();
      const normalizeFragment = (fragment: string): string => {
        const lower = fragment.trim().toLowerCase();
        if (kind === "resistance") {
          if (lower === "swing low cluster") return "prior swing low (overhead)";
          if (lower.startsWith("recent") && lower.includes("-bar low") && !lower.includes("overhead")) {
            return `${fragment} (overhead)`;
          }
        } else if (kind === "support") {
          if (lower === "swing high cluster") return "prior swing high (below)";
          if (lower.startsWith("recent") && lower.includes("-bar high") && !lower.includes("(below)")) {
            return `${fragment} (below)`;
          }
        }
        return fragment;
      };

      const normalizedFragments = fragments.map(normalizeFragment);
      const seen = new Set<string>();
      const dedupedNotes = normalizedFragments.filter((note) => {
        const key = note.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Drop fragments that are a strict substring of a longer sibling fragment.
      const topNotes = dedupedNotes.filter((note) => {
        const lower = note.toLowerCase();
        return !dedupedNotes.some((other) => other.length > note.length && other.toLowerCase().includes(lower));
      });
      if (topNotes.length > 0) {
        rep.note = prefix(topNotes, 3).join(" • ");
      }
    }
    collapsed.push(rep);
  }

  const byPrice = (a: KeyLevel, b: KeyLevel) => (parseDoubleStrict(a.price) ?? 0) - (parseDoubleStrict(b.price) ?? 0);

  if (collapsed.length <= maxCount) return [...collapsed].sort(byPrice);

  const sorted = [...collapsed].sort(byPrice);
  const below = sorted.filter((level) => (parseDoubleStrict(level.price) ?? 0) <= currentPrice);
  const above = sorted.filter((level) => (parseDoubleStrict(level.price) ?? 0) >= currentPrice);
  const pickBelow = suffix(below, Math.trunc(maxCount / 2));
  const pickAbove = prefix(above, maxCount - pickBelow.length);
  return [...pickBelow, ...pickAbove].sort(byPrice);
}

/**
 * Swift: `mergeKeyLevels(baseLevels:extraLevels:currentPrice:)`.
 *
 * After compacting, if the nearest level above or below sits more than 8% away, up to
 * three of the discarded extras that fall inside that void are re-admitted so scenarios
 * and setups have intermediate targets to aim at.
 */
export function mergeKeyLevels(
  baseLevels: readonly KeyLevel[],
  extraLevels: readonly KeyLevel[],
  currentPrice: number
): KeyLevel[] {
  const all = [...baseLevels, ...extraLevels]
    .map((level) => ({ value: parseDoubleStrict(level.price), level }))
    .filter((item): item is { value: number; level: KeyLevel } => item.value !== null && item.value > 0)
    .sort((lhs, rhs) => lhs.value - rhs.value)
    .map((item) => item.level);

  let result = compactLevelSet(all, currentPrice, 10);

  const parsed = result
    .map((level) => parseDoubleStrict(level.price))
    .filter((value): value is number => value !== null);
  const epsilon = currentPrice * 0.0002;
  const nearestAbove = parsed.find((value) => value > currentPrice + epsilon) ?? null;
  let nearestBelow: number | null = null;
  for (const value of parsed) {
    if (value < currentPrice - epsilon) nearestBelow = value;
  }
  const gapAbove = nearestAbove !== null ? (nearestAbove - currentPrice) / currentPrice : 1.0;
  const gapBelow = nearestBelow !== null ? (currentPrice - nearestBelow) / currentPrice : 1.0;
  const gapThreshold = 0.08; // 8% gap considered too large

  if (gapAbove > gapThreshold || gapBelow > gapThreshold) {
    const existingValues = new Set(parsed.map((value) => rounded(value * 10000) / 10000));
    const gapFillers: Array<{ value: number; level: KeyLevel }> = [];
    for (const level of extraLevels) {
      const value = parseDoubleStrict(level.price);
      if (value === null || !(value > 0) || !Number.isFinite(value)) continue;
      const key = rounded(value * 10000) / 10000;
      if (existingValues.has(key)) continue;
      const inUpperGap =
        gapAbove > gapThreshold && value > currentPrice + epsilon && (nearestAbove === null || value < nearestAbove);
      const inLowerGap =
        gapBelow > gapThreshold && value < currentPrice - epsilon && (nearestBelow === null || value > nearestBelow);
      if (!inUpperGap && !inLowerGap) continue;
      gapFillers.push({ value, level });
    }
    gapFillers.sort((lhs, rhs) => Math.abs(lhs.value - currentPrice) - Math.abs(rhs.value - currentPrice));

    for (const filler of prefix(gapFillers, 3)) {
      result.push(filler.level);
    }
    result = compactLevelSet(result, currentPrice, 10);
  }

  return result;
}
