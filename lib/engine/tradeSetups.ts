/**
 * Trade setup generation — port of `generateTradeSetups` in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines 1558-7292).
 *
 * ⚠️ NOT YET PORTED. This is the largest single piece of the engine: ~5,730 lines across
 * 103 helpers, with separate branches for FX, crypto majors/alts, equities, indices and
 * futures, five timeframe buckets, and a multi-pass selection and filtering stage.
 *
 * Returning an empty list is the honest placeholder: `signalLabel` correctly reports
 * "Hold" for zero setups, so the rest of the snapshot stays internally consistent instead
 * of showing invented entries and stops. Every other field of the snapshot is unaffected
 * by this stub, which is why the full-snapshot parity suite can already validate them.
 *
 * See PORTING.md for the recommended porting order.
 */

import type {
  ADXPack,
  Candle,
  KeyLevel,
  MarketAnalysisMode,
  StrategyRiskMode,
  TradeSetup
} from "./types";
import type { MarketStructureLayer } from "./structure";

export interface GenerateTradeSetupsInput {
  symbol: string;
  timeframe: string;
  lastCandle: Candle | null;
  lastClose: number;
  atr14: number | null;
  volatilityPct: number | null;
  volumeState: string;
  volumeLastToAvg20: number | null;
  levels: readonly KeyLevel[];
  regimeLabel: string;
  structure: string;
  confluence: readonly string[];
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  avwapVwap: number | null;
  bollingerMiddle: number | null;
  rsi14: number | null;
  stochK: number | null;
  stochD: number | null;
  macdHist: number | null;
  volatilityRegimeLabel: string | null;
  volatilityRegimePercentile: number | null;
  obvDelta: number | null;
  roc14Pct: number | null;
  regressionSlopePct: number | null;
  trendStrength: number | null;
  divergenceSignals: readonly string[];
  patternSignals: readonly string[];
  structureLayer: MarketStructureLayer;
  adx: ADXPack;
  useEMAFilter: boolean;
  useRSIFilter: boolean;
  useMACDFilter: boolean;
  useADXFilter: boolean;
  useVolumeFilter: boolean;
  mode: MarketAnalysisMode;
  /** iOS reads this from UserDefaults inside the generator; explicit here. */
  riskMode: StrategyRiskMode;
}

/** Swift: `generateTradeSetups(...)`. Placeholder — see the file comment. */
export function generateTradeSetups(_input: GenerateTradeSetupsInput): TradeSetup[] {
  return [];
}

/** True while `generateTradeSetups` is still a placeholder, so tests can scope expectations. */
export const TRADE_SETUPS_PORTED = false;
