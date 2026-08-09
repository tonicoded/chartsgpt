/**
 * Price rounding, clustering and formatting — port of the corresponding helpers in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines ~8247-8305 and ~9777).
 *
 * These decide the literal digits the user sees on every level, entry and stop, so they
 * are the single most parity-sensitive part of the engine. `formatF` reproduces C
 * printf's round-half-to-even; see lib/engine/swift.ts for why that matters.
 */

import { formatF, rounded, sortedAscending, sum } from "./swift";
import type { TimeframeKind } from "./types";

/** Swift: `roundingStep(for:)`. Magnitude-dependent grid that levels snap to. */
export function roundingStep(price: number): number {
  const p = Math.abs(price);
  if (p >= 50000) return 100;
  if (p >= 10000) return 50;
  if (p >= 1000) return 10;
  if (p >= 100) return 1;
  if (p >= 1) return 0.01;
  if (p >= 0.1) return 0.001;
  return 0.0001;
}

/** Swift: `roundToStep(_:step:)`. */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  return rounded(value / step) * step;
}

/**
 * Swift: `clusterLevels(_:tolerancePct:rounding:)`.
 *
 * Groups nearby prices into one representative level. The de-duplication runs over the
 * REVERSED array and then reverses back, which keeps the LAST occurrence of a duplicate
 * rather than the first — preserved here because it changes level ordering.
 */
export function clusterLevels(
  values: readonly number[],
  tolerancePct: number,
  rounding: number
): number[] {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length === 0) return [];

  const sorted = sortedAscending(filtered);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]];

  for (const value of sorted.slice(1)) {
    const meanValue = sum(current) / current.length;
    const pct = Math.abs(value - meanValue) / meanValue;
    if (pct <= tolerancePct) {
      current.push(value);
    } else {
      clusters.push(current);
      current = [value];
    }
  }
  clusters.push(current);

  const representatives = clusters.map((cluster) => roundToStep(sum(cluster) / cluster.length, rounding));

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const value of [...representatives].reverse()) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique.reverse();
}

/** Swift: `formatPrice(_:)`. Precision widens as the price gets smaller. */
export function formatPrice(value: number): string {
  if (value >= 1000) return formatF(value, 0);
  if (value >= 10) return formatF(value, 2);
  if (value >= 1) return formatF(value, 4);
  if (value >= 0.1) return formatF(value, 5);
  if (value >= 0.01) return formatF(value, 6);
  return formatF(value, 8);
}

/** Swift: `formatCompact(_:)`. Identical ladder to `formatPrice`; kept separate to mirror the source. */
export function formatCompact(value: number): string {
  if (value >= 1000) return formatF(value, 0);
  if (value >= 10) return formatF(value, 2);
  if (value >= 1) return formatF(value, 4);
  if (value >= 0.1) return formatF(value, 5);
  if (value >= 0.01) return formatF(value, 6);
  return formatF(value, 8);
}

// MARK: - Timeframe helpers (Swift: `timeframeMinutes(from:)` / `timeframeKind(from:)`)

/**
 * Swift: `timeframeMinutes(from:)`.
 *
 * Case matters: an uppercase "M" suffix means months, a lowercase "m" means minutes.
 * The uppercase check runs against the trimmed (non-lowercased) string first.
 */
export function timeframeMinutes(timeframe: string): number | null {
  const trimmed = timeframe.trim();
  const raw = trimmed.toLowerCase();
  if (raw.length === 0) return null;

  if (trimmed.endsWith("M")) {
    const v = parseIntStrict(trimmed.slice(0, -1));
    if (v !== null && v > 0) return v * 43200;
  }
  if (raw.endsWith("wk")) return 10080;
  if (raw.endsWith("mo")) return 43200;
  if (raw.endsWith("m")) {
    const v = parseIntStrict(raw.slice(0, -1));
    if (v !== null && v > 0) return v;
  }
  if (raw.endsWith("h")) {
    const v = parseIntStrict(raw.slice(0, -1));
    if (v !== null && v > 0) return v * 60;
  }
  if (raw.endsWith("d")) {
    const v = parseIntStrict(raw.slice(0, -1));
    if (v !== null && v > 0) return v * 1440;
  }
  if (raw.endsWith("w")) {
    const v = parseIntStrict(raw.slice(0, -1));
    if (v !== null && v > 0) return v * 10080;
  }
  return null;
}

/** Swift: `timeframeKind(from:)`. */
export function timeframeKind(timeframe: string): TimeframeKind {
  const trimmed = timeframe.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith("M")) return "monthly";
  if (lower.endsWith("mo")) return "monthly";
  if (lower.endsWith("wk") || lower.endsWith("w")) return "weekly";
  if (lower.endsWith("d")) return "daily";
  return "intraday";
}

/**
 * Swift's `Int("...")` initialiser: the WHOLE string must be a valid integer, unlike
 * `parseInt` which happily reads a leading prefix and returns 1 for "1abc".
 */
export function parseIntStrict(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** Swift's `Double("...")` initialiser — again, whole-string or nothing. */
export function parseDoubleStrict(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
