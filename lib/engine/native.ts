import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { analyze } from './analyze';
import type { Candle, MarketSnapshot, TradeSetup } from './types';

export type NativeSetup = TradeSetup & { edgeGrade?: string; edgeExpectancyR?: number; edgeHitRate?: number; edgeRawScore?: number };
export type NativeSnapshot = Omit<MarketSnapshot, 'tradeSetups'> & {
  tradeSetups: NativeSetup[];
  setupQuality: Array<{ score: number; label: string; reasons: string[] }>;
  higherTimeframes: Array<{ timeframe: string; regime: string; structure: string; signal: string; lastClose: number; indicators: string[] }>;
};
let active = 0;

function enginePath() {
  return path.join(process.cwd(), '.engine/chartsgpt-engine');
}

export function hasNativeEngine() {
  return process.env.CHARTSGPT_FORCE_TS_ENGINE !== '1' && existsSync(enginePath());
}

function analyzeWithTypeScript(input: { symbol: string; timeframe: string; candles: Candle[]; higherTimeframes?: Array<{ timeframe: string; candles: Candle[] }> }): NativeSnapshot {
  const snapshot = analyze({
    exchange: 'Binance',
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles: input.candles
  });

  const higherTimeframes = (input.higherTimeframes ?? []).map(({ timeframe, candles }) => {
    const higher = analyze({ exchange: 'Binance', symbol: input.symbol, timeframe, candles });
    return {
      timeframe,
      regime: higher.marketRegime,
      structure: higher.marketStructure,
      signal: higher.signal,
      lastClose: higher.lastClose,
      indicators: higher.indicators
    };
  });

  return {
    ...snapshot,
    setupQuality: snapshot.tradeSetups.map(() => ({ score: 0, label: 'Unrated', reasons: [] })),
    higherTimeframes
  };
}

export async function analyzeNative(input: { symbol: string; timeframe: string; candles: Candle[]; higherTimeframes?: Array<{ timeframe: string; candles: Candle[] }> }): Promise<NativeSnapshot> {
  if (!hasNativeEngine()) return analyzeWithTypeScript(input);
  if (active >= 4) throw new Error('The analysis engine is busy. Retrying shortly.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(enginePath(), [], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Analysis timed out. Please try again.')); }, 15000);
      child.on('error', () => { clearTimeout(timeout); reject(new Error('The analysis engine is unavailable on this server.')); });
      child.stdin.on('error', () => {});
      child.stdout.on('data', chunk => { output += chunk; if (output.length > 2_000_000) child.kill(); });
      child.stderr.resume();
      child.on('close', code => {
        clearTimeout(timeout);
        if (code !== 0) return reject(new Error('The analysis engine could not process this market.'));
        try { resolve(JSON.parse(output)); } catch { reject(new Error('Unable to read the analysis.')); }
      });
      child.stdin.end(JSON.stringify(input));
    });
  } finally { active--; }
}
