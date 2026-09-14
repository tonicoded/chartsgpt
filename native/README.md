# Crypto web engine

The `/app/` terminal calls `/api/crypto/analyze/`. Only active Binance Spot USDT pairs
are accepted. Binance is the only market-data provider in this route.

The existing TypeScript port is older and has no setup generator. The web terminal
therefore uses the **actual current Swift engine**, copied unchanged from
`Downloads/ChartGPT 6/ChartGPT` on 2026-09-11:

- MarketAnalysisEngine.swift
- SetupEdgeModel.swift
- MarketContextSignals.swift

`engine/source-manifest.json` pins their SHA-256 hashes. The CLI model declarations
are adapted from the iOS project's existing `tools/engine_golden_runner.swift`.
No iOS credentials, networking services, account data or AI proxy are copied.

`main.swift` accepts candle JSON on stdin and returns the full snapshot as JSON,
with Unix timestamps at both boundaries. It uses the current iOS engine's fixed
conservative policy and live analysis mode. Supplemental news/macro/sentiment inputs
are nil, since those sources are outside the requested Binance-only scope.

The chart includes the current, incomplete Binance candle. Analysis uses the last
500 **closed** candles (minimum 250). Expect a difference from a phone analyzing an
incomplete candle or using different candle counts, providers or supplemental inputs.
Setup grading is the engine's historical model output, not a live performance estimate.

## Running

`npm run dev` first builds the native executable with `swiftc`, then starts Next.js.
`npm run build` builds it too. The build is skipped when sources have not changed.
The executable and module cache live in ignored `.engine/`.

Requires a Swift 6.3+ toolchain and Node.js. The local macOS runtime has been tested.
This is **not a static export or a Vercel/Cloudflare-compatible native binary**.
Online deployment needs a Node server with an executable built for that host, or a
separate native engine service. Linux compilation/deployment has not been verified.
No online deployment is performed by this change.

API processes have a 15-second timeout and a four-process concurrency cap; identical
requests share work and results cache briefly. Production load/rate limits need to be
sized for the eventual deployment. The terminal refreshes every 30 seconds.

## Validation

`npm test` checks the preserved TypeScript fixtures and the native crypto adapter,
including source hashes, exact deterministic output, timestamp/price continuity,
setup invariants, invalid pairs and malformed candle inputs. Compile the engine with
`npm run engine:build` before running tests directly with `vitest`.

The old golden fixtures cover the old TypeScript engine; they do **not** prove parity
with the newer Swift engine. The native route runs the copied Swift source directly.
Future iOS changes must be deliberately synced, reviewed and rebuilt here.
