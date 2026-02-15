export type MarketMode = "trend" | "range";
export type TrendBias = "bullish" | "bearish";
export type Volatility = "low" | "normal" | "high";
export type TriggerStyle = "break_close" | "sweep_reclaim" | "retest_hold";

export type SimulatorInput = {
  asset: string;
  timeframe: string;
  mode: MarketMode;
  bias: TrendBias;
  volatility: Volatility;
  currentPrice?: number;
  keySupport?: number;
  keyResistance?: number;
  swingLow?: number;
  swingHigh?: number;
  rangeLow?: number;
  rangeHigh?: number;
  riskPct?: number;
  preferredTrigger: TriggerStyle;
};

export type Scenario = {
  name: string;
  thesis: string;
  trigger: string;
  invalidation: string;
  target: string;
};

export type SimulatorOutput = {
  headline: string;
  contextLine: string;
  levels: string[];
  scenarios: Scenario[];
  riskNotes: string[];
  planSummary: string[];
  disclaimer: string;
};

function fmt(n?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 6;
  return n.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function pickTrigger(preferred: TriggerStyle, side: "bull" | "bear") {
  if (preferred === "break_close") {
    return side === "bull"
      ? "Break + close above the level on the execution timeframe (acceptance)."
      : "Break + close below the level on the execution timeframe (acceptance).";
  }
  if (preferred === "sweep_reclaim") {
    return side === "bull"
      ? "Sweep below the level (wick), then reclaim with a close back above the zone."
      : "Sweep above the level (wick), then reclaim with a close back below the zone.";
  }
  return side === "bull"
    ? "Retest the broken level from above, hold the zone, then show a push away (retest hold)."
    : "Retest the broken level from below, hold the zone, then show a push away (retest hold).";
}

export function simulateAnalysis(input: SimulatorInput): SimulatorOutput {
  const asset = (input.asset || "this market").trim();
  const tf = (input.timeframe || "1H").trim();
  const mode = input.mode;
  const bias = input.bias;

  const support = input.keySupport ?? (mode === "range" ? input.rangeLow : input.swingLow);
  const resistance = input.keyResistance ?? (mode === "range" ? input.rangeHigh : input.swingHigh);

  const levels: string[] = [];
  if (typeof support === "number") levels.push(`Support zone: ${fmt(support)}`);
  if (typeof resistance === "number") levels.push(`Resistance zone: ${fmt(resistance)}`);
  if (typeof input.swingHigh === "number") levels.push(`Swing high (context): ${fmt(input.swingHigh)}`);
  if (typeof input.swingLow === "number") levels.push(`Swing low (context): ${fmt(input.swingLow)}`);
  if (typeof input.rangeHigh === "number") levels.push(`Range high (context): ${fmt(input.rangeHigh)}`);
  if (typeof input.rangeLow === "number") levels.push(`Range low (context): ${fmt(input.rangeLow)}`);

  const volatilityNote =
    input.volatility === "high"
      ? "High volatility → treat levels as zones, demand stronger confirmation, and size smaller."
      : input.volatility === "low"
        ? "Low volatility → avoid overtrading; require clean triggers (no chop entries)."
        : "Normal volatility → standard confirmation rules apply.";

  const contextLine =
    mode === "range"
      ? `On the ${tf}, ${asset} is ranging. Plan two scenarios at the range edges with a clear trigger and invalidation.`
      : `On the ${tf}, ${asset} is trending (${bias}). Plan pullbacks/retests at key zones with a trigger and invalidation.`;

  const bullScenario: Scenario = {
    name: "Bull scenario",
    thesis:
      typeof support === "number"
        ? `If price reacts positively around ${fmt(support)}, buyers are defending the zone.`
        : "If price holds the nearest demand zone, buyers may defend support.",
    trigger: pickTrigger(input.preferredTrigger, "bull"),
    invalidation:
      typeof support === "number"
        ? `Invalid if price accepts below support (close below ${fmt(support)} and holds).`
        : "Invalid if price accepts below support and holds on the wrong side.",
    target:
      typeof resistance === "number"
        ? `Target the next resistance / liquidity area near ${fmt(resistance)}.`
        : "Target the next resistance / prior swing high."
  };

  const bearScenario: Scenario = {
    name: "Bear scenario",
    thesis:
      typeof resistance === "number"
        ? `If price fails around ${fmt(resistance)}, sellers are defending the zone.`
        : "If price rejects the nearest supply zone, sellers may defend resistance.",
    trigger: pickTrigger(input.preferredTrigger, "bear"),
    invalidation:
      typeof resistance === "number"
        ? `Invalid if price accepts above resistance (close above ${fmt(resistance)} and holds).`
        : "Invalid if price accepts above resistance and holds on the wrong side.",
    target:
      typeof support === "number"
        ? `Target the next support / liquidity area near ${fmt(support)}.`
        : "Target the next support / prior swing low."
  };

  const riskPct = typeof input.riskPct === "number" ? input.riskPct : undefined;
  const riskNotes: string[] = [];
  if (riskPct != null) {
    riskNotes.push(`Risk per trade: ${fmt(riskPct)}% (keep it consistent).`);
  } else {
    riskNotes.push("Pick a repeatable risk per trade (example: 0.5%–1%).");
  }
  riskNotes.push("Stops go where the idea is wrong (invalidation), not where it feels tight.");
  riskNotes.push(volatilityNote);

  const planSummary = [
    `Context: ${mode === "range" ? "range" : `${bias} trend`} on ${tf}.`,
    `Levels: ${levels.length ? levels.slice(0, 2).join(" • ") : "mark 2–4 key zones."}`,
    `Bull: trigger → invalidation → target.`,
    `Bear: trigger → invalidation → target.`,
    "Execute only after trigger; no trigger = no trade."
  ];

  return {
    headline: `ChartsGPT Analysis Simulator (No AI): ${asset} on ${tf}`,
    contextLine,
    levels: levels.length ? levels : ["Add 2–4 key zones (support/resistance) to get the cleanest output."],
    scenarios: [bullScenario, bearScenario],
    riskNotes,
    planSummary,
    disclaimer: "Educational tool only — not financial advice. Outputs are simplified and can be wrong."
  };
}

