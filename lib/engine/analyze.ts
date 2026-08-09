/**
 * `MarketAnalysisEngine.analyze(...)` — port of the assembly in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines 144-621).
 *
 * Order matters throughout. Levels feed the structure layer, the structure layer feeds the
 * regime profile, the regime profile feeds the probability layer, and the probability
 * layer rewrites the scenarios. Several lists are also built by INSERTING AT INDEX 0 in
 * reverse iteration order, which is not the same as appending — the risk-note ordering on
 * the result screen depends on it.
 */

import {
  adx as computeADX,
  atr as computeATR,
  atrPctSeries,
  bollingerBands,
  calculateTrendStrength,
  ema as computeEMA,
  macd as computeMACD,
  obv as computeOBV,
  roc as computeROC,
  rsi as computeRSI,
  stochasticOscillator,
  swingPoints as computeSwingPoints,
  volatilityRegimeLabel
} from "./indicators";
import { anchoredVWAPPack, divergenceSignals, fibonacciPackage, regressionChannelPack } from "./context";
import { formatPrice, parseDoubleStrict, timeframeKind as computeTimeframeKind, timeframeMinutes } from "./format";
import {
  buildSummary,
  confluenceForSetups,
  derivativesConfluenceItems,
  derivativesRiskNotes,
  fearGreedConfluenceItems,
  fearGreedRiskNotes,
  macroRiskNotes,
  newsConfluenceItems,
  riskLevelLabel,
  sameDayHighImpactMacroAlert,
  signalLabel,
  volumeStateLabel
} from "./labels";
import { deriveMicroLevels, deriveSupportResistance, mergeKeyLevels, pivotLevels } from "./levels";
import { detectDeterministicPatterns } from "./patterns";
import {
  applyProbabilityLayerToScenarios,
  applyProbabilityLayerToSetups,
  marketRegimeProfile,
  probabilityLayer as computeProbabilityLayer,
  probabilityRiskNote,
  regimeKindLabel
} from "./profile";
import { inferMarketRegime, inferMarketStructure } from "./regime";
import { buildScenariosAndTargets } from "./scenarios";
import { applyLiveSetupFilters } from "./setupFilters";
import { buildSignals } from "./signals";
import { applyMarketStructureLayer, marketStructureLayer } from "./structure";
import { generateTradeSetups } from "./tradeSetups";
import { last as lastOf, prefix, suffix, sum } from "./swift";
import {
  allIndicatorsEnabled,
  type Candle,
  type DerivativesDigest,
  type FearGreedData,
  type IndicatorSelection,
  type KeyLevel,
  type MacroCalendarDigest,
  type MarketAnalysisMode,
  type MarketNewsDigest,
  type MarketSnapshot,
  type StrategyRiskMode,
  type TradeSetup
} from "./types";

export interface AnalyzeInput {
  exchange: string;
  symbol: string;
  timeframe: string;
  candles: readonly Candle[];
  indicatorSelection?: IndicatorSelection;
  newsDigest?: MarketNewsDigest | null;
  macroDigest?: MacroCalendarDigest | null;
  derivativesDigest?: DerivativesDigest | null;
  fearGreed?: FearGreedData | null;
  mode?: MarketAnalysisMode;
  /**
   * iOS reads this from UserDefaults inside the engine. Passed explicitly here so the
   * engine is a pure function and a server can analyse for several users concurrently.
   */
  riskMode?: StrategyRiskMode;
  /** "Now" for the macro helpers, in unix seconds. Defaults to the wall clock. */
  now?: number;
}

/** Swift: `MarketAnalysisEngine.analyze(...)`. */
export function analyze(input: AnalyzeInput): MarketSnapshot {
  const {
    exchange,
    symbol,
    timeframe,
    candles,
    indicatorSelection = allIndicatorsEnabled,
    newsDigest = null,
    macroDigest = null,
    derivativesDigest = null,
    fearGreed = null,
    mode = "live",
    riskMode = "balanced",
    now = Math.floor(Date.now() / 1000)
  } = input;

  const tfKind = computeTimeframeKind(timeframe);
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);

  const ema20Raw = lastOf(computeEMA(closes, 20));
  const ema50Raw = lastOf(computeEMA(closes, 50));
  const ema200Raw = lastOf(computeEMA(closes, 200));
  const rsi14Raw = lastOf(computeRSI(closes, 14));
  const atr14 = lastOf(computeATR(candles, 14));
  const macdPackRaw = computeMACD(closes);
  const macdPack = indicatorSelection.macd ? macdPackRaw : { macd: [], signal: [], histogram: [] };
  const macdLast = lastOf(macdPack.macd);
  const macdSignalLast = lastOf(macdPack.signal);
  const macdHistLast = lastOf(macdPack.histogram);
  const bollingerRaw = bollingerBands(closes, 20, 2.0);
  const bollinger = indicatorSelection.bollingerBands
    ? bollingerRaw
    : { middle: null, upper: null, lower: null, widthPct: null };
  const stoch = stochasticOscillator(candles, 14, 3);
  const adxPackRaw = computeADX(candles, 14);
  const adxPack = indicatorSelection.adx ? adxPackRaw : { adx: null, plusDI: null, minusDI: null };
  const obvPack = computeOBV(candles, 20);
  const roc14 = lastOf(computeROC(closes, 14));
  const atrPctHistory = atrPctSeries(candles, 14);
  const volatilityRegime = volatilityRegimeLabel(lastOf(atrPctHistory), atrPctHistory);

  const ema20 = indicatorSelection.emaTrend ? ema20Raw : null;
  const ema50 = indicatorSelection.emaTrend ? ema50Raw : null;
  const ema200 = indicatorSelection.emaTrend ? ema200Raw : null;
  const rsi14 = indicatorSelection.rsi ? rsi14Raw : null;

  const lastClose = candles.length === 0 ? 0 : candles[candles.length - 1].close;
  let changePct: number | null;
  if (candles.length >= 2 && candles[candles.length - 2].close !== 0) {
    const prev = candles[candles.length - 2].close;
    changePct = ((lastClose - prev) / prev) * 100.0;
  } else {
    changePct = null;
  }

  const trendStrength = calculateTrendStrength(closes, ema20, ema50);
  const volatilityPct = atr14 !== null && lastClose > 0 ? (atr14 / lastClose) * 100.0 : null;
  const { state: volumeState, note: volumeNote } = volumeStateLabel(
    exchange,
    symbol,
    candles,
    volatilityPct,
    volatilityRegime
  );
  const volumeLastToAvg20 = ((): number | null => {
    if (candles.length < 25) return null;
    const recent20 = suffix(candles, 20).map((candle) => candle.volume);
    const avg = sum(recent20) / recent20.length;
    if (!(avg > 0)) return null;
    return candles[candles.length - 1].volume / avg;
  })();

  const structure = inferMarketStructure(highs, lows, tfKind);
  const { label: regimeLabel, confidence: regimeConfidence } = inferMarketRegime({
    lastClose,
    ema20,
    ema50,
    ema200,
    structure,
    trendStrength,
    volatilityPct,
    rsi14,
    macdHistogram: macdHistLast,
    adxValue: adxPack.adx,
    plusDI: adxPack.plusDI,
    minusDI: adxPack.minusDI,
    roc14
  });

  const fib = indicatorSelection.fibonacci
    ? fibonacciPackage(candles, lastClose, tfKind)
    : { labels: [], keyLevels: [], extensionLevels: [], confluence: [] };

  const microLevels = deriveMicroLevels(candles, lastClose, tfKind);
  const pivots = pivotLevels(candles, lastClose);

  const swings = computeSwingPoints(candles, tfKind);
  const avwap = anchoredVWAPPack(candles, volumes, lastClose, regimeLabel, structure, swings);
  const regressionChannel = regressionChannelPack(closes, lastClose, tfKind);
  const rsiSeries = computeRSI(closes, 14);
  const divergences = divergenceSignals(candles, rsiSeries, swings);

  // A six-letter alphabetic base with an "=X" suffix is a real FX pair; the metals
  // (XAUUSD=X and friends) share the suffix but behave like commodities.
  const isYahooFX = ((): boolean => {
    const upper = symbol.toUpperCase();
    if (!upper.endsWith("=X")) return false;
    const base = upper.slice(0, -2);
    if (
      base.startsWith("XAU") ||
      base.startsWith("XAG") ||
      base.startsWith("XPT") ||
      base.startsWith("XPD") ||
      base.startsWith("XCU")
    ) {
      return false;
    }
    return base.length === 6 && /^[A-Za-z]+$/.test(base);
  })();

  const mergedLevels = mergeKeyLevels(
    deriveSupportResistance(highs, lows, lastClose, tfKind),
    [...microLevels, ...fib.keyLevels, ...fib.extensionLevels, ...pivots],
    lastClose
  );

  const derivedLevels = buildDerivedLevels({
    mergedLevels,
    isYahooFX,
    atr14,
    lastClose,
    timeframe,
    tfKind
  });

  const structureLayer = marketStructureLayer(candles, swings, derivedLevels, atr14, tfKind);
  const regimeProfile = marketRegimeProfile({
    regimeLabel,
    regimeConfidence,
    structure,
    structureLayer,
    trendStrength,
    volatilityPct,
    volatilityRegime,
    adxValue: adxPack.adx,
    plusDI: adxPack.plusDI,
    minusDI: adxPack.minusDI,
    rsi14,
    stochK: stoch.k,
    volumeState
  });

  const built = buildScenariosAndTargets(derivedLevels, lastClose, symbol, timeframe);
  let scenarios = built.scenarios;
  const targets = built.targets;

  let tradeSetups: TradeSetup[] = generateTradeSetups({
    symbol,
    timeframe,
    lastCandle: candles.length === 0 ? null : candles[candles.length - 1],
    lastClose,
    atr14,
    volatilityPct,
    volumeState,
    volumeLastToAvg20,
    levels: derivedLevels,
    regimeLabel,
    structure,
    confluence: confluenceForSetups(fib.confluence),
    ema20,
    ema50,
    ema200,
    avwapVwap: avwap?.vwap ?? null,
    bollingerMiddle: bollinger.middle,
    rsi14,
    stochK: stoch.k,
    stochD: stoch.d,
    macdHist: macdHistLast,
    volatilityRegimeLabel: volatilityRegime?.label ?? null,
    volatilityRegimePercentile: volatilityRegime?.percentile ?? null,
    obvDelta: obvPack.delta,
    roc14Pct: roc14,
    regressionSlopePct: regressionChannel?.slopePctPerBar ?? null,
    trendStrength,
    divergenceSignals: divergences,
    patternSignals: detectDeterministicPatterns(candles, swings),
    structureLayer,
    adx: adxPack,
    useEMAFilter: indicatorSelection.emaTrend,
    useRSIFilter: indicatorSelection.rsi,
    useMACDFilter: indicatorSelection.macd,
    useADXFilter: indicatorSelection.adx,
    useVolumeFilter: indicatorSelection.volume,
    mode,
    riskMode
  });

  const {
    confluence,
    indicators,
    bias,
    riskNotes
  } = buildSignals({
    regimeLabel,
    ema20,
    ema50,
    ema200,
    rsi14,
    stochK: stoch.k,
    stochD: stoch.d,
    atr14,
    volatilityPct,
    volatilityRegime,
    trendStrength,
    structure,
    candles,
    levels: derivedLevels,
    fibConfluence: fib.confluence,
    bollinger,
    adx: adxPack,
    obv: obvPack,
    avwap,
    roc14,
    regressionChannel,
    divergenceSignals: divergences,
    structureLayer,
    swingPoints: swings,
    macd: macdLast,
    macdSignal: macdSignalLast,
    macdHist: macdHistLast,
    indicatorSelection
  });

  const probability = computeProbabilityLayer({
    regimeLabel,
    regimeProfile,
    structureLayer,
    bias,
    rsi14,
    stochK: stoch.k,
    macdHist: macdHistLast,
    adx: adxPack,
    volumeState,
    volatilityRegime,
    riskMode
  });
  scenarios = applyProbabilityLayerToScenarios(scenarios, probability);

  tradeSetups = applyLiveSetupFilters({
    setups: tradeSetups,
    symbol,
    timeframe,
    regimeLabel,
    regimeConfidence,
    bias,
    mode
  });
  tradeSetups = applyMarketStructureLayer(tradeSetups, structureLayer, regimeLabel, structure);
  tradeSetups = applyProbabilityLayerToSetups(tradeSetups, probability);
  if (macroDigest !== null) {
    const macroAlert = sameDayHighImpactMacroAlert(macroDigest, now);
    if (macroAlert !== null) {
      tradeSetups = tradeSetups.map((setup) => {
        if (setup.notes.includes(macroAlert)) return setup;
        return { ...setup, notes: [macroAlert, ...setup.notes] };
      });
    }
  }

  const signal = signalLabel(regimeLabel, tradeSetups);
  const riskLevel = riskLevelLabel(volatilityPct, volatilityRegime);

  // Everything below prepends. Iterating a source list in reverse and inserting each item
  // at index 0 preserves that list's own order while pushing it ahead of what came before.
  const augmentedRiskNotes = [...riskNotes];
  const prependUnique = (note: string): void => {
    if (!augmentedRiskNotes.includes(note)) augmentedRiskNotes.unshift(note);
  };

  prependUnique(`Regime implication: ${regimeProfile.implication}`);
  if (volumeNote !== null) prependUnique(volumeNote);
  if (macroDigest !== null) {
    for (const note of [...macroRiskNotes(macroDigest, now)].reverse()) prependUnique(note);
  }
  if (derivativesDigest !== null) {
    for (const note of [...derivativesRiskNotes(derivativesDigest)].reverse()) prependUnique(note);
  }
  if (fearGreed !== null) {
    for (const note of [...fearGreedRiskNotes(fearGreed, symbol)].reverse()) prependUnique(note);
  }
  for (const signalText of [...divergences].reverse()) {
    prependUnique(`Divergence: ${signalText}`);
  }
  for (const note of [...structureLayer.riskNotes].reverse()) prependUnique(note);
  prependUnique(probabilityRiskNote(probability));

  const summary = buildSummary(symbol, timeframe, lastClose, changePct, regimeLabel, structure, derivedLevels);

  const enrichedConfluence = [...confluence];
  const appendUnique = (item: string): void => {
    if (!enrichedConfluence.includes(item)) enrichedConfluence.push(item);
  };
  appendUnique(
    `Market regime: ${regimeKindLabel[regimeProfile.kind]} (${regimeProfile.confidence}% confidence)`
  );
  for (const item of regimeProfile.characteristics) appendUnique(item);
  for (const item of structureLayer.confluenceItems) appendUnique(item);
  if (newsDigest !== null) {
    for (const item of newsConfluenceItems(newsDigest)) appendUnique(item);
  }
  if (derivativesDigest !== null) {
    for (const item of derivativesConfluenceItems(derivativesDigest)) appendUnique(item);
  }
  if (fearGreed !== null) {
    for (const item of fearGreedConfluenceItems(fearGreed, symbol)) appendUnique(item);
  }

  return {
    exchange,
    symbol,
    timeframe,
    candleCount: candles.length,
    start: candles.length === 0 ? now : candles[0].openTime,
    end: candles.length === 0 ? now : candles[candles.length - 1].openTime,
    lastClose,
    changePct,
    marketRegime: regimeLabel,
    marketStructure: structure,
    regimeConfidence,
    signal,
    riskLevel,
    volumeState,
    summary,
    indicators,
    confluence: enrichedConfluence,
    fibLevels: fib.labels,
    supportResistance: derivedLevels,
    scenarios,
    targets,
    tradeSetups,
    bias,
    riskNotes: augmentedRiskNotes,
    news: newsDigest,
    macroCalendar: macroDigest,
    derivatives: derivativesDigest,
    fearGreed
  };
}

interface DerivedLevelsInput {
  mergedLevels: KeyLevel[];
  isYahooFX: boolean;
  atr14: number | null;
  lastClose: number;
  timeframe: string;
  tfKind: ReturnType<typeof computeTimeframeKind>;
}

/**
 * The FX-only level narrowing from `analyze()`.
 *
 * Yahoo FX levels cluster far from price, so for real FX pairs the set is trimmed to the
 * one or two levels per side that sit within an ATR-scaled window, with a relaxed second
 * pass and finally a synthetic ATR reference so a side is never left empty. Every other
 * instrument keeps the merged set untouched.
 */
function buildDerivedLevels(input: DerivedLevelsInput): KeyLevel[] {
  const { mergedLevels, isYahooFX, atr14, lastClose, timeframe, tfKind } = input;
  if (!isYahooFX || atr14 === null || !(atr14 > 0)) return mergedLevels;

  let nearbyWindow: number;
  const minutes = timeframeMinutes(timeframe);
  if (minutes !== null) {
    switch (minutes) {
      case 15:
        nearbyWindow = 2.4;
        break;
      case 30:
        nearbyWindow = 3.2;
        break;
      case 60:
        nearbyWindow = 3.6;
        break;
      case 120:
      case 240:
        nearbyWindow = 4.2;
        break;
      default:
        nearbyWindow = 4.6;
        break;
    }
  } else {
    switch (tfKind) {
      case "daily":
        nearbyWindow = 5.2;
        break;
      case "weekly":
        nearbyWindow = 6.5;
        break;
      case "monthly":
        nearbyWindow = 8.0;
        break;
      default:
        nearbyWindow = 4.2;
        break;
    }
  }

  const byPrice = (a: KeyLevel, b: KeyLevel) => (parseDoubleStrict(a.price) ?? 0) - (parseDoubleStrict(b.price) ?? 0);

  const nearby = mergedLevels.filter((level) => {
    const value = parseDoubleStrict(level.price);
    if (value === null) return false;
    return Math.abs(value - lastClose) / atr14 <= nearbyWindow;
  });

  const nearbySupports = nearby.filter((level) => level.kind === "support").sort(byPrice);
  const nearbyResistances = nearby.filter((level) => level.kind === "resistance").sort(byPrice);
  const allSupports = mergedLevels.filter((level) => level.kind === "support").sort(byPrice);
  const allResistances = mergedLevels.filter((level) => level.kind === "resistance").sort(byPrice);

  const visiblePerSide = tfKind === "intraday" ? 1 : 2;
  const supports = suffix(nearbySupports, visiblePerSide);
  const resistances = prefix(nearbyResistances, visiblePerSide);

  const nearestUsableLevel = (levels: readonly KeyLevel[], isSupport: boolean): KeyLevel | null => {
    const ordered = isSupport ? [...levels].reverse() : levels;
    const relaxedWindow = nearbyWindow * (tfKind === "intraday" ? 1.35 : 1.75);
    for (const level of ordered) {
      const value = parseDoubleStrict(level.price);
      if (value === null) continue;
      if (Math.abs(value - lastClose) / atr14 > relaxedWindow) continue;
      return level;
    }
    return null;
  };

  const atrMultiple = tfKind === "daily" ? 0.9 : tfKind === "weekly" ? 1.1 : tfKind === "monthly" ? 1.4 : 1.0;
  const distance = Math.max(atr14 * atrMultiple, lastClose >= 20 ? 0.12 : 0.00035);

  if (supports.length === 0) {
    const fallback = nearestUsableLevel(allSupports, true);
    if (fallback !== null) {
      supports.push(fallback);
    } else {
      supports.push({
        price: formatPrice(Math.max(lastClose - distance, 0.0001)),
        kind: "support",
        note: "ATR downside reference"
      });
    }
  }
  if (resistances.length === 0) {
    const fallback = nearestUsableLevel(allResistances, false);
    if (fallback !== null) {
      resistances.push(fallback);
    } else {
      resistances.push({
        price: formatPrice(lastClose + distance),
        kind: "resistance",
        note: "ATR upside reference"
      });
    }
  }

  const stitched = [...supports, ...resistances];
  if (stitched.length === 0) return mergedLevels;

  const seen = new Set<string>();
  return stitched
    .filter((level) => {
      const key = `${level.kind}|${level.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(byPrice);
}
