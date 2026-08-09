/**
 * Types mirroring the iOS models the engine reads and writes.
 *
 * Source of truth:
 *   - `Candle`                → ChartGPT/MarketDataService.swift
 *   - `ChartAnalysisPayload`  → ChartGPT/OpenAIClient.swift
 *   - `MarketSnapshot`, `IndicatorSelection`, `MarketAnalysisMode`
 *                             → ChartGPT/MarketAnalysisEngine.swift
 *   - the three digests       → MarketNewsService / MacroCalendarService / DerivativesDataService
 *
 * Optionals are modelled as `T | null` rather than `T | undefined`, because Swift's
 * `Optional` round-trips through JSON as an explicit null and the golden fixtures
 * distinguish "absent" from "null".
 */

/** Timestamps are unix seconds. Converted to Swift's 2001 epoch only at the JSON boundary. */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// MARK: - ChartAnalysisPayload

export interface KeyLevel {
  price: string;
  kind: string;
  note: string | null;
}

export interface Scenario {
  name: string;
  trigger: string;
  path: string;
  invalidation: string | null;
  probability: number | null;
}

export interface Bias {
  bullish: number | null;
  bearish: number | null;
  neutral: number | null;
}

export interface TimeHorizonTargets {
  shortTerm: string[];
  mediumTerm: string[];
  longTerm: string[];
}

export interface TradeSetup {
  horizon: string;
  direction: string;
  setup: string;
  trigger: string;
  entry: string | null;
  invalidation: string | null;
  stop: string | null;
  targets: string[];
  rr: string | null;
  notes: string[];
  /** Human-readable lines explaining WHY this setup was generated. */
  rationale: string[];
}

export interface ChartAnalysisPayload {
  symbol: string | null;
  timeframe: string | null;
  exchange: string | null;
  /** Provider-specific symbol for market data fetching (e.g. "GC=F", "BTCUSDT"). */
  dataSymbol: string | null;
  /** Which data source to use: "yahoo", "binance", "binancefutures". */
  dataSource: string | null;
  summary: string | null;
  marketRegime: string | null;
  marketStructure: string | null;
  supportResistance: KeyLevel[];
  confluence: string[];
  indicators: string[];
  smartMoneyConcepts: string[];
  scenarios: Scenario[];
  timeHorizonTargets: TimeHorizonTargets | null;
  tradeSetups: TradeSetup[] | null;
  bias: Bias | null;
  riskNotes: string[];
  disclaimer: string | null;
  newsDigest: MarketNewsDigest | null;
  macroDigest: MacroCalendarDigest | null;
  derivativesDigest: DerivativesDigest | null;
  fearGreed: FearGreedData | null;
}

// MARK: - Supplemental digests

export interface MarketNewsItem {
  title: string;
  url: string;
  source: string | null;
  publishedAt: number | null;
  snippet: string | null;
  tone: number | null;
  imageUrl?: string | null;
}

export interface MarketNewsDigest {
  query: string;
  lookbackDays: number;
  fetchedAt: number;
  summary: string | null;
  errorMessage: string | null;
  items: MarketNewsItem[];
}

export interface MacroCalendarEvent {
  title: string;
  currency: string;
  impact: string | null;
  scheduledAt: number | null;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

export interface MacroCalendarDigest {
  fetchedAt: number;
  currencies: string[];
  lookaheadDays: number;
  source: string;
  errorMessage: string | null;
  events: MacroCalendarEvent[];
}

export interface DerivativesDigest {
  fetchedAt: number;
  source: string;
  errorMessage: string | null;
  /** Funding rate as a decimal, e.g. 0.0001 = 0.01% per 8h. */
  fundingRate: number | null;
  fundingRateNextAt: number | null;
  /** Open interest in USD (latest snapshot). */
  openInterest: number | null;
  /** 24-hour change in open interest, as a percentage. */
  openInterestChange24h: number | null;
  /** Global long/short account ratio. */
  longShortRatio: number | null;
  /** Fraction of accounts net long, e.g. 0.618 = 61.8%. */
  longAccountPct: number | null;
  shortAccountPct: number | null;
}

export interface FearGreedData {
  value: number;
  classification: string;
  source: string;
}

// MARK: - Engine inputs

export type MarketAnalysisMode = "live" | "backtest";

export type StrategyRiskMode = "conservative" | "balanced" | "aggressive";

export interface IndicatorSelection {
  emaTrend: boolean;
  rsi: boolean;
  bollingerBands: boolean;
  macd: boolean;
  fibonacci: boolean;
  adx: boolean;
  volume: boolean;
}

export const allIndicatorsEnabled: IndicatorSelection = {
  emaTrend: true,
  rsi: true,
  bollingerBands: true,
  macd: true,
  fibonacci: true,
  adx: true,
  volume: true
};

// MARK: - Engine output

export interface MarketSnapshot {
  exchange: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  /** Unix seconds. */
  start: number;
  /** Unix seconds. */
  end: number;
  lastClose: number;
  changePct: number | null;
  marketRegime: string;
  marketStructure: string;
  regimeConfidence: number | null;
  signal: string;
  riskLevel: string;
  volumeState: string;
  summary: string;
  indicators: string[];
  confluence: string[];
  fibLevels: string[];
  supportResistance: KeyLevel[];
  scenarios: Scenario[];
  targets: TimeHorizonTargets;
  tradeSetups: TradeSetup[];
  bias: Bias | null;
  riskNotes: string[];
  news: MarketNewsDigest | null;
  macroCalendar: MacroCalendarDigest | null;
  derivatives: DerivativesDigest | null;
  fearGreed: FearGreedData | null;
}

// MARK: - Internal engine value types

export type TimeframeKind = "intraday" | "daily" | "weekly" | "monthly";

export interface BollingerPack {
  middle: number | null;
  upper: number | null;
  lower: number | null;
  widthPct: number | null;
}

export interface StochasticPack {
  k: number | null;
  d: number | null;
}

export interface ADXPack {
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
}

export interface OBVPack {
  obv: number | null;
  delta: number | null;
}

export interface VolatilityRegime {
  label: string;
  percentile: number | null;
}

export type SwingPointKind = "high" | "low";

export interface SwingPoint {
  index: number;
  price: number;
  kind: SwingPointKind;
}
