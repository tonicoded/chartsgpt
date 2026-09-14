'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { NativeSnapshot } from '../../lib/engine/native';
import type { Candle } from '../../lib/engine/types';
import type { CryptoTicker, CryptoMarket } from '../../lib/market/binance';
import './terminal.css';

const Chart = dynamic(() => import('./chart'), { ssr: false, loading: () => <div className="chart-loading">Loading chart…</div> });
const intervals = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'];
const popular = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT'];
const names: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', AVAX: 'Avalanche', LINK: 'Chainlink', SUI: 'Sui', DOT: 'Polkadot', SHIB: 'Shiba Inu', LTC: 'Litecoin', BCH: 'Bitcoin Cash', PEPE: 'Pepe', TRX: 'TRON', TON: 'Toncoin' };
const price = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 8 : n < 100 ? 4 : 2 });
export interface Analysis { symbol: string; timeframe: string; analysisNotice: string | null; snapshot: NativeSnapshot | null; candles: Candle[]; chartCandles: Candle[]; ticker: CryptoTicker; fetchedAt: number }
function Lines({ items }: { items: string[] }) { return <ul className="analysis-lines">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>; }

export default function CryptoTerminal() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [markets, setMarkets] = useState<CryptoMarket[]>([]);
  const [marketError, setMarketError] = useState('');
  const [marketRetry, setMarketRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState('Overview');
  const [showEMA, setShowEMA] = useState(true);
  const [showLevels, setShowLevels] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);
  const base = symbol.replace(/USDT$/, '');
  const current = data?.symbol === symbol && data.timeframe === timeframe ? data : null;
  const snapshot = current?.snapshot;
  const normalized = search.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
  const found = [...markets].sort((a, b) => {
    const ai = popular.indexOf(a.symbol), bi = popular.indexOf(b.symbol);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.symbol.localeCompare(b.symbol);
  }).filter(m => !normalized || m.symbol.includes(normalized) || (names[m.baseAsset] ?? '').toUpperCase().includes(normalized));
  const visible = found.slice(0, 80);
  function choose(next: string) { setSymbol(next); setSearch(''); setSearchOpen(false); setCursor(0); }

  useEffect(() => {
    const controller = new AbortController();
    setMarketError('');
    fetch('/api/crypto/markets/', { signal: controller.signal }).then(async r => {
      const value = await r.json(); if (!r.ok) throw new Error(value.error); setMarkets(value.markets);
    }).catch(e => { if (e.name !== 'AbortError') setMarketError(e.message); });
    return () => controller.abort();
  }, [marketRetry]);
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setInterval>;
    async function load() {
      if (busy || stopped) return;
      busy = true;
      setLoading(true);
      try {
        const response = await fetch(`/api/crypto/analyze/?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, { signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? 'Unable to load analysis.');
        if (!stopped) { setData(value); setError(''); }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Unable to load analysis.'); }
      finally { busy = false; if (!stopped) setLoading(false); }
    }
    setError(''); load(); timer = setInterval(load, 2000);
    return () => { stopped = true; clearInterval(timer); controller.abort(); };
  }, [symbol, timeframe, refresh]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!searchBox.current?.contains(event.target as Node)) setSearchOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    if (searchOpen) document.getElementById(`coin-${visible[cursor]?.symbol}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, searchOpen]);

  return <main className="crypto-app" lang="en">
    <header className="crypto-header"><a href="/" className="crypto-brand">Charts<span>GPT</span><small>CRYPTO TERMINAL</small></a><div className="header-source"><span className="binance-mark">◆</span> BINANCE SPOT <span className="source-separator">/</span> USDT</div></header>
    <div className="crypto-terminal">
      <aside className="market-sidebar"><p className="crypto-eyebrow">MARKETS</p><div className="market-search" ref={searchBox}>
        <label className="sr-only" htmlFor="coin-search">Search coins or trading pairs</label>
        <div className="search-input"><span aria-hidden="true">⌕</span><input id="coin-search" role="combobox" aria-expanded={searchOpen} aria-controls="coin-options" aria-autocomplete="list" aria-activedescendant={searchOpen && visible[cursor] ? `coin-${visible[cursor].symbol}` : undefined} autoComplete="off" placeholder="Search coins…" value={search} onFocus={() => setSearchOpen(true)} onChange={e => { setSearch(e.target.value); setSearchOpen(true); setCursor(0); }} onKeyDown={e => {
          if (e.key === 'Escape') setSearchOpen(false);
          if (e.key === 'ArrowDown') { e.preventDefault(); setSearchOpen(true); setCursor(c => Math.max(0, Math.min(c + 1, visible.length - 1))); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
          if (e.key === 'Enter' && visible[cursor]) { e.preventDefault(); choose(visible[cursor].symbol); }
        }} /></div>
        {searchOpen && <div className="search-results"><div className="search-caption">{markets.length ? `${found.length} trading pairs · Binance` : 'Loading markets…'}</div>{marketError ? <div className="search-error">{marketError}<button onClick={() => setMarketRetry(n => n + 1)}>Try again</button></div> : <div id="coin-options" role="listbox" aria-label="Cryptoparen">{visible.map((m, i) => <button id={`coin-${m.symbol}`} key={m.symbol} role="option" aria-selected={i === cursor} className={i === cursor ? 'highlighted' : ''} onClick={() => choose(m.symbol)}><span><strong>{m.baseAsset}</strong><small>{names[m.baseAsset] ?? m.baseAsset}</small></span><span>USDT</span></button>)}{markets.length > 0 && !visible.length && <p className="search-empty">No trading pairs found.</p>}</div>}</div>}
      </div><p className="sidebar-label">POPULAR</p><nav aria-label="Popular trading pairs">{popular.filter(p => !markets.length || markets.some(m => m.symbol === p)).map(pair => { const coin = pair.replace('USDT', ''); return <button key={pair} className={`market-row ${symbol === pair ? 'selected' : ''}`} onClick={() => choose(pair)} aria-current={symbol === pair ? 'true' : undefined}><span><strong>{coin}</strong><small>{names[coin]}</small></span><span className="pair-quote">USDT</span></button>; })}</nav><div className="sidebar-bottom"><span className="crypto-eyebrow">ONE MARKET. THE FULL PICTURE.</span><p>Crypto, directly from Binance.</p></div></aside>
      <section className="crypto-workspace">
        <div className="crypto-heading"><div><p className="crypto-eyebrow">{symbol} · BINANCE</p><h1>{names[base] ?? base} <span>/ USDT</span></h1></div><button className="refresh-button" onClick={() => setRefresh(n => n + 1)} disabled={loading}>{loading ? 'Scanning…' : 'Scan now ↻'}</button></div>
        <div className="market-metrics"><div className="primary-price"><strong>{current ? price(current.ticker.price) : '—'}</strong><span className={current && current.ticker.change < 0 ? 'negative' : 'positive'}>{current ? `${current.ticker.change >= 0 ? '+' : ''}${current.ticker.change.toFixed(2)}%` : '—'}<small>24h</small></span></div><div><small>24h high</small><strong>{current ? price(current.ticker.high) : '—'}</strong></div><div><small>24h low</small><strong>{current ? price(current.ticker.low) : '—'}</strong></div><div><small>24h volume · USDT</small><strong>{current ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(current.ticker.volume) : '—'}</strong></div><div className="updated-at"><small>{error ? 'Update failed' : 'Last scan'}</small><span>{current ? new Date(current.fetchedAt).toLocaleTimeString('en-GB') : 'Connecting…'}</span></div></div>
        {error && <div className="crypto-error" role="alert">{error} {current && 'Showing the last successful scan.'}<button onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
        <div className="terminal-columns"><div className="terminal-main"><section className="crypto-card chart-card" aria-label="Price chart"><div className="chart-toolbar"><div className="intervals" role="group" aria-label="Timeframe">{intervals.map(tf => <button key={tf} aria-pressed={timeframe === tf} className={timeframe === tf ? 'active' : ''} onClick={() => setTimeframe(tf)}>{tf.toUpperCase()}</button>)}</div><div className="chart-toggles"><button aria-pressed={showEMA} onClick={() => setShowEMA(!showEMA)} className={showEMA ? 'active-subtle' : ''}>EMA</button><button aria-pressed={showLevels} onClick={() => setShowLevels(!showLevels)} className={showLevels ? 'active-subtle' : ''}>Levels</button></div></div>
          <div className="chart-title"><strong>{base} / USDT <span>· {timeframe}</span></strong>{showEMA && <div className="ema-legend"><span>EMA 20</span><span>50</span><span>200</span></div>}</div>
          {current ? <Chart key={`${symbol}:${timeframe}`} candles={current.chartCandles ?? current.candles} levels={snapshot?.supportResistance ?? []} showEMA={showEMA} showLevels={showLevels} /> : <div className="chart-loading" role="status">{error ? 'Chart unavailable' : `${base}-candles loading…`}</div>}
        </section>
        <section className="crypto-card analysis-card"><div className="analysis-tabs" role="tablist" aria-label="Technical analysis">{['Overview', 'Trade-setups', 'Indicators', 'Market structure'].map(t => <button id={`tab-${t}`} role="tab" aria-selected={tab === t} aria-controls="analysis-panel" key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}{t === 'Trade-setups' && snapshot && <span>{snapshot.tradeSetups.length}</span>}</button>)}</div><div id="analysis-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {!snapshot ? <p className="muted">{current?.analysisNotice ?? (error ? 'Analysis unavailable.' : 'Calculating the full analysis…')}</p> : <>
          {tab === 'Overview' && <><div className="analysis-title"><div><p className="crypto-eyebrow">MARKET REGIME</p><h2>{snapshot.marketRegime}</h2></div><span className="signal-pill">{snapshot.signal}</span></div><p className="summary-text">{snapshot.summary}</p><div className="scenario-grid">{snapshot.scenarios.map(s => <article className="scenario" key={s.name}><div><h3>{s.name}</h3><span className={s.name === 'Bullish' ? 'positive' : s.name === 'Bearish' ? 'negative' : ''}>{s.probability != null ? `${s.probability}%` : '—'}</span></div><p><small>TRIGGER</small>{s.trigger}</p><p>{s.path}</p>{s.invalidation && <p className="invalidation"><small>INVALIDATION</small>{s.invalidation}</p>}</article>)}</div><p className="analysis-footnote">Scenario percentages are model scores, not guaranteed win probabilities.</p><h3 className="section-label">Price targets</h3><div className="target-grid">{(['shortTerm', 'mediumTerm', 'longTerm'] as const).map(key => { const values = snapshot.targets[key]; return <div key={key}><small>{{ shortTerm: 'Short term', mediumTerm: 'Medium term', longTerm: 'Long term' }[key]}</small><strong>{values.join(' · ') || '—'}</strong></div>; })}</div><h3 className="section-label">Risk & context</h3><Lines items={snapshot.riskNotes} /></>}
          {tab === 'Trade-setups' && <>{snapshot.tradeSetups.length === 0 ? <div className="empty-setups"><h2>Waiting for a clear setup</h2><p>No setup passes the engine filters on this timeframe. Check the scenarios for potential confirmation.</p></div> : snapshot.tradeSetups.map((s, i) => <article className="setup-card" key={i}><div className="setup-heading"><div><p className="crypto-eyebrow">{s.horizon} · {s.direction}</p><h2>{s.setup}</h2></div>{s.edgeGrade && <span className="edge-grade" title="Setup grade from the iOS engine">{s.edgeGrade}</span>}</div><p className="setup-trigger">{s.trigger}</p><div className="setup-values"><div><small>Entry</small><strong>{s.entry ?? '—'}</strong></div><div><small>Stop-loss</small><strong className="negative">{s.stop ?? '—'}</strong></div><div><small>Targets</small><strong className="positive">{s.targets.join(' / ') || '—'}</strong></div><div><small>Risk / reward</small><strong>{s.rr ?? '—'}</strong></div></div><h3 className="section-label">Why this setup?</h3><Lines items={s.rationale} /><details><summary>All conditions and context</summary><Lines items={s.notes} /></details></article>)}<p className="analysis-footnote">Setups are conditional: wait for the trigger. Bearish scenarios also inform spot positions; this app does not place orders.</p></>}
          {tab === 'Indicators' && <><h2>Technical indicators</h2><div className="indicator-grid">{snapshot.indicators.map((line, i) => { const split = line.indexOf(':'); return <div key={i}><small>{split >= 0 ? line.slice(0, split) : 'Market context'}</small><strong>{split >= 0 ? line.slice(split + 1).trim() : line}</strong></div>; })}</div><h3 className="section-label">Fibonacci</h3><div className="crypto-tags">{snapshot.fibLevels.map(f => <span key={f}>{f}</span>)}</div></>}
          {tab === 'Market structure' && <><p className="crypto-eyebrow">STRUCTURE</p><h2>{snapshot.marketStructure}</h2><h3 className="section-label">Confluence & conflicts</h3><Lines items={snapshot.confluence} /></>}
          </>}
        </div></section></div>
        <aside className="analysis-sidebar"><section className="crypto-card"><p className="crypto-eyebrow">ANALYSIS AT A GLANCE</p><div className="status-line"><span>Signal</span><strong className="signal-pill">{snapshot?.signal ?? '—'}</strong></div><div className="status-line"><span>Regime score</span><strong>{snapshot?.regimeConfidence != null ? `${snapshot.regimeConfidence}%` : '—'}</strong></div><div className="status-line"><span>Risk</span><strong>{snapshot?.riskLevel ?? '—'}</strong></div><div className="status-line"><span>Volume</span><strong>{snapshot?.volumeState ?? '—'}</strong></div>{snapshot?.bias && <div className="bias-block"><p className="crypto-eyebrow">DIRECTIONAL BIAS</p><div className="bias-bar" aria-label={`Bullish ${snapshot.bias.bullish}%, neutraal ${snapshot.bias.neutral}%, bearish ${snapshot.bias.bearish}%`}><span style={{ flex: snapshot.bias.bullish ?? 0 }} /><span style={{ flex: snapshot.bias.neutral ?? 0 }} /><span style={{ flex: snapshot.bias.bearish ?? 0 }} /></div><div className="bias-labels"><span className="positive">Bull {snapshot.bias.bullish}%</span><span>{snapshot.bias.neutral}%</span><span className="negative">Bear {snapshot.bias.bearish}%</span></div></div>}</section>
          <section className="crypto-card levels-card"><p className="crypto-eyebrow">KEY LEVELS</p><h2>Support & resistance</h2>{snapshot ? [...snapshot.supportResistance].sort((a, b) => +b.price - +a.price).map((l, i) => <div className="level-row" key={`${l.price}-${i}`}><div><span className={l.kind === 'support' ? 'positive' : 'negative'}>{l.kind === 'support' ? 'S' : 'R'}</span><strong>{l.price}</strong></div><small>{l.note}</small></div>) : <p className="muted">Calculating levels…</p>}</section>
        </aside></div>
        <footer className="terminal-footer"><span>Binance Spot · Scanning every 2 seconds</span><span>{snapshot ? `${snapshot.candleCount} live candles · Latest candle ${new Date(snapshot.end * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} (candle open)` : 'Live candle analysis'}</span></footer>
      </section>
    </div>
  </main>;
}
