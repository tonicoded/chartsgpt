# Porting `MarketAnalysisEngine` to TypeScript

The web app must produce the **same numbers and the same strings** as the iOS app. This
document records how that is enforced and what is left to do, so the port can be picked up
without re-deriving the approach.

## Source of truth

| Concern | iOS file | Lines |
|---|---|---|
| Engine | `ChartGPT/MarketAnalysisEngine.swift` | 10,982 |
| Payload conversion | `ChartGPT/MarketPayloadBuilder.swift` | 556 |
| Setup scoring | `ChartGPT/SetupQualityScorer.swift` | — |
| Payload sanitising | `ChartGPT/ChartAnalysisSanitizer.swift` | 621 |
| Candle fetching | `ChartGPT/MarketDataService.swift` | 2,264 |

There is also a Kotlin port in `Android/app/src/main/java/com/anthony/chartgpt/`. It is
**incomplete** (`generateTradeSetups` is only partly done) but the finished layers are a
useful second opinion when a Swift construct is ambiguous.

## How parity is proven

`ChartGPTTests/ChartGPTTests.swift` runs the iOS engine over deterministic synthetic
candles and pins the result. Those fixtures are copied into `test/parity/fixtures/`:

- **`scan_engine_golden_v1.json`** — 6 indicator cases shared by iOS, Android and web.
  Covered by `test/parity/indicators.test.ts`. **Passing.**
- **`full_snapshot_golden_v1.json`** — the input spec: 3 assets × 3 timeframes × 3 risk
  modes = 27 cases, 320 candles each.
- **`full_snapshot_expected_ios_v1.json`** — the full `MarketSnapshot` iOS produced for
  each of those 27 cases, including every rendered string. This is the acceptance bar.

`test/parity/generators.ts` reproduces the Swift candle generators exactly. Do not "clean
up" the formulas there — the fixtures were produced against those precise inputs.

When the engine is complete, a `full-snapshot.test.ts` should deep-equal all 27 snapshots
against the fixture. Anything less than a full match means the web app would show a user
different levels than their phone does.

## Semantics that do not carry over from Swift

`lib/engine/swift.ts` exists because several primitives differ from their obvious JS
counterparts, and each difference silently changes user-visible output:

- `String(format: "%.0f", x)` is C `printf` → **round half to even**. `toFixed` rounds
  half away from zero. `68600.5` renders as `68600` on iOS, `68601` with `toFixed`. Ties
  are exactly representable whenever the fraction is a negative power of two, so this is a
  real divergence. `formatF()` does exact BigInt decimal expansion to reproduce it.
- `Double.rounded()` rounds half **away from zero**; `Math.round` rounds half toward +∞.
  Use `rounded()`.
- `Int(x)` truncates toward zero → `toInt()`. Integer division truncates → `intDiv()`.
- `Double("...")` / `Int("...")` are **whole-string** parsers; `parseFloat`/`parseInt`
  accept a prefix. Use `parseDoubleStrict` / `parseIntStrict` from `format.ts`.
- Swift `Date` bridges to JSON as seconds since **2001-01-01**, not the unix epoch. Candles
  carry unix seconds internally; convert only at the fixture/JSON boundary.
- `max(by:)` keeps the **first** element on a tie. A naive `reduce` keeps the last.

Levels are passed around as their *formatted string* and re-parsed at every hop. That is
lossy on purpose — the rounding is what collapses two nearby swings into one level — so
the port must not keep raw doubles "for accuracy".

## Status

### Done and verified
- `types.ts` — Candle, ChartAnalysisPayload and its nested types, the three digests,
  IndicatorSelection, MarketSnapshot.
- `swift.ts` — the semantics layer above.
- `format.ts` — `roundingStep`, `roundToStep`, `clusterLevels`, `formatPrice`,
  `formatCompact`, `timeframeMinutes`, `timeframeKind`, strict parsers.
- `indicators.ts` — EMA, RSI, ATR, MACD, Bollinger, Stochastic, ADX, OBV, ROC, ATR%
  series, volatility regime, linear regression, trend strength, swing points.
  **Passing the shared golden suite.**
- `regime.ts` — `inferMarketRegime` (vote weights, label wording, confidence scoring) and
  `inferMarketStructure`.
- `levels.ts` — `deriveSupportResistance`, `deriveMicroLevels`, `pivotLevels`,
  `compactLevelSet`, `mergeKeyLevels`.
- `structure.ts` — `marketStructureLayer` (BOS / CHoCH / sweeps / reclaims / reactions,
  bias voting, range-like detection) and `applyMarketStructureLayer`.
- `context.ts` — `anchoredVWAPPack`, `regressionChannelPack`, `divergenceSignals`,
  `fibonacciPackage`.
- `profile.ts` — `marketRegimeProfile`, `regimeActionLines`, `probabilityLayer`,
  `probabilityRiskLabel`, both `applyProbabilityLayer` overloads.
- `labels.ts` — `signalLabel`, `riskLevelLabel`, `volumeStateLabel`, `buildSummary`,
  `macroRiskNotes`, `sameDayHighImpactMacroAlert`, `newsConfluenceItems`,
  `derivativesConfluenceItems`, `derivativesRiskNotes`, `fearGreed*`,
  `isFearGreedRelevant`, `confluenceForSetups`.
- `patterns.ts` — `detectDeterministicPatterns` (engulfing, doji, stars, hammers, double
  tops/bottoms, head and shoulders, triangles).
- `scenarios.ts` — `buildScenariosAndTargets`, including the FX synthetic-level branch.
- `signals.ts` — `buildSignals`: confluence, indicator readouts, risk notes and the whole
  ordered bias-clamping chain.
- `setupFilters.ts` — `applyLiveSetupFilters`.
- `analyze.ts` — the `analyze()` assembly, including the FX-only level narrowing.

**All 27 iOS golden snapshots now match on every field except `tradeSetups` and the
`signal` label derived from it** — 3,036 strings and 486 numbers pinned exactly, covering
`indicators`, `confluence`, `riskNotes`, `scenarios`, `targets`, `supportResistance`,
`bias`, `summary`, `fibLevels`, `regimeConfidence`, `riskLevel` and `volumeState`.

### Remaining, in dependency order
1. **`generateTradeSetups`** (lines 1558-7292, ~5,730 lines, 103 helpers) — the only thing
   standing between here and full parity. `lib/engine/tradeSetups.ts` holds the input
   contract and a placeholder returning `[]`; `TRADE_SETUPS_PORTED` flips the
   full-snapshot suite to strict mode once it lands. The Android port sequenced it as:
   foundation (tick sizing, stop sizing, direction inference, R:R computed from the
   *displayed* rounded values, minRR gate, horizon policy, instrument classification) →
   targets → generic generator → FX branch → crypto/equity/index/futures branches →
   selection → filters. Follow the same order; the notes in
   `Android/.../TradeSetup*.kt` are worth reading first.
2. **`MarketPayloadBuilder`**, **`SetupQualityScorer`**, **`ChartAnalysisSanitizer`**.

## Risk mode is ambient state on iOS, explicit here

`probabilityLayer` and `generateTradeSetups` read
`UserDefaults["analysis.strategy.riskMode"]` directly. The port threads a
`StrategyRiskMode` argument instead — a server process handles many users at once and
cannot carry one global setting.

**The golden fixture does not cover this.** `ChartGPTTests.swift` sets
`AnalysisSettings.onboardingRiskMode`, which writes `"onboarding.riskMode"` — a different
key from the `"analysis.strategy.riskMode"` the engine reads. All three risk-mode variants
in `full_snapshot_expected_ios_v1.json` are therefore byte-identical, so the 27 cases are
really 9 distinct ones, all on `balanced`. The conservative and aggressive branches are
ported from source but unverified. (The app itself is fine: onboarding writes the strategy
key via `AnalysisSettings.setStrategyProfile(personalizedProfile)`.) Worth fixing in the
Swift test so all three platforms gain the coverage.
