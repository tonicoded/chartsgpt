import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Candle, MarketSnapshot, TradeSetup } from './types';

export type NativeSetup = TradeSetup & { edgeGrade?: string; edgeExpectancyR?: number; edgeHitRate?: number; edgeRawScore?: number };
export type NativeSnapshot = Omit<MarketSnapshot, 'tradeSetups'> & {
  tradeSetups: NativeSetup[];
  setupQuality: Array<{ score: number; label: string; reasons: string[] }>;
  higherTimeframes: Array<{ timeframe: string; regime: string; structure: string; signal: string; lastClose: number; indicators: string[] }>;
};
let active = 0;
export async function analyzeNative(input: { symbol: string; timeframe: string; candles: Candle[]; higherTimeframes?: Array<{ timeframe: string; candles: Candle[] }> }): Promise<NativeSnapshot> {
  if (active >= 4) throw new Error('The analysis engine is busy. Retrying shortly.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(path.join(process.cwd(), '.engine/chartsgpt-engine'), [], { stdio: ['pipe', 'pipe', 'pipe'] });
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
