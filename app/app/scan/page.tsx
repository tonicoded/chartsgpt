import Placeholder from "../_components/Placeholder";

export default function ScanPage() {
  return (
    <Placeholder
      title="Scan a chart"
      summary="Upload a chart screenshot; the AI identifies the market and the engine analyses live candles for it."
      waitingOn={[
        "ChartIdentification port (openai-proxy vision call, identification only — iOS does not analyse the image itself)",
        "An OCR step to replace Apple Vision for price-axis context",
        "The Pick tab's engine pipeline, which this tab reuses once the market is identified"
      ]}
    />
  );
}
