/**
 * Layer 1 parity: the indicator values the TypeScript engine computes must match the
 * numbers the iOS engine produced for the same synthetic candles.
 *
 * Mirrors `crossPlatformGoldenIndicatorsMatchAndroidFixture` in ChartGPTTests.swift, and
 * reads the same fixture file, so iOS / Android / web are all pinned to one set of numbers.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  atr,
  bollingerBands,
  ema,
  macd,
  rsi,
  stochasticOscillator
} from "../../lib/engine/indicators";
import { last } from "../../lib/engine/swift";
import { candlesForScanCase, type ScanGoldenSuite } from "./generators";

const suite: ScanGoldenSuite = JSON.parse(
  readFileSync(join(__dirname, "fixtures/scan_engine_golden_v1.json"), "utf-8")
);

describe("cross-platform indicator golden suite", () => {
  it("uses the version the port was written against", () => {
    expect(suite.version).toBe(1);
  });

  for (const item of suite.cases) {
    it(`matches iOS for ${item.id}`, () => {
      const candles = candlesForScanCase(item);
      const closes = candles.map((candle) => candle.close);

      const bands = bollingerBands(closes, 20, 2.0);
      const macdPack = macd(closes);
      const stoch = stochasticOscillator(candles, 14, 3);

      const actual: Record<string, number | null> = {
        ema20: last(ema(closes, 20)),
        ema50: last(ema(closes, 50)),
        ema200: last(ema(closes, 200)),
        // liveSeries derives the midline as (upper + lower) / 2 rather than reusing the mean.
        bollingerMiddle:
          bands.upper !== null && bands.lower !== null ? (bands.upper + bands.lower) / 2 : null,
        bollingerUpper: bands.upper,
        bollingerLower: bands.lower,
        macdHistogram: last(macdPack.histogram),
        stochasticK: stoch.k,
        rsi14: last(rsi(closes, 14)),
        atr14: last(atr(candles, 14))
      };

      for (const [key, expected] of Object.entries(item.expected)) {
        const value = actual[key];
        expect(value, `${item.id}/${key} was null`).not.toBeNull();
        expect(Math.abs((value as number) - expected), `${item.id}/${key}: ${value} != ${expected}`).toBeLessThan(1e-6);
      }
    });
  }
});
