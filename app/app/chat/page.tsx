import Placeholder from "../_components/Placeholder";

export default function ChatPage() {
  return (
    <Placeholder
      title="AI coach"
      summary="Free-form chat with live market context attached."
      waitingOn={[
        "A route handler proxying the existing support-chat / openai-proxy edge functions with the user's session",
        "The market-context builder that iOS attaches to each message"
      ]}
    />
  );
}
