import type { Candle } from "./market-data";

export type ChartAnalysisPayload = {
  symbol?: string | null;
  timeframe?: string | null;
  exchange?: string | null;

  summary?: string | null;
  marketRegime?: string | null;
  marketStructure?: string | null;
  supportResistance: KeyLevel[];
  confluence: string[];
  indicators: string[];
  smartMoneyConcepts: string[];
  scenarios: Scenario[];
  timeHorizonTargets?: TimeHorizonTargets | null;
  tradeSetups?: TradeSetup[] | null;
  bias?: Bias | null;
  riskNotes: string[];
  disclaimer?: string | null;
};

export type TimeHorizonTargets = { shortTerm: string[]; mediumTerm: string[]; longTerm: string[] };

export type KeyLevel = { price: string; kind: string; note?: string | null };

export type Scenario = {
  name: string;
  trigger: string;
  path: string;
  invalidation?: string | null;
  probability?: number | null;
};

export type Bias = { bullish?: number | null; bearish?: number | null; neutral?: number | null };

export type TradeSetup = {
  horizon: string;
  direction: string;
  setup: string;
  trigger: string;
  entry?: string | null;
  stop?: string | null;
  targets: string[];
  rr?: string | null;
  notes: string[];
};

type TimeframeKind = "intraday" | "daily" | "weekly" | "monthly";

function timeframeKindFrom(timeframe: string): TimeframeKind {
  const raw = timeframe.trim();
  const lower = raw.toLowerCase();
  if (raw.includes("M") || lower.includes("mo")) return "monthly";
  if (lower.includes("w")) return "weekly";
  if (lower.includes("d")) return "daily";
  return "intraday";
}

function roundingStep(price: number) {
  const p = Math.abs(price);
  if (p >= 50000) return 100;
  if (p >= 10000) return 50;
  if (p >= 1000) return 10;
  if (p >= 100) return 1;
  if (p >= 1) return 0.01;
  if (p >= 0.1) return 0.001;
  return 0.0001;
}

function roundToStep(value: number, step: number) {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

function formatPrice(value: number) {
  if (value >= 1000) return value.toFixed(0);
  if (value >= 10) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.1) return value.toFixed(5);
  if (value >= 0.01) return value.toFixed(6);
  return value.toFixed(8);
}

function formatCompact(value: number) {
  return formatPrice(value);
}

function clusterLevels(values: number[], tolerancePct: number, rounding: number) {
  const filtered = values.filter((v) => Number.isFinite(v) && v > 0);
  if (filtered.length === 0) return [];

  const sorted = filtered.slice().sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]!];

  for (const value of sorted.slice(1)) {
    const mean = current.reduce((a, b) => a + b, 0) / current.length;
    const pct = Math.abs(value - mean) / mean;
    if (pct <= tolerancePct) current.push(value);
    else {
      clusters.push(current);
      current = [value];
    }
  }
  clusters.push(current);

  const representatives = clusters.map((cluster) => {
    const mean = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    return roundToStep(mean, rounding);
  });

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const value of representatives.slice().reverse()) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique.reverse();
}

function compactLevelSet(levels: KeyLevel[], currentPrice: number, maxCount: number): KeyLevel[] {
  const maxDistancePct = 0.45;
  const parsed = levels
    .map((level) => ({ value: Number(level.price), level }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0)
    .filter((x) => (currentPrice > 0 ? Math.abs(x.value - currentPrice) / currentPrice <= maxDistancePct : true))
    .sort((a, b) => a.value - b.value);

  if (parsed.length === 0) return [];

  const proximityTolerance = Math.max(currentPrice * 0.0012, roundingStep(currentPrice) * 1.5);

  const clusters: Array<Array<{ value: number; level: KeyLevel }>> = [];
  let currentCluster: Array<{ value: number; level: KeyLevel }> = [parsed[0]!];
  for (const item of parsed.slice(1)) {
    const lastValue = currentCluster.at(-1)?.value ?? item.value;
    if (Math.abs(item.value - lastValue) <= proximityTolerance) currentCluster.push(item);
    else {
      clusters.push(currentCluster);
      currentCluster = [item];
    }
  }
  clusters.push(currentCluster);

  const notePriority = (note?: string | null) => {
    const lower = String(note ?? "").toLowerCase();
    if (lower.includes("swing") || lower.includes("recent")) return 5;
    if (lower.includes("pivot")) return 4;
    if (lower.includes("fib retracement")) return 3;
    if (lower.includes("fib extension")) return 2;
    return 1;
  };

  const collapsed: KeyLevel[] = clusters
    .map((cluster) => {
      let representative = cluster[0]?.level;
      for (const item of cluster) {
        if (!representative) representative = item.level;
        const lScore = notePriority(representative.note) * 10 - Math.trunc(Math.abs(Number(representative.price) - currentPrice));
        const rScore = notePriority(item.level.note) * 10 - Math.trunc(Math.abs(item.value - currentPrice));
        if (rScore > lScore) representative = item.level;
      }
      if (!representative) return null;

      const rep: KeyLevel = { ...representative };
      if (cluster.length > 1) {
        const rawNotes = cluster
          .map((x) => x.level.note?.trim())
          .filter((x): x is string => Boolean(x));
        const fragments = rawNotes.flatMap((note) =>
          note
            .split("•")
            .map((p) => p.trim())
            .filter(Boolean)
        );
        const seen = new Set<string>();
        const deduped = fragments.filter((note) => {
          const key = note.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const topNotes = deduped.filter((note) => {
          const lower = note.toLowerCase();
          return !deduped.some((other) => other.length > note.length && other.toLowerCase().includes(lower));
        });
        if (topNotes.length) rep.note = topNotes.slice(0, 3).join(" • ");
      }
      return rep;
    })
    .filter((x): x is KeyLevel => Boolean(x));

  const sortByPrice = (a: KeyLevel, b: KeyLevel) => Number(a.price) - Number(b.price);

  if (collapsed.length <= maxCount) return collapsed.slice().sort(sortByPrice);

  const sorted = collapsed.slice().sort(sortByPrice);
  const below = sorted.filter((l) => Number(l.price) <= currentPrice);
  const above = sorted.filter((l) => Number(l.price) >= currentPrice);
  const pickBelow = below.slice(-Math.floor(maxCount / 2));
  const pickAbove = above.slice(0, maxCount - pickBelow.length);
  return [...pickBelow, ...pickAbove].sort(sortByPrice);
}

function deriveSupportResistance(highs: number[], lows: number[], currentPrice: number, tfKind: TimeframeKind): KeyLevel[] {
  const swingRadius = tfKind === "intraday" ? 2 : tfKind === "daily" ? 3 : 4;
  if (highs.length !== lows.length || highs.length <= swingRadius * 2) return [];

  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = swingRadius; i < highs.length - swingRadius; i++) {
    const high = highs[i]!;
    const low = lows[i]!;

    let isHigh = true;
    let isLow = true;
    for (let j = i - swingRadius; j <= i + swingRadius; j++) {
      if (j === i) continue;
      if (highs[j]! > high) isHigh = false;
      if (lows[j]! < low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) swingHighs.push(high);
    if (isLow) swingLows.push(low);
  }

  const recentCount = tfKind === "intraday" ? 30 : tfKind === "daily" ? 50 : tfKind === "weekly" ? 80 : 100;
  const recentHighs = swingHighs.slice(-recentCount);
  const recentLows = swingLows.slice(-recentCount);

  const clusteredHighs = clusterLevels(recentHighs, 0.006, roundingStep(currentPrice));
  const clusteredLows = clusterLevels(recentLows, 0.006, roundingStep(currentPrice));

  const levels: KeyLevel[] = [];

  for (const price of clusteredLows) {
    const kind = price <= currentPrice ? "support" : "resistance";
    const note = price <= currentPrice ? "swing low cluster" : "prior swing low (overhead)";
    levels.push({ price: formatPrice(price), kind, note });
  }
  for (const price of clusteredHighs) {
    const kind = price >= currentPrice ? "resistance" : "support";
    const note = price >= currentPrice ? "swing high cluster" : "prior swing high (below)";
    levels.push({ price: formatPrice(price), kind, note });
  }

  const sorted = levels
    .map((level) => ({ value: Number(level.price), level }))
    .filter((x) => Number.isFinite(x.value))
    .sort((a, b) => a.value - b.value)
    .map((x) => x.level);

  return compactLevelSet(sorted.slice(-12), currentPrice, 10);
}

function deriveMicroLevels(candles: Candle[], currentPrice: number, tfKind: TimeframeKind): KeyLevel[] {
  if (candles.length < 20) return [];
  const lookback = tfKind === "intraday" ? 40 : tfKind === "daily" ? 30 : tfKind === "weekly" ? 24 : 18;
  const recent = candles.slice(-Math.min(lookback, candles.length));
  const rounding = roundingStep(currentPrice);

  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);

  const levels: KeyLevel[] = [];
  if (Number.isFinite(recentLow)) {
    const price = roundToStep(recentLow, rounding);
    if (price > 0) levels.push({ price: formatPrice(price), kind: price <= currentPrice ? "support" : "resistance", note: `recent ${recent.length}-bar low` });
  }
  if (Number.isFinite(recentHigh)) {
    const price = roundToStep(recentHigh, rounding);
    if (price > 0) levels.push({ price: formatPrice(price), kind: price >= currentPrice ? "resistance" : "support", note: `recent ${recent.length}-bar high` });
  }
  return levels;
}

function pivotLevels(candles: Candle[], currentPrice: number): KeyLevel[] {
  if (candles.length < 3) return [];
  const rounding = roundingStep(currentPrice);
  const prev = candles[candles.length - 2]!;
  const high = prev.high;
  const low = prev.low;
  const close = prev.close;
  if (!(Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close) && high > low && low > 0)) return [];

  const p = (high + low + close) / 3.0;
  const r1 = 2.0 * p - low;
  const s1 = 2.0 * p - high;
  const r2 = p + (high - low);
  const s2 = p - (high - low);

  const raw = [
    { name: "Pivot", value: p },
    { name: "Pivot R1", value: r1 },
    { name: "Pivot S1", value: s1 },
    { name: "Pivot R2", value: r2 },
    { name: "Pivot S2", value: s2 }
  ];

  const levels: KeyLevel[] = [];
  for (const item of raw) {
    const price = roundToStep(item.value, rounding);
    if (!(Number.isFinite(price) && price > 0)) continue;
    const kind = price <= currentPrice ? "support" : "resistance";
    levels.push({ price: formatPrice(price), kind, note: item.name });
  }
  return levels;
}

function mergeKeyLevels(baseLevels: KeyLevel[], extraLevels: KeyLevel[], currentPrice: number) {
  const all = [...baseLevels, ...extraLevels]
    .map((level) => ({ value: Number(level.price), level }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0)
    .sort((a, b) => a.value - b.value)
    .map((x) => x.level);

  return compactLevelSet(all, currentPrice, 10);
}

function buildScenariosAndTargets(levels: KeyLevel[], lastPrice: number): { scenarios: Scenario[]; targets: TimeHorizonTargets } {
  const numeric = levels
    .map((level) => ({ value: Number(level.price), price: level.price }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0)
    .sort((a, b) => a.value - b.value);

  const below = numeric.filter((x) => x.value < lastPrice);
  const above = numeric.filter((x) => x.value > lastPrice);

  const support = below.at(-1)?.price ?? null;
  const resistance = above[0]?.price ?? null;
  const nextAbove = above[1]?.price ?? null;
  const nextBelow = below.at(-2)?.price ?? null;

  const followThroughPath = (values: Array<string | null | undefined>, fallback: string) => {
    const seen = new Set<string>();
    const clean = values
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
    if (clean.length === 0) return fallback;
    return `Potential follow-through toward ${clean.join(", ")}`;
  };

  const bullish: Scenario = {
    name: "Bullish",
    trigger: resistance ? `Acceptance above ${resistance}` : "Acceptance above the nearest resistance",
    path: followThroughPath([nextAbove, above[2]?.price], "Continuation toward the next overhead levels"),
    invalidation: support ? `Back below ${support}` : "Break back into the prior range",
    probability: null
  };

  const bearish: Scenario = {
    name: "Bearish",
    trigger: support ? `Acceptance below ${support}` : "Acceptance below the nearest support",
    path: followThroughPath([nextBelow, below.at(-3)?.price], "Continuation toward lower supports"),
    invalidation: resistance ? `Back above ${resistance}` : "Reclaim of the breakdown level",
    probability: null
  };

  const range: Scenario = {
    name: "Range",
    trigger: support && resistance ? `Holds between ${support} and ${resistance}` : "Consolidation inside the current range",
    path: support && resistance ? `Mean reversion between ${support} ↔ ${resistance}` : "Rotation between nearby levels",
    invalidation: resistance
      ? `Break and hold above ${resistance} (bullish) or below ${support ?? "support"} (bearish)`
      : "Range expansion",
    probability: null
  };

  const arrowUp = (p: string) => `↑ ${p}`;
  const arrowDown = (p: string) => `↓ ${p}`;

  const targets: TimeHorizonTargets = {
    shortTerm: [resistance ? arrowUp(resistance) : null, support ? arrowDown(support) : null].filter((x): x is string => Boolean(x)),
    mediumTerm: [nextAbove ? arrowUp(nextAbove) : null, nextBelow ? arrowDown(nextBelow) : null].filter((x): x is string => Boolean(x)),
    longTerm: [...numeric.slice(-2).reverse().map((x) => arrowUp(x.price)), ...numeric.slice(0, 2).map((x) => arrowDown(x.price))]
  };

  return { scenarios: [bullish, bearish, range], targets };
}

function linearRegressionSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const xMean = (n - 1) / 2.0;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i]!;
    const x = i;
    const dx = x - xMean;
    numerator += dx * (y - yMean);
    denominator += dx * dx;
  }
  if (!(denominator > 0)) return null;
  return numerator / denominator;
}

function calculateTrendStrength(closes: number[], ema20?: number | null, ema50?: number | null): number | null {
  if (closes.length < 60) return null;
  const lookback = Math.min(120, Math.max(60, closes.length));
  const recent = closes.slice(-lookback).filter((v) => Number.isFinite(v) && v > 0);
  if (recent.length < 50) return null;
  const logValues = recent.map((v) => Math.log(v));
  const slope = linearRegressionSlope(logValues);
  if (slope == null) return null;
  const slopeStrength = Math.min(Math.abs(slope) * 200.0, 1.0);
  const alignment = ema20 != null && ema50 != null ? (ema20 >= ema50 ? 1.0 : -1.0) : slope >= 0 ? 1.0 : -1.0;
  return alignment * slopeStrength;
}

function inferMarketStructure(highs: number[], lows: number[], tfKind: TimeframeKind): string {
  const swingRadius = tfKind === "intraday" ? 2 : tfKind === "daily" ? 3 : 4;
  if (highs.length !== lows.length || highs.length <= swingRadius * 2) return "Structure unclear";

  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = swingRadius; i < highs.length - swingRadius; i++) {
    const high = highs[i]!;
    const low = lows[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - swingRadius; j <= i + swingRadius; j++) {
      if (j === i) continue;
      if (highs[j]! > high) isHigh = false;
      if (lows[j]! < low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) swingHighs.push(high);
    if (isLow) swingLows.push(low);
  }

  const lastHighs = swingHighs.slice(-3);
  const lastLows = swingLows.slice(-3);
  if (lastHighs.length >= 2 && lastLows.length >= 2) {
    const highsDown = lastHighs.at(-1)! < lastHighs.at(-2)!;
    const lowsDown = lastLows.at(-1)! < lastLows.at(-2)!;
    const highsUp = lastHighs.at(-1)! > lastHighs.at(-2)!;
    const lowsUp = lastLows.at(-1)! > lastLows.at(-2)!;
    if (highsDown && lowsDown) return "Lower highs and lower lows";
    if (highsUp && lowsUp) return "Higher highs and higher lows";
  }
  return "Mixed structure (range / transition)";
}

function inferMarketRegime(args: {
  lastClose: number;
  ema20?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  trendStrength?: number | null;
  volatilityPct?: number | null;
}): { label: string; confidence: number | null } {
  const strength = args.trendStrength ?? 0;
  const priceVs200 =
    args.ema200 != null && args.lastClose > 0 ? (args.lastClose >= args.ema200 ? "above EMA200" : "below EMA200") : null;

  const emaSeparationPct =
    args.ema20 != null && args.ema50 != null ? Math.abs((args.ema20 - args.ema50) / Math.max(Math.abs(args.ema50), 0.000001)) : null;

  const isRange = (emaSeparationPct ?? 1) < 0.004;
  const trendDirection =
    args.ema20 != null && args.ema50 != null ? (args.ema20 >= args.ema50 ? "bull" : "bear") : strength >= 0 ? "bull" : "bear";

  let coreLabel: string;
  if (isRange) coreLabel = "Range / consolidation";
  else if (trendDirection === "bull") {
    if (args.ema200 != null && args.lastClose < args.ema200) coreLabel = "Bullish rebound (below EMA200)";
    else if (priceVs200) coreLabel = `Bullish trend (${priceVs200})`;
    else coreLabel = "Bullish trend";
  } else {
    if (args.ema200 != null && args.lastClose > args.ema200) coreLabel = "Bearish pullback (above EMA200)";
    else if (priceVs200) coreLabel = `Bearish trend (${priceVs200})`;
    else coreLabel = "Bearish trend";
  }

  let label = coreLabel;
  if ((args.volatilityPct ?? 0) >= 3.0) label += " (high volatility)";

  const confidence = (() => {
    let score = 0;
    score += Math.min(Math.max(Math.abs(strength) * 100.0, 0), 35);
    if (emaSeparationPct != null) score += Math.min(emaSeparationPct * 5000.0, 45);
    if (priceVs200 != null) score += 10;
    if (isRange) score = Math.min(score, 35);
    if (score <= 0) return null;
    return Math.trunc(Math.min(Math.max(score, 10), 95) + 0.5);
  })();

  return { label, confidence };
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  let prev = values[0]!;
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(closes: number[], period: number): number[] {
  if (closes.length < 2) return [];
  const out: number[] = new Array(closes.length).fill(NaN);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period && i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  if (closes.length > period) {
    const rs = loss === 0 ? 100 : gain / loss;
    out[period] = 100 - 100 / (1 + rs);
  }
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    const rs = loss === 0 ? 100 : gain / loss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function atr(candles: Candle[], period: number): number[] {
  if (candles.length < 2) return [];
  const tr: number[] = [];
  tr.push(candles[0]!.high - candles[0]!.low);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    const range = c.high - c.low;
    const a = Math.abs(c.high - prevClose);
    const b = Math.abs(c.low - prevClose);
    tr.push(Math.max(range, a, b));
  }
  const out: number[] = new Array(tr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    const v = tr[i]!;
    if (i < period) sum += v;
    if (i === period - 1) {
      const first = sum / period;
      out[i] = first;
      let prev = first;
      for (let j = i + 1; j < tr.length; j++) {
        prev = (prev * (period - 1) + tr[j]!) / period;
        out[j] = prev;
      }
      break;
    }
  }
  return out;
}

function macd(closes: number[]) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i]! - ema26[i]!);
  const signal = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signal[i]!);
  return { macd: macdLine, signal, histogram };
}

function buildSummary(args: {
  symbol: string;
  timeframe: string;
  lastClose: number;
  changePct: number | null;
  regime: string;
  structure: string;
  levels: KeyLevel[];
}) {
  const last = formatCompact(args.lastClose);
  const change = args.changePct != null ? `${args.changePct >= 0 ? "+" : ""}${args.changePct.toFixed(2)}%` : "n/a";

  const nearestBelow = args.levels
    .map((l) => ({ v: Number(l.price), p: l.price, n: l.note }))
    .filter((x) => Number.isFinite(x.v))
    .filter((x) => x.v < args.lastClose)
    .sort((a, b) => b.v - a.v)[0];

  const nearestAbove = args.levels
    .map((l) => ({ v: Number(l.price), p: l.price, n: l.note }))
    .filter((x) => Number.isFinite(x.v))
    .filter((x) => x.v > args.lastClose)
    .sort((a, b) => a.v - b.v)[0];

  const parts: string[] = [];
  parts.push(`${args.symbol} ${args.timeframe} last close ${last} (${change}).`);
  parts.push(`${args.regime}. ${args.structure}.`);
  if (nearestBelow && nearestAbove) parts.push(`Nearest levels: ${nearestBelow.p} below, ${nearestAbove.p} above.`);
  else if (nearestBelow) parts.push(`Nearest support: ${nearestBelow.p}.`);
  else if (nearestAbove) parts.push(`Nearest resistance: ${nearestAbove.p}.`);
  return parts.join(" ");
}

export function analyzeMarketCandles(args: { exchange: string; symbol: string; timeframe: string; candles: Candle[] }): ChartAnalysisPayload {
  const tfKind = timeframeKindFrom(args.timeframe);
  const closes = args.candles.map((c) => c.close);
  const highs = args.candles.map((c) => c.high);
  const lows = args.candles.map((c) => c.low);

  const ema20 = ema(closes, 20).at(-1) ?? null;
  const ema50 = ema(closes, 50).at(-1) ?? null;
  const ema200 = ema(closes, 200).at(-1) ?? null;
  const rsi14 = rsi(closes, 14).at(-1);
  const atr14 = atr(args.candles, 14).at(-1);
  const macdPack = macd(closes);
  const macdHist = macdPack.histogram.at(-1) ?? null;

  const lastClose = args.candles.at(-1)?.close ?? 0;
  const prevClose = args.candles.length >= 2 ? args.candles.at(-2)?.close ?? null : null;
  const changePct = prevClose && prevClose !== 0 ? ((lastClose - prevClose) / prevClose) * 100.0 : null;

  const trendStrength = calculateTrendStrength(closes, ema20, ema50);
  const volatilityPct = atr14 && lastClose > 0 ? (atr14 / lastClose) * 100.0 : null;

  const structure = inferMarketStructure(highs, lows, tfKind);
  const regime = inferMarketRegime({ lastClose, ema20, ema50, ema200, trendStrength, volatilityPct });

  const derivedLevels = mergeKeyLevels(
    deriveSupportResistance(highs, lows, lastClose, tfKind),
    [...deriveMicroLevels(args.candles, lastClose, tfKind), ...pivotLevels(args.candles, lastClose)],
    lastClose
  );

  const { scenarios, targets } = buildScenariosAndTargets(derivedLevels, lastClose);

  const confluence: string[] = [];
  const indicators: string[] = [];
  const riskNotes: string[] = [];

  if (ema20 != null && ema50 != null) {
    const trend = ema20 >= ema50 ? "EMA20 above EMA50" : "EMA20 below EMA50";
    confluence.push(trend);
    indicators.push(`EMA20: ${formatCompact(ema20)} • EMA50: ${formatCompact(ema50)}`);
  }
  if (ema200 != null && lastClose > 0) {
    const above = lastClose >= ema200;
    confluence.push(above ? "Price above EMA200" : "Price below EMA200");
    indicators.push(`EMA200: ${formatCompact(ema200)}`);
  }
  if (Number.isFinite(rsi14)) {
    const v = rsi14!;
    const state = v >= 68 ? "overbought" : v <= 32 ? "oversold" : v > 55 ? "bullish" : v < 45 ? "bearish" : "neutral";
    confluence.push(`RSI(14) ${state}`);
    indicators.push(`RSI(14): ${Math.round(v)}`);
  }
  if (macdHist != null) confluence.push(macdHist >= 0 ? "MACD bullish" : "MACD bearish");
  confluence.push(structure);
  if (derivedLevels.length >= 6) confluence.push(`Derived ${derivedLevels.length} key levels from swings`);
  indicators.push("Pattern: none clear");
  if (volatilityPct != null) {
    indicators.push(`ATR(14) as %: ${volatilityPct.toFixed(2)}%`);
    if (volatilityPct >= 3.0) riskNotes.push(`High volatility: ATR is ${volatilityPct.toFixed(2)}% of price.`);
  }

  const bias = (() => {
    let bullPoints = 0;
    let bearPoints = 0;
    if (ema20 != null && ema50 != null) (ema20 >= ema50 ? (bullPoints += 2) : (bearPoints += 2));
    if (ema200 != null && lastClose > 0) (lastClose >= ema200 ? (bullPoints += 2) : (bearPoints += 2));
    if (macdHist != null) (macdHist >= 0 ? bullPoints++ : bearPoints++);
    if (Number.isFinite(rsi14)) {
      const v = rsi14!;
      if (v >= 68) bearPoints++;
      else if (v <= 32) bullPoints++;
      else if (v > 55) bullPoints++;
      else if (v < 45) bearPoints++;
    }
    const structureLower = structure.toLowerCase();
    if (structureLower.includes("higher highs")) bullPoints += 2;
    else if (structureLower.includes("lower highs")) bearPoints += 2;

    const regimeLower = regime.label.toLowerCase();
    if (regimeLower.includes("bullish trend")) bullPoints += 2;
    else if (regimeLower.includes("bearish trend")) bearPoints += 2;
    else if (regimeLower.includes("bullish rebound")) {
      bullPoints += 1;
      bearPoints += 1;
    } else if (regimeLower.includes("range") || regimeLower.includes("consolidation")) {
      bullPoints += 1;
      bearPoints += 1;
    }

    const total = Math.max(1, bullPoints + bearPoints);
    let bullish = Math.round((bullPoints / total) * 100);
    let bearish = Math.round((bearPoints / total) * 100);
    let neutral = Math.max(0, 100 - bullish - bearish);

    const diff = Math.abs(bullish - bearish);
    if (diff <= 10) {
      neutral = Math.max(neutral, 20);
      const remaining = 100 - neutral;
      bullish = Math.floor(remaining / 2);
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

    return { bullish, bearish, neutral } satisfies Bias;
  })();

  const summary = buildSummary({
    symbol: args.symbol,
    timeframe: args.timeframe,
    lastClose,
    changePct,
    regime: regime.label,
    structure,
    levels: derivedLevels
  });

  return {
    symbol: args.symbol,
    timeframe: args.timeframe,
    exchange: args.exchange,
    summary,
    marketRegime: regime.label,
    marketStructure: structure,
    supportResistance: derivedLevels,
    confluence,
    indicators,
    smartMoneyConcepts: [],
    scenarios,
    timeHorizonTargets: targets,
    tradeSetups: null,
    bias,
    riskNotes,
    disclaimer: "Educational tool only — not financial advice."
  };
}

