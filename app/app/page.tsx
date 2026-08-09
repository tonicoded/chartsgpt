import Link from "next/link";

/** Port of the Hub tab from `RootTabView.swift` — tiles linking to every feature. */
const TILES = [
  {
    href: "/app/scan",
    icon: "📷",
    title: "Scan a chart",
    body: "Upload a chart screenshot. The AI identifies the market, then the engine analyses live candles for it."
  },
  {
    href: "/app/pick",
    icon: "🎯",
    title: "Pick a market",
    body: "Choose a symbol and timeframe directly and run the full analysis engine without a screenshot."
  },
  {
    href: "/app/chat",
    icon: "💬",
    title: "AI coach",
    body: "Free-form chat with live market context attached, the same prompt the iOS assistant uses."
  },
  {
    href: "/app/news",
    icon: "📰",
    title: "News scanner",
    body: "Global market news, scanned and scored through the news-scan edge function."
  },
  {
    href: "/app/tracker",
    icon: "📈",
    title: "Setup tracker",
    body: "Track the setups you took and how they resolved against their triggers and invalidations."
  }
] as const;

export default function HubPage() {
  return (
    <>
      <h1 className="cg-title">Hub</h1>
      <p className="cg-subtitle">
        Everything the iOS app does, running the same analysis engine in your browser.
      </p>

      <div className="cg-grid">
        {TILES.map((tile) => (
          <Link key={tile.href} href={tile.href} className="cg-card">
            <span className="cg-card-icon" aria-hidden="true">
              {tile.icon}
            </span>
            <h2>{tile.title}</h2>
            <p>{tile.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
