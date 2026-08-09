/**
 * Live smoke test against the real data providers, then the engine over what came back.
 * Hits the network, so it is opt-in: run with LIVE_MARKET=1 npx vitest run test/smoke.
 */
import { describe, expect, it } from "vitest";
import { fetchCandles } from "../../lib/market/candles";
import { analyze } from "../../lib/engine/analyze";

const live = process.env.LIVE_MARKET === "1";

describe.runIf(live)("live market data + engine", () => {
  for (const target of [
    { source: "binance" as const, symbol: "BTCUSDT", timeframe: "1h" },
    { source: "yahoo" as const, symbol: "AAPL", timeframe: "1d" },
    { source: "yahoo" as const, symbol: "EURUSD=X", timeframe: "1h" }
  ]) {
    it(`${target.symbol} ${target.timeframe} via ${target.source}`, async () => {
      const market = await fetchCandles(target);
      expect(market.candles.length).toBeGreaterThan(100);

      const snapshot = analyze({
        exchange: market.sourceExchange,
        symbol: market.sourceSymbol,
        timeframe: market.sourceTimeframe,
        candles: market.candles
      });

      expect(snapshot.lastClose).toBeGreaterThan(0);
      expect(snapshot.marketRegime.length).toBeGreaterThan(0);
      expect(snapshot.indicators.length).toBeGreaterThanOrEqual(10);
      expect(snapshot.supportResistance.length).toBeGreaterThan(0);

      console.log(
        `\n${market.sourceSymbol} ${market.sourceTimeframe} (${market.sourceExchange}, ${market.candles.length} candles)\n` +
          `  last close: ${snapshot.lastClose}\n` +
          `  regime:     ${snapshot.marketRegime} (${snapshot.regimeConfidence}%)\n` +
          `  structure:  ${snapshot.marketStructure}\n` +
          `  bias:       ${snapshot.bias?.bullish}/${snapshot.bias?.bearish}/${snapshot.bias?.neutral}\n` +
          `  risk:       ${snapshot.riskLevel} • volume: ${snapshot.volumeState} • signal: ${snapshot.signal}\n` +
          `  levels:     ${snapshot.supportResistance.map((l) => l.price).join(", ")}\n` +
          `  setups:     ${snapshot.tradeSetups.length}`
      );
    });
  }
});
