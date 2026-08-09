import Placeholder from "../_components/Placeholder";

export default function NewsPage() {
  return (
    <Placeholder
      title="News scanner"
      summary="Global market news, scanned and scored."
      waitingOn={[
        "A route handler calling the existing news-scan edge function",
        "The NewsScannerViewModel state machine port (filters, per-asset grouping, tone scoring)"
      ]}
    />
  );
}
