"use client";

import { useMemo, useState } from "react";
import type { ChartAnalysisPayload } from "./market-analysis";

type ApiOk = {
  ok: true;
  market: {
    exchange: string;
    symbol: string;
    timeframe: string;
    candleCount: number;
    start: number | null;
    end: number | null;
    lastClose: number | null;
  };
  analysis: ChartAnalysisPayload;
};

type ApiErr = { ok: false; error: string };

function formatPrice(n: number) {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 1 ? 4 : abs >= 0.1 ? 5 : abs >= 0.01 ? 6 : 8;
  return n.toFixed(digits);
}

function exportText(result: ChartAnalysisPayload, market: ApiOk["market"] | null, marketDataErrorMessage: string | null) {
  const lines: string[] = [];

  const append = (line?: string | null) => {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) return;
    lines.push(trimmed);
  };

  const section = (title: string) => {
    if (lines.length) lines.push("");
    lines.push(`${title}:`);
  };

  const bullets = (items: string[]) => {
    for (const item of items) append(`- ${item}`);
  };

  append(result.symbol ? `Symbol: ${result.symbol}` : null);
  append(result.timeframe ? `Timeframe: ${result.timeframe}` : null);
  append(result.exchange ? `Exchange: ${result.exchange}` : null);

  if (market) {
    section("Market Data");
    append(`Source: ${market.exchange}`);
    append(`Symbol: ${market.symbol}`);
    append(`Timeframe: ${market.timeframe}`);
    append(`Candles: ${market.candleCount}`);
    if (typeof market.lastClose === "number") append(`Last close: ${formatPrice(market.lastClose)}`);
  } else if (marketDataErrorMessage) {
    section("Market Data");
    append(`Unavailable: ${marketDataErrorMessage}`);
  }

  append(result.marketRegime ? `Regime: ${result.marketRegime}` : null);
  append(result.marketStructure ? `Structure: ${result.marketStructure}` : null);

  if (result.summary) {
    section("Summary");
    append(result.summary);
  }

  if (result.supportResistance?.length) {
    section("Key Levels");
    for (const level of result.supportResistance) {
      const note = level.note ? ` (${level.note})` : "";
      append(`- ${level.kind}: ${level.price}${note}`);
    }
  }

  if (result.confluence?.length) {
    section("Confluence");
    bullets(result.confluence);
  }

  if (result.indicators?.length) {
    section("Indicators");
    bullets(result.indicators);
  }

  if (result.scenarios?.length) {
    section("Scenarios");
    for (const s of result.scenarios) {
      append(`- ${s.name}: ${s.trigger} → ${s.path}`);
      append(`Invalidation: ${s.invalidation ?? "n/a"}`);
    }
  }

  if (result.timeHorizonTargets) {
    section("Targets");
    if (result.timeHorizonTargets.shortTerm.length) {
      append("Short term:");
      bullets(result.timeHorizonTargets.shortTerm);
    }
    if (result.timeHorizonTargets.mediumTerm.length) {
      append("Medium term:");
      bullets(result.timeHorizonTargets.mediumTerm);
    }
    if (result.timeHorizonTargets.longTerm.length) {
      append("Long term:");
      bullets(result.timeHorizonTargets.longTerm);
    }
  }

  if (result.bias) {
    section("Bias");
    append(`Bullish: ${result.bias.bullish ?? 0}`);
    append(`Bearish: ${result.bias.bearish ?? 0}`);
    append(`Neutral: ${result.bias.neutral ?? 0}`);
  }

  if (result.riskNotes?.length) {
    section("Risk Notes");
    bullets(result.riskNotes);
  }

  section("Disclaimer");
  append(result.disclaimer ?? "Not financial advice.");

  return lines.join("\n");
}

export default function SimulatorClient() {
  const [form, setForm] = useState({
    exchange: "binance-futures",
    symbol: "BTCUSDT",
    timeframe: "1h",
    limit: "220"
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);

  const statusLabel = error ? "Needs attention" : isLoading ? "Analyzing" : data ? "Ready" : "Waiting";
  const statusKind = error ? "error" : isLoading ? "warn" : data ? "ok" : "idle";

  const textToCopy = useMemo(() => {
    if (!data) return "";
    return exportText(data.analysis, data.market, null);
  }, [data]);

  async function run() {
    setIsLoading(true);
    setError(null);
    try {
      const u = new URL("/api/simulator/analyze", window.location.origin);
      u.searchParams.set("exchange", form.exchange);
      u.searchParams.set("symbol", form.symbol.trim());
      u.searchParams.set("timeframe", form.timeframe.trim());
      u.searchParams.set("limit", form.limit.trim() || "220");
      const res = await fetch(u);
      const json = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok || json.ok === false) throw new Error(json.ok === false ? json.error : "Request failed.");
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not analyze.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copy() {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      // fall back silently; user can select text below.
    }
  }

  const analysis = data?.analysis ?? null;
  const metaLine = data ? `${data.market.symbol} • ${data.market.timeframe} • ${data.market.exchange}` : "Pick an exchange, symbol, and timeframe.";

  return (
    <div className="sim-screen" aria-label="ChartsGPT Simulator">
      <div className="sim-control-row">
        <a className="sim-icon-btn" href="/blog/" aria-label="Back to blog">
          <span aria-hidden="true">×</span>
        </a>

        <div className="sim-spacer" />

        <div className="sim-pill">Not advice</div>

        <button type="button" className="sim-icon-btn" onClick={copy} disabled={!data} aria-label="Copy analysis">
          <span aria-hidden="true">⧉</span>
        </button>
      </div>

      <div className="sim-card sim-header-card">
        <div className={`sim-status-pill sim-status-${statusKind}`}>
          <span className="sim-status-dot" aria-hidden="true" />
          <span>{statusLabel.toUpperCase()}</span>
        </div>
        <div className="sim-meta">{metaLine}</div>
      </div>

      <div className="sim-card sim-form-card" aria-label="Simulator inputs">
        <div className="sim-form-grid">
          <label className="sim-field">
            <span>Exchange</span>
            <select value={form.exchange} onChange={(e) => setForm((s) => ({ ...s, exchange: e.target.value }))}>
              <option value="binance-futures">Binance Futures</option>
              <option value="binance">Binance Spot</option>
              <option value="stooq">Stooq (stocks/ETFs)</option>
            </select>
          </label>
          <label className="sim-field">
            <span>Symbol</span>
            <input value={form.symbol} onChange={(e) => setForm((s) => ({ ...s, symbol: e.target.value }))} placeholder="BTCUSDT / AAPL" />
          </label>
          <label className="sim-field">
            <span>Timeframe</span>
            <input value={form.timeframe} onChange={(e) => setForm((s) => ({ ...s, timeframe: e.target.value }))} placeholder="1h / 4h / 1d" />
          </label>
          <label className="sim-field">
            <span>Candles</span>
            <input value={form.limit} onChange={(e) => setForm((s) => ({ ...s, limit: e.target.value }))} inputMode="numeric" placeholder="220" />
          </label>
        </div>
        <div className="sim-actions">
          <button type="button" className="sim-primary" onClick={run} disabled={isLoading}>
            {isLoading ? "Analyzing…" : "Analyze"}
          </button>
          <div className="sim-hint">Uses deterministic logic (no AI) + live candles from Binance/Stooq.</div>
        </div>
        {error ? <div className="sim-error">Market data unavailable: {error}</div> : null}
      </div>

      {analysis ? (
        <>
          <div className="sim-card sim-hero-card">
            <div className="sim-hero-title">{analysis.marketRegime ?? "Market regime"}</div>
            <div className="sim-hero-sub">{analysis.marketStructure ?? "Structure unclear"}</div>
            {analysis.summary ? <div className="sim-hero-summary">{analysis.summary}</div> : null}
          </div>

          <div className="sim-card sim-section-card">
            <div className="sim-section-head">
              <div className="sim-section-icon" aria-hidden="true">
                ↗
              </div>
              <div className="sim-section-title">Verified Key Levels</div>
            </div>
            {analysis.supportResistance?.length ? (
              <div className="sim-levels">
                {analysis.supportResistance.map((lvl) => (
                  <div key={`${lvl.kind}-${lvl.price}-${lvl.note ?? ""}`} className="sim-level-row">
                    <div className="sim-level-kind">{lvl.kind}</div>
                    <div className="sim-level-price">{lvl.price}</div>
                    <div className="sim-level-note">{lvl.note ?? ""}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sim-muted">No verified key levels available.</div>
            )}
          </div>

          <div className="sim-card sim-section-card">
            <div className="sim-section-head">
              <div className="sim-section-icon" aria-hidden="true">
                ⛳
              </div>
              <div className="sim-section-title">Scenarios</div>
            </div>
            {analysis.scenarios?.length ? (
              <div className="sim-scenarios">
                {analysis.scenarios.slice(0, 3).map((s) => (
                  <div key={s.name} className="sim-scenario">
                    <div className="sim-scenario-top">
                      <div className="sim-scenario-name">{s.name}</div>
                      {typeof s.probability === "number" ? <div className="sim-scenario-prob">{s.probability}%</div> : null}
                    </div>
                    <div className="sim-scenario-line">
                      <span>Trigger:</span> {s.trigger}
                    </div>
                    <div className="sim-scenario-line">
                      <span>Path:</span> {s.path}
                    </div>
                    {s.invalidation ? (
                      <div className="sim-scenario-line">
                        <span>Invalidation:</span> {s.invalidation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="sim-muted">No scenarios available.</div>
            )}
          </div>

          <div className="sim-card sim-section-card">
            <div className="sim-section-head">
              <div className="sim-section-icon" aria-hidden="true">
                ⚖
              </div>
              <div className="sim-section-title">Risk & Bias</div>
            </div>
            {analysis.bias ? (
              <div className="sim-bias">
                {(["Bullish", "Bearish", "Neutral"] as const).map((label) => {
                  const value =
                    label === "Bullish" ? analysis.bias?.bullish ?? null : label === "Bearish" ? analysis.bias?.bearish ?? null : analysis.bias?.neutral ?? null;
                  if (typeof value !== "number") return null;
                  return (
                    <div key={label} className="sim-bias-row">
                      <div className="sim-bias-label">{label}</div>
                      <div className="sim-bias-bar" aria-hidden="true">
                        <div className="sim-bias-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                      </div>
                      <div className="sim-bias-value">{value}%</div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {analysis.riskNotes?.length ? (
              <ul className="sim-bullets">
                {analysis.riskNotes.slice(0, 8).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <div className="sim-muted">No risk notes.</div>
            )}
          </div>

          <details className="sim-card sim-raw-card">
            <summary>Copy-friendly text</summary>
            <pre>
              <code>{textToCopy}</code>
            </pre>
          </details>

          <div className="sim-card sim-download">
            <div className="sim-download-title">Get ChartsGPT</div>
            <div className="sim-download-sub">Want the full workflow on your phone? Download ChartsGPT.</div>
            <div className="download-row" aria-label="Download ChartsGPT">
              <a className="store-badge js-appstore" href="#" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
                <img src="/appstore.svg" alt="Download on the App Store" />
              </a>
              <a className="store-badge js-playstore" href="#" target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
                <img src="/googleplay.svg" alt="Get it on Google Play" />
              </a>
            </div>
            <div className="sim-muted">Disclaimer: educational tool only — not financial advice.</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
