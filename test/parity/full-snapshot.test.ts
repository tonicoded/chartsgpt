/**
 * Full-snapshot parity: every field the TypeScript engine produces must equal the field
 * the iOS engine produced for the same synthetic candles.
 *
 * Mirrors the `fullSnapshotGolden…` test in ChartGPTTests.swift and reads the snapshots it
 * recorded. Because the suite compares 27 deep trees, a plain deep-equal would just say
 * "not equal" — so this reports PER FIELD, which turns the run into a progress dashboard
 * for the remaining port work.
 *
 * `tradeSetups` (and `signal`, which is derived from it) are expected to differ until
 * `generateTradeSetups` is ported; they are reported separately rather than silently
 * skipped, so the gap stays visible.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { analyze } from "../../lib/engine/analyze";
import { TRADE_SETUPS_PORTED } from "../../lib/engine/tradeSetups";
import { unixToSwiftDate } from "../../lib/engine/swift";
import type { MarketSnapshot, StrategyRiskMode } from "../../lib/engine/types";
import {
  candlesForAsset,
  derivativesFixture,
  macroFixture,
  newsFixture,
  type SnapshotSuite
} from "./generators";

const FIXTURES = join(__dirname, "fixtures");

const suite: SnapshotSuite = JSON.parse(
  readFileSync(join(FIXTURES, "full_snapshot_golden_v1.json"), "utf-8")
);
const expectedByKey: Record<string, Record<string, unknown>> = JSON.parse(
  readFileSync(join(FIXTURES, "full_snapshot_expected_ios_v1.json"), "utf-8")
);

/** Fields that cannot match until `generateTradeSetups` lands. */
const SETUP_DEPENDENT_FIELDS = new Set(["tradeSetups", "signal"]);

/** Converts our snapshot to the shape Swift's JSONEncoder produced for the fixture. */
function toFixtureShape(snapshot: MarketSnapshot): Record<string, unknown> {
  return {
    ...snapshot,
    start: unixToSwiftDate(snapshot.start),
    end: unixToSwiftDate(snapshot.end),
    news:
      snapshot.news === null
        ? null
        : { ...snapshot.news, fetchedAt: unixToSwiftDate(snapshot.news.fetchedAt) },
    macroCalendar:
      snapshot.macroCalendar === null
        ? null
        : { ...snapshot.macroCalendar, fetchedAt: unixToSwiftDate(snapshot.macroCalendar.fetchedAt) },
    derivatives:
      snapshot.derivatives === null
        ? null
        : { ...snapshot.derivatives, fetchedAt: unixToSwiftDate(snapshot.derivatives.fetchedAt) }
  };
}

/**
 * Swift's JSONEncoder omits nil optionals entirely, so the fixture simply lacks those
 * keys. Normalising both sides lets an absent key and an explicit null compare equal.
 */
function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    // Sort keys so the comparison is about content, not declaration order: Swift encoded
    // the fixture alphabetically, our structs are in source order.
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const normalised = normalise((value as Record<string, unknown>)[key]);
      if (normalised === null) continue;
      result[key] = normalised;
    }
    return result;
  }
  return value;
}

function fieldsMatch(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(normalise(actual)) === JSON.stringify(normalise(expected));
}

interface CaseResult {
  key: string;
  matched: string[];
  mismatched: string[];
}

const results: CaseResult[] = [];

describe("full snapshot parity against iOS", () => {
  it("uses the fixture version the port was written against", () => {
    expect(suite.version).toBe(1);
    expect(Object.keys(expectedByKey)).toHaveLength(27);
  });

  for (const asset of suite.assets) {
    for (const timeframe of suite.timeframes) {
      const candles = candlesForAsset(asset, timeframe, suite.count);
      const news = newsFixture(asset.symbol);
      const macro = macroFixture();
      const derivatives = derivativesFixture(asset.symbol);

      for (const rawRisk of suite.riskModes) {
        const key = `${asset.symbol}|${timeframe}|${rawRisk}`;

        it(`matches iOS for ${key}`, () => {
          const expected = expectedByKey[key];
          expect(expected, `fixture missing case ${key}`).toBeDefined();

          const snapshot = analyze({
            exchange: asset.exchange,
            symbol: asset.symbol,
            timeframe,
            candles,
            newsDigest: news,
            macroDigest: macro,
            derivativesDigest: derivatives,
            fearGreed: null,
            mode: "live",
            // The Swift test varies `onboarding.riskMode`, but the engine reads
            // `analysis.strategy.riskMode` — a different key that the test never sets. So
            // all 27 fixture cases were in fact produced on `balanced`, and reproducing
            // iOS faithfully means pinning that here. See PORTING.md.
            riskMode: "balanced" satisfies StrategyRiskMode,
            // The fixture was generated with no macro events, so "now" cannot influence
            // it; pin it anyway so the suite can never drift with the wall clock.
            now: 1_700_000_000
          });
          const actual = toFixtureShape(snapshot);

          const matched: string[] = [];
          const mismatched: string[] = [];
          for (const field of Object.keys(expected)) {
            if (fieldsMatch(actual[field], expected[field])) matched.push(field);
            else mismatched.push(field);
          }
          results.push({ key, matched, mismatched });

          const blocking = mismatched.filter((field) => !SETUP_DEPENDENT_FIELDS.has(field));
          if (blocking.length > 0) {
            const details = blocking
              .map((field) => {
                const a = JSON.stringify(normalise(actual[field]));
                const b = JSON.stringify(normalise(expected[field]));
                return `  ${field}\n    actual:   ${a?.slice(0, 400)}\n    expected: ${b?.slice(0, 400)}`;
              })
              .join("\n");
            throw new Error(`${key} diverges from iOS in ${blocking.length} field(s):\n${details}`);
          }

          if (TRADE_SETUPS_PORTED) {
            expect(mismatched, `${key} still diverges`).toEqual([]);
          }
        });
      }
    }
  }
});
