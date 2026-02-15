import type { Metadata } from "next";
import SimulatorClient from "./SimulatorClient";

export const metadata: Metadata = {
  title: "Chart Analysis Simulator (No AI) — ChartsGPT",
  description:
    "A fast, deterministic chart-analysis simulator (no AI). Enter key levels + context and get a two-scenario plan with triggers and invalidation.",
  alternates: { canonical: "https://charts-gpt.com/simulator/" },
  openGraph: {
    title: "Chart Analysis Simulator (No AI) — ChartsGPT",
    description:
      "Enter key levels + context and get a two-scenario plan with triggers and invalidation — no AI, just a structured workflow.",
    url: "https://charts-gpt.com/simulator/",
    images: [{ url: "https://charts-gpt.com/blog/assets/og-default.png" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Chart Analysis Simulator (No AI) — ChartsGPT",
    description:
      "Enter key levels + context and get a two-scenario plan with triggers and invalidation — no AI, just a structured workflow.",
    images: ["https://charts-gpt.com/blog/assets/og-default.png"]
  }
};

export default function SimulatorPage() {
  return (
    <div className="legacy-scroll">
      <div className="blog-shell">
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

        <main className="blog-main">
          <div className="blog-container">
            <div className="blog-hero">
              <div className="breadcrumbs" aria-label="Breadcrumb">
                <a href="/">Home</a>
                <span>›</span>
                <span aria-current="page">Simulator</span>
              </div>
              <h1>Chart Analysis Simulator (No AI)</h1>
              <p>
                A fast simulator that mimics the <strong>structure</strong> of the app’s output (levels → scenarios → trigger →
                invalidation) without using AI.
              </p>
              <div className="blog-meta">Updated: February 15, 2026</div>
            </div>

            <article className="blog-card">
              <SimulatorClient />
            </article>
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

