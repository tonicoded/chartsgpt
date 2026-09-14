import Foundation

// Verbatim iOS alignment types/helpers; only the enclosing type and entry point differ.
enum IOSHigherTimeframeAlignment {
    private struct HigherTimeframeAlignmentContext: Sendable {
        enum Direction: String, Sendable {
            case bullish
            case bearish
            case mixed
        }

        let timeframe: String
        let direction: Direction
        let trend: Direction
        let momentum: Direction
        let exhausted: Bool
        let regime: String
        let structure: String
        let emaSummary: String?
        let rsiSummary: String?
        let macdSummary: String?
        let keyLevels: [ChartAnalysisPayload.KeyLevel]

        nonisolated var summary: String {
            var parts = ["\(timeframe) \(direction.rawValue) context"]
            parts.append("trend \(trend.rawValue)")
            parts.append("momentum \(momentum.rawValue)")
            if exhausted { parts.append("exhausted") }
            if regime.isEmpty == false { parts.append(regime) }
            if structure.isEmpty == false { parts.append(structure) }
            if let emaSummary { parts.append(emaSummary) }
            if let rsiSummary { parts.append(rsiSummary) }
            if let macdSummary { parts.append(macdSummary) }
            return parts.prefix(7).joined(separator: " • ")
        }
    }

    nonisolated private static func higherTimeframeAlignmentContext(from snapshot: MarketSnapshot) -> HigherTimeframeAlignmentContext {
        let joined = ([snapshot.marketRegime, snapshot.marketStructure, snapshot.signal] + snapshot.confluence + snapshot.indicators)
            .joined(separator: " ")
            .lowercased()
        var bullish = 0
        var bearish = 0
        if snapshot.signal == "Buy" { bullish += 2 }
        if snapshot.signal == "Sell" { bearish += 2 }
        bullish += snapshot.bias?.bullish ?? 0
        bearish += snapshot.bias?.bearish ?? 0
        if joined.contains("above ema200") || joined.contains("ema20 above ema50") || joined.contains("higher highs") { bullish += 12 }
        if joined.contains("below ema200") || joined.contains("ema20 below ema50") || joined.contains("lower lows") { bearish += 12 }
        if joined.contains("macd bullish") || joined.contains("macd histogram is positive") { bullish += 8 }
        if joined.contains("macd bearish") || joined.contains("macd histogram is negative") { bearish += 8 }

        let rsiSummary = snapshot.indicators.first { $0.localizedCaseInsensitiveContains("RSI(14):") }
        let macdSummary = snapshot.indicators.first { $0.localizedCaseInsensitiveContains("MACD:") }
        let adxSummary = snapshot.indicators.first { $0.localizedCaseInsensitiveContains("ADX(14):") }
        let stochSummary = snapshot.indicators.first { $0.localizedCaseInsensitiveContains("Stoch(14):") }

        let trend: HigherTimeframeAlignmentContext.Direction
        if joined.contains("above ema200") || joined.contains("ema20 above ema50") || joined.contains("higher highs") {
            trend = .bullish
        } else if joined.contains("below ema200") || joined.contains("ema20 below ema50") || joined.contains("lower lows") {
            trend = .bearish
        } else {
            trend = .mixed
        }

        var momentumBullish = 0
        var momentumBearish = 0
        if let rsi = rsiSummary.flatMap({ firstNumericValue(in: $0) }) {
            if rsi >= 52 { momentumBullish += 1 }
            if rsi <= 48 { momentumBearish += 1 }
        }
        if let macd = macdSummary?.lowercased() {
            if macd.contains("hist: +") || macd.contains("histogram is positive") { momentumBullish += 2 }
            if macd.contains("hist: -") || macd.contains("histogram is negative") { momentumBearish += 2 }
        }
        if let adx = adxSummary?.lowercased() {
            if adx.contains("+di") && adx.contains("-di") {
                let plusDI = firstNumericValue(after: "+DI", in: adx)
                let minusDI = firstNumericValue(after: "-DI", in: adx)
                if let plusDI, let minusDI {
                    if plusDI > minusDI { momentumBullish += 1 }
                    if minusDI > plusDI { momentumBearish += 1 }
                }
            }
        }
        let momentum: HigherTimeframeAlignmentContext.Direction
        if momentumBullish >= momentumBearish + 2 {
            momentum = .bullish
        } else if momentumBearish >= momentumBullish + 2 {
            momentum = .bearish
        } else {
            momentum = .mixed
        }

        let direction: HigherTimeframeAlignmentContext.Direction
        if trend == momentum, trend != .mixed {
            direction = trend
        } else if bullish >= bearish + 15 {
            direction = .bullish
        } else if bearish >= bullish + 15 {
            direction = .bearish
        } else {
            direction = .mixed
        }

        let rsiValue = rsiSummary.flatMap { firstNumericValue(in: $0) }
        let stochValue = stochSummary.flatMap { firstNumericValue(after: "%K", in: $0) }
        let exhausted = joined.contains("exhausted trend")
            || joined.contains("exhaustion")
            || joined.contains("climax")
            || joined.contains("overextended")
            || (rsiValue.map { $0 >= 75 || $0 <= 25 } ?? false)
            || (stochValue.map { $0 >= 92 || $0 <= 8 } ?? false)

        let emaSummary = snapshot.confluence.first { $0.localizedCaseInsensitiveContains("EMA") }
        return HigherTimeframeAlignmentContext(
            timeframe: snapshot.timeframe,
            direction: direction,
            trend: trend,
            momentum: momentum,
            exhausted: exhausted,
            regime: snapshot.marketRegime,
            structure: snapshot.marketStructure,
            emaSummary: emaSummary,
            rsiSummary: rsiSummary,
            macdSummary: macdSummary,
            keyLevels: Array(snapshot.supportResistance.prefix(6))
        )
    }

    nonisolated private static func firstNumericValue(in text: String) -> Double? {
        let pattern = #"[+-]?\d+(?:\.\d+)?"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = regex.firstMatch(in: text, range: range),
              let valueRange = Range(match.range, in: text) else {
            return nil
        }
        return Double(text[valueRange])
    }

    nonisolated private static func firstNumericValue(after label: String, in text: String) -> Double? {
        guard let labelRange = text.range(of: label, options: [.caseInsensitive]) else { return nil }
        return firstNumericValue(in: String(text[labelRange.upperBound...]))
    }

    nonisolated private static func setupDirectionKind(_ setup: ChartAnalysisPayload.TradeSetup) -> HigherTimeframeAlignmentContext.Direction {
        let text = "\(setup.direction) \(setup.setup) \(setup.trigger)".lowercased()
        if text.contains("long") || text.contains("bull") || text.contains("buy") { return .bullish }
        if text.contains("short") || text.contains("bear") || text.contains("sell") { return .bearish }
        return .mixed
    }

    nonisolated private static func applyHigherTimeframeAlignment(
        to setup: ChartAnalysisPayload.TradeSetup,
        contexts: [HigherTimeframeAlignmentContext]
    ) -> ChartAnalysisPayload.TradeSetup {
        let setupDirection = setupDirectionKind(setup)
        guard setupDirection != .mixed, contexts.isEmpty == false else { return setup }

        var updated = setup
        let opposite = contexts.filter { $0.direction != .mixed && $0.direction != setupDirection }
        let mixed = contexts.filter { $0.direction == .mixed }
        let exhausted = contexts.filter(\.exhausted)
        let note: String
        if opposite.isEmpty == false {
            var reason = opposite.map { "\($0.timeframe) \($0.direction.rawValue)" }.joined(separator: "; ")
            if exhausted.isEmpty == false {
                reason += "; exhausted " + exhausted.map(\.timeframe).joined(separator: "/")
            }
            note = "Higher timeframe conflict: \(reason). Confidence cap: 60 until LTF reclaims with HTF confirmation."
        } else if mixed.isEmpty == false {
            var reason = mixed.map { "\($0.timeframe) mixed" }.joined(separator: "; ")
            if exhausted.isEmpty == false {
                reason += "; exhausted " + exhausted.map(\.timeframe).joined(separator: "/")
            }
            note = "HTF mixed: \(reason). Confidence cap: 75 until direction confirms."
        } else if exhausted.isEmpty == false {
            let reason = exhausted.map(\.timeframe).joined(separator: "/")
            note = "HTF aligned but exhausted: \(reason). Confidence cap: 84; no Elite until pullback resets."
        } else {
            note = "HTF aligned: " + contexts.map { "\($0.timeframe) \($0.direction.rawValue)" }.joined(separator: "; ") + "."
        }
        if updated.notes.contains(note) == false {
            updated.notes.append(note)
        }

        let rationale = "HTF filter: " + contexts.map(\.summary).joined(separator: " | ") + "."
        if updated.rationale.contains(rationale) == false {
            updated.rationale.append(rationale)
        }
        return updated
    }

    nonisolated private static func applyHigherTimeframeAlignment(
        to snapshot: MarketSnapshot,
        contexts: [HigherTimeframeAlignmentContext]
    ) -> MarketSnapshot {
        guard contexts.isEmpty == false else { return snapshot }
        let alignedSetups = snapshot.tradeSetups.map { applyHigherTimeframeAlignment(to: $0, contexts: contexts) }
        let htfLines = contexts.map { "HTF \($0.timeframe): \($0.summary)" }
        let confluence = htfLines.reduce(snapshot.confluence) { result, line in
            result.contains(line) ? result : result + [line]
        }

        var riskNotes = snapshot.riskNotes
        if contexts.contains(where: { $0.direction == .mixed }) {
            let note = "Higher timeframe is mixed; directional setups should stay watchlist until confirmation."
            if riskNotes.contains(note) == false { riskNotes.append(note) }
        }

        return MarketSnapshot(
            exchange: snapshot.exchange,
            symbol: snapshot.symbol,
            timeframe: snapshot.timeframe,
            candleCount: snapshot.candleCount,
            start: snapshot.start,
            end: snapshot.end,
            lastClose: snapshot.lastClose,
            changePct: snapshot.changePct,
            marketRegime: snapshot.marketRegime,
            marketStructure: snapshot.marketStructure,
            regimeConfidence: snapshot.regimeConfidence,
            signal: snapshot.signal,
            riskLevel: snapshot.riskLevel,
            volumeState: snapshot.volumeState,
            summary: snapshot.summary,
            indicators: snapshot.indicators,
            confluence: confluence,
            fibLevels: snapshot.fibLevels,
            supportResistance: snapshot.supportResistance,
            scenarios: snapshot.scenarios,
            targets: snapshot.targets,
            tradeSetups: alignedSetups,
            bias: snapshot.bias,
            riskNotes: riskNotes,
            news: snapshot.news,
            macroCalendar: snapshot.macroCalendar,
            derivatives: snapshot.derivatives,
            fearGreed: snapshot.fearGreed,
            gradingContext: snapshot.gradingContext
        )
    }


    static func apply(to snapshot: MarketSnapshot, snapshots: [MarketSnapshot]) -> MarketSnapshot {
        applyHigherTimeframeAlignment(to: snapshot, contexts: snapshots.map { higherTimeframeAlignmentContext(from: $0) })
    }
}
