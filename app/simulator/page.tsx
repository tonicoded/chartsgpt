import type { Metadata } from "next";
import SimulatorClient from "./SimulatorClient";

export const metadata: Metadata = {
  title: "ChartsGPT Simulator — App-style Market Analysis (No AI)",
  description:
    "Run the same deterministic market-analysis workflow as the ChartsGPT app — key levels, scenarios, bias, and risk notes. No AI.",
  alternates: { canonical: "https://charts-gpt.com/simulator/" },
  openGraph: {
    title: "ChartsGPT Simulator — App-style Market Analysis (No AI)",
    description:
      "App-style market analysis on the web: key levels, scenarios, bias, and risk notes — no AI.",
    url: "https://charts-gpt.com/simulator/",
    images: [{ url: "https://charts-gpt.com/blog/assets/og-default.png" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "ChartsGPT Simulator — App-style Market Analysis (No AI)",
    description:
      "App-style market analysis on the web: key levels, scenarios, bias, and risk notes — no AI.",
    images: ["https://charts-gpt.com/blog/assets/og-default.png"]
  }
};

export default function SimulatorPage() {
  return (
    <div className="legacy-scroll">
      <div className="blog-shell sim-shell">
        <header className="blog-topbar" aria-label="Site header">
          <div className="blog-topbar-inner">
            <a className="blog-brand" href="/" aria-label="ChartsGPT Home">
              <img src="/logo.png" alt="ChartsGPT logo" width="30" height="30" loading="eager" />
              <span>ChartsGPT</span>
            </a>
            <nav className="blog-nav" aria-label="Primary">
              <a href="/">Home</a>
              <a href="/blog/">Blog</a>
              <a href="/blog/pillars/">Pillars</a>
              <a href="/simulator/">Simulator</a>
              <a href="/about/">About</a>
              <a href="/privacy/">Privacy</a>
              <a href="/terms/">Terms</a>
              <a href="/support/">Support</a>
            </nav>
            <details className="blog-menu">
              <summary aria-label="Open menu">
                <span className="blog-menu-icon" aria-hidden="true"></span>
              </summary>
              <div className="blog-menu-panel" role="menu" aria-label="Menu">
                <a role="menuitem" href="/">
                  Home
                </a>
                <a role="menuitem" href="/blog/">
                  Blog
                </a>
                <a role="menuitem" href="/blog/pillars/">
                  Pillars
                </a>
                <a role="menuitem" href="/simulator/">
                  Simulator
                </a>
                <a role="menuitem" href="/about/">
                  About
                </a>
                <a role="menuitem" href="/privacy/">
                  Privacy
                </a>
                <a role="menuitem" href="/terms/">
                  Terms
                </a>
                <a role="menuitem" href="/support/">
                  Support
                </a>
              </div>
            </details>
          </div>
        </header>

        <main className="blog-main sim-main">
          <div className="blog-container sim-container">
            <SimulatorClient />
          </div>
        </main>

        <footer className="blog-footer" aria-label="Site footer">
          <div className="blog-footer-inner">
            <div>
              <a href="/">Home</a> • <a href="/blog/">Blog</a> • <a href="/blog/pillars/">Pillars</a> • <a href="/simulator/">Simulator</a> •{" "}
              <a href="/about/">About</a> • <a href="/privacy/">Privacy</a> • <a href="/terms/">Terms</a> • <a href="/support/">Support</a>
            </div>
            <div>© ChartsGPT 2026</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
