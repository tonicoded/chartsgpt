"use client";

import { useMemo, useState } from "react";
import type { SimulatorInput } from "./engine";
import { simulateAnalysis } from "./engine";

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (Number.isNaN(num)) return undefined;
  return num;
}

function toTextBlock(output: ReturnType<typeof simulateAnalysis>) {
  const lines: string[] = [];
  lines.push(output.headline);
  lines.push("");
  lines.push(output.contextLine);
  lines.push("");
  lines.push("Key levels:");
  for (const lvl of output.levels) lines.push(`- ${lvl}`);
  lines.push("");
  for (const s of output.scenarios) {
    lines.push(`${s.name}`);
    lines.push(`Thesis: ${s.thesis}`);
    lines.push(`Trigger: ${s.trigger}`);
    lines.push(`Invalidation: ${s.invalidation}`);
    lines.push(`Target: ${s.target}`);
    lines.push("");
  }
  lines.push("Risk notes:");
  for (const r of output.riskNotes) lines.push(`- ${r}`);
  lines.push("");
  lines.push("5-line plan summary:");
  for (const p of output.planSummary) lines.push(`- ${p}`);
  lines.push("");
  lines.push(`Disclaimer: ${output.disclaimer}`);
  return lines.join("\n");
}

export default function SimulatorClient() {
  const [state, setState] = useState({
    asset: "BTC",
    timeframe: "1H",
    mode: "range",
    bias: "bullish",
    volatility: "high",
    currentPrice: "",
    keySupport: "",
    keyResistance: "",
    swingLow: "",
    swingHigh: "",
    rangeLow: "",
    rangeHigh: "",
    riskPct: "1",
    preferredTrigger: "retest_hold"
  });

  const input: SimulatorInput = useMemo(
    () => ({
      asset: state.asset,
      timeframe: state.timeframe,
      mode: state.mode as SimulatorInput["mode"],
      bias: state.bias as SimulatorInput["bias"],
      volatility: state.volatility as SimulatorInput["volatility"],
      currentPrice: toNumber(state.currentPrice),
      keySupport: toNumber(state.keySupport),
      keyResistance: toNumber(state.keyResistance),
      swingLow: toNumber(state.swingLow),
      swingHigh: toNumber(state.swingHigh),
      rangeLow: toNumber(state.rangeLow),
      rangeHigh: toNumber(state.rangeHigh),
      riskPct: toNumber(state.riskPct),
      preferredTrigger: state.preferredTrigger as SimulatorInput["preferredTrigger"]
    }),
    [state]
  );

  const output = useMemo(() => simulateAnalysis(input), [input]);
  const text = useMemo(() => toTextBlock(output), [output]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert("Copy failed. Select the text and copy manually.");
    }
  }

  return (
    <div className="blog-article">
      <div className="callout">
        <strong>What this is:</strong> a deterministic “analysis simulator” (no AI). You enter key levels + context and it outputs a clean
        two-scenario plan.
        <br />
        <strong>Note:</strong> it’s simplified on purpose—use it to structure thinking, not to predict.
      </div>

      <div className="toc">
        <div className="toc-title">Inputs</div>
        <div className="calc" style={{ maxWidth: 720 }}>
          <label className="calc-row">
            <span>Asset</span>
            <input value={state.asset} onChange={(e) => setState((s) => ({ ...s, asset: e.target.value }))} />
          </label>
          <label className="calc-row">
            <span>Timeframe</span>
            <input value={state.timeframe} onChange={(e) => setState((s) => ({ ...s, timeframe: e.target.value }))} />
          </label>

          <div className="calc-row">
            <span>Mode</span>
            <div className="calc-actions" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className={`calc-btn ${state.mode === "range" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, mode: "range" }))}
              >
                Range
              </button>
              <button
                type="button"
                className={`calc-btn ${state.mode === "trend" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, mode: "trend" }))}
              >
                Trend
              </button>
            </div>
          </div>

          <div className="calc-row">
            <span>Trend bias (if trend)</span>
            <div className="calc-actions" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className={`calc-btn ${state.bias === "bullish" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, bias: "bullish" }))}
              >
                Bullish
              </button>
              <button
                type="button"
                className={`calc-btn ${state.bias === "bearish" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, bias: "bearish" }))}
              >
                Bearish
              </button>
            </div>
          </div>

          <div className="calc-row">
            <span>Volatility</span>
            <div className="calc-actions" style={{ flexWrap: "wrap" }}>
              {(["low", "normal", "high"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`calc-btn ${state.volatility === v ? "" : "calc-btn-ghost"}`}
                  onClick={() => setState((s) => ({ ...s, volatility: v }))}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="calc-row">
            <span>Preferred trigger</span>
            <div className="calc-actions" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className={`calc-btn ${state.preferredTrigger === "retest_hold" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, preferredTrigger: "retest_hold" }))}
              >
                Retest hold
              </button>
              <button
                type="button"
                className={`calc-btn ${state.preferredTrigger === "break_close" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, preferredTrigger: "break_close" }))}
              >
                Break + close
              </button>
              <button
                type="button"
                className={`calc-btn ${state.preferredTrigger === "sweep_reclaim" ? "" : "calc-btn-ghost"}`}
                onClick={() => setState((s) => ({ ...s, preferredTrigger: "sweep_reclaim" }))}
              >
                Sweep + reclaim
              </button>
            </div>
          </div>

          <label className="calc-row">
            <span>Key support (optional)</span>
            <input inputMode="decimal" value={state.keySupport} onChange={(e) => setState((s) => ({ ...s, keySupport: e.target.value }))} />
          </label>
          <label className="calc-row">
            <span>Key resistance (optional)</span>
            <input
              inputMode="decimal"
              value={state.keyResistance}
              onChange={(e) => setState((s) => ({ ...s, keyResistance: e.target.value }))} 
            />
          </label>

          <label className="calc-row">
            <span>Range low / high (optional)</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input inputMode="decimal" placeholder="range low" value={state.rangeLow} onChange={(e) => setState((s) => ({ ...s, rangeLow: e.target.value }))} />
              <input inputMode="decimal" placeholder="range high" value={state.rangeHigh} onChange={(e) => setState((s) => ({ ...s, rangeHigh: e.target.value }))} />
            </div>
          </label>

          <label className="calc-row">
            <span>Swing low / high (optional)</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input inputMode="decimal" placeholder="swing low" value={state.swingLow} onChange={(e) => setState((s) => ({ ...s, swingLow: e.target.value }))} />
              <input inputMode="decimal" placeholder="swing high" value={state.swingHigh} onChange={(e) => setState((s) => ({ ...s, swingHigh: e.target.value }))} />
            </div>
          </label>

          <label className="calc-row">
            <span>Risk per trade (%)</span>
            <input inputMode="decimal" value={state.riskPct} onChange={(e) => setState((s) => ({ ...s, riskPct: e.target.value }))} />
          </label>
        </div>
      </div>

      <h2>Output (simulated)</h2>
      <div className="calc-actions" style={{ marginBottom: 10 }}>
        <button type="button" className="calc-btn" onClick={copy}>
          Copy
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>

      <h2>Get ChartsGPT</h2>
      <p>Want the real app workflow on your phone? Download ChartsGPT.</p>
      <div className="download-row" aria-label="Download ChartsGPT">
        <a className="store-badge js-appstore" href="#" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
          <img src="/appstore.svg" alt="Download on the App Store" />
        </a>
        <a className="store-badge js-playstore" href="#" target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
          <img src="/googleplay.svg" alt="Get it on Google Play" />
        </a>
      </div>

      <p className="blog-meta">Disclaimer: ChartsGPT provides educational analysis tools only and is not financial advice.</p>
    </div>
  );
}

