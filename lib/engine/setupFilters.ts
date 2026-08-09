/**
 * Live-mode setup filtering — port of `applyLiveSetupFilters` in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines ~847-914).
 *
 * Runs only in `live` mode: a backtest must see every generated setup, otherwise its
 * results would not describe the strategy being tested. In live mode these rules drop
 * ideas that fight a strong context, plus two timeframe-specific carve-outs that came
 * from observed whipsaw.
 */

import { timeframeMinutes } from "./format";
import type { Bias, MarketAnalysisMode, TradeSetup } from "./types";

export interface LiveSetupFilterInput {
  setups: readonly TradeSetup[];
  symbol: string;
  timeframe: string;
  regimeLabel: string;
  regimeConfidence: number | null;
  bias: Bias | null;
  mode: MarketAnalysisMode;
}

/** Swift: `applyLiveSetupFilters(setups:symbol:timeframe:regimeLabel:regimeConfidence:bias:mode:)`. */
export function applyLiveSetupFilters(input: LiveSetupFilterInput): TradeSetup[] {
  const { setups, timeframe, regimeLabel, regimeConfidence, bias, mode } = input;
  if (mode !== "live") return [...setups];
  if (setups.length === 0) return [...setups];

  const tfMinutes = timeframeMinutes(timeframe) ?? 0;
  const regime = regimeLabel.trim().toLowerCase();
  const isRange = regime.includes("range") || regime.includes("consolidation");
  const conf = regimeConfidence ?? 0;
  const bullish = bias?.bullish ?? 0;
  const bearish = bias?.bearish ?? 0;

  return setups.filter((setup) => {
    const text = `${setup.setup} ${setup.trigger}`.toLowerCase();
    const direction = setup.direction.trim().toLowerCase();
    const isBullishSetup = direction.includes("bull");
    const isBearishSetup = direction.includes("bear");
    const strongBullishContext =
      bullish >= bearish + 18 ||
      ((regime.includes("bullish trend") || regime.includes("bullish rebound")) && bullish >= bearish + 8);
    const strongBearishContext =
      bearish >= bullish + 18 ||
      ((regime.includes("bearish trend") || regime.includes("bearish pullback")) && bearish >= bullish + 8);
    const directionalIdea =
      text.includes("watch") ||
      text.includes("reclaim") ||
      text.includes("breakdown") ||
      text.includes("pullback") ||
      text.includes("continuation") ||
      text.includes("range rotation") ||
      text.includes("fade") ||
      text.includes("rejection");

    if (directionalIdea) {
      if (isBullishSetup && strongBearishContext) return false;
      if (isBearishSetup && strongBullishContext) return false;
    }

    // Continuation entries in choppy 30m environments tend to whipsaw. Keep
    // breakdown-continuation shorts only when regime and bias clearly favour trend-following.
    if (tfMinutes === 30 && text.includes("30m breakdown continuation short")) {
      const strongBearRegime = regime.includes("bearish trend") || regime.includes("bearish pullback");
      const strongBias = bearish >= 56 && bearish >= bullish + 10;
      if (!(strongBearRegime && strongBias && conf >= 32 && !isRange)) {
        return false;
      }
    }

    // 15m range-bounce longs are whipsaw-prone; require stronger confirmation.
    if (tfMinutes <= 15 && text.includes("range bounce long")) {
      const supportiveRange = isRange && bullish >= bearish + 12;
      const supportiveTrend =
        (regime.includes("bullish trend") || regime.includes("bullish rebound")) && bullish >= 55;
      if (!(supportiveRange || supportiveTrend)) {
        return false;
      }
    }

    return true;
  });
}
