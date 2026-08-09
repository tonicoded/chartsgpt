import Placeholder from "../_components/Placeholder";

export default function TrackerPage() {
  return (
    <Placeholder
      title="Setup tracker"
      summary="Track the setups you took and how they resolved."
      waitingOn={[
        "A Supabase table for web-side tracked setups (iOS keeps these in SetupTrackerStore on-device)",
        "The trade-setup model, which lands with generateTradeSetups"
      ]}
    />
  );
}
