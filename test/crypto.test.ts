import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeKlines, parseCryptoQuery } from '../lib/market/binance';
import { analyzeNative } from '../lib/engine/native';
import { candlesForAsset, type SnapshotSuite } from './parity/generators';

describe('Binance crypto boundary', () => {
  it('rejects other instruments and unsupported intervals', () => {
    for (const value of ['symbol=AAPL', 'symbol=EURUSD=X', 'symbol=BTCUSDT&timeframe=3h', 'symbol=../../etc/passwd']) {
      expect(() => parseCryptoQuery(new URLSearchParams(value))).toThrow();
    }
    expect(parseCryptoQuery(new URLSearchParams('symbol=ethusdt&timeframe=4h'))).toEqual({ symbol: 'ETHUSDT', timeframe: '4h' });
  });
  it('excludes the open candle from analysis and keeps it on the chart', () => {
    const rows = [[1000, '10', '12', '9', '11', '20', 1999], [2000, '11', '13', '10', '12', '30', 2999]];
    expect(decodeKlines(rows, 2500)).toHaveLength(1);
    expect(decodeKlines(rows, Infinity)).toHaveLength(2);
    expect(decodeKlines(rows, 2500)[0].openTime).toBe(1);
  });
  it('rejects malformed, duplicate and inconsistent OHLC data', () => {
    expect(() => decodeKlines([[1, '10', '9', '8', '11', '20', 2]], 10)).toThrow();
    expect(() => decodeKlines([[1, 'bad', '12', '8', '11', '20', 2]], 10)).toThrow();
    const row = [1, '10', '12', '8', '11', '20', 2];
    expect(() => decodeKlines([row, row], 10)).toThrow();
  });
});

describe('current native iOS engine', () => {
  it('preserves the exact vendored engine source', () => {
    const manifest = JSON.parse(readFileSync('native/engine/source-manifest.json', 'utf8'));
    for (const [file, hash] of Object.entries(manifest)) {
      expect(createHash('sha256').update(readFileSync(`native/engine/${file}`)).digest('hex')).toBe(hash);
    }
  });
  const suite: SnapshotSuite = JSON.parse(readFileSync('test/parity/fixtures/full_snapshot_golden_v1.json', 'utf8'));
  const asset = suite.assets.find(a => a.symbol === 'BTCUSDT')!;
  for (const timeframe of ['15m', '1h', '4h']) {
    it(`runs the complete Swift pipeline for ${timeframe}`, async () => {
      const candles = candlesForAsset(asset, timeframe, 500);
      const input = { symbol: 'BTCUSDT', timeframe, candles };
      const result = await analyzeNative(input);
      expect(result).toEqual(await analyzeNative(input));
      expect(result.start).toBe(candles[0].openTime);
      expect(result.end).toBe(candles.at(-1)!.openTime);
      expect(result.lastClose).toBe(candles.at(-1)!.close);
      expect(result.candleCount).toBe(500);
      expect(result.indicators.length).toBeGreaterThan(15);
      expect(result.scenarios).toHaveLength(3);
      expect(result.supportResistance.length).toBeGreaterThan(0);
      for (const setup of result.tradeSetups) {
        expect(setup.edgeGrade).toBeTruthy();
        expect(setup.rationale.length).toBeGreaterThan(0);
        if (setup.direction === 'Neutral') {
          expect(setup.entry).toBeUndefined();
          expect(setup.stop).toBeUndefined();
          expect(setup.targets).toEqual([]);
          expect(setup.trigger.length).toBeGreaterThan(0);
          continue;
        }
        const entry = Number(setup.entry), stop = Number(setup.stop);
        expect(Number.isFinite(entry) && Number.isFinite(stop), JSON.stringify(setup)).toBe(true);
        const long = setup.direction.toLowerCase().includes('bull');
        expect(long ? stop < entry : stop > entry).toBe(true);
        for (const target of setup.targets) expect(long ? Number(target) > entry : Number(target) < entry).toBe(true);
      }
    });
  }
});
