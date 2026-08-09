import Placeholder from "../_components/Placeholder";

export default function PickPage() {
  return (
    <Placeholder
      title="Pick a market"
      summary="Choose a symbol and timeframe, then run the full analysis engine on live candles."
      waitingOn={[
        "MarketDataService port (Yahoo / Stooq / Binance candle fetching via route handlers)",
        "MarketAnalysisEngine.analyze() assembly — indicators, regime, structure and levels are ported and passing parity",
        "generateTradeSetups — the trade ideas, entries, stops and R:R"
      ]}
    />
  );
}
