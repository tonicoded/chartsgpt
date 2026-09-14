import Foundation

nonisolated struct SetupQualityScore: Hashable, Sendable {
    let score: Int
    let label: String
    let reasons: [String]
}

nonisolated struct SetupQualityContext: Hashable, Sendable {
    let trend: String
    let signal: String
    let risk: String
    let volume: String
    let marketRegime: String
    let regimeConfidence: Int?
    let confluence: [String]
    let riskNotes: [String]

    init(
        trend: String = "",
        signal: String = "",
        risk: String = "",
        volume: String = "",
        marketRegime: String = "",
        regimeConfidence: Int? = nil,
        confluence: [String] = [],
        riskNotes: [String] = []
    ) {
        self.trend = trend
        self.signal = signal
        self.risk = risk
        self.volume = volume
        self.marketRegime = marketRegime
        self.regimeConfidence = regimeConfidence
        self.confluence = confluence
        self.riskNotes = riskNotes
    }

    init(snapshot: MarketSnapshot) {
        self.init(
            trend: snapshot.marketStructure,
            signal: snapshot.signal,
            risk: snapshot.riskLevel,
            volume: snapshot.volumeState,
            marketRegime: snapshot.marketRegime,
            regimeConfidence: snapshot.regimeConfidence,
            confluence: snapshot.confluence,
            riskNotes: snapshot.riskNotes
        )
    }
}

nonisolated enum SetupQualityScorer {
    static func score(
        setup: ChartAnalysisPayload.TradeSetup,
        context: SetupQualityContext
    ) -> SetupQualityScore {
        let rrComponent = riskRewardComponent(setup.rr)
        let trendComponent = trendAlignmentComponent(setup: setup, context: context)
        let volumeComponent = volumeComponent(context.volume)
        let riskComponent = riskComponent(context: context)
        let confidenceComponent = confidenceComponent(
            regimeConfidence: context.regimeConfidence,
            confluenceCount: max(context.confluence.count, setup.rationale.count)
        )
        let penaltyComponent = qualityPenaltyComponent(setup: setup, context: context)
        let riskMode = currentRiskMode()
        let baseTotal = min(100.0, max(0.0,
            rrComponent.points +
            trendComponent.points +
            volumeComponent.points +
            riskComponent.points +
            confidenceComponent.points
        ))
        let cappedPenalty = min(penaltyComponent.points, maxPenalty(for: riskMode))
        let penaltyModifier = max(0.62, 1.0 - (cappedPenalty / 100.0))
        var adjustedTotal = Int(round(baseTotal * penaltyModifier))
        if let floor = qualityFloor(setup: setup, riskMode: riskMode), adjustedTotal < floor {
            adjustedTotal = floor
        }
        if riskMode == "aggressive", rrValue(setup.rr) >= 1.5 {
            adjustedTotal += 8
        } else if riskMode == "balanced", rrValue(setup.rr) >= 1.8 {
            adjustedTotal += 2
        }

        let rawTotal = min(100, max(0, adjustedTotal))
        var total = min(normalizedScore(rawTotal), scoreCap(setup: setup, context: context))

        // Bound the displayed score by the grade `SetupEdgeModel` assigned.
        // The components above are heuristic; the grade is a measured base rate
        // that held up on symbols its weights were never fitted on. Where they
        // disagree, the measurement wins, so a "Strong" badge cannot sit on top
        // of a setup whose conditions historically lost money.
        if let edgeGrade = edgeGrade(of: setup) {
            total = min(total, edgeScoreCeiling(for: edgeGrade))
            total = max(total, edgeScoreFloor(for: edgeGrade))
        }

        let label: String
        if total >= 85 {
            label = "Elite"
        } else if total >= 75 {
            label = "Strong"
        } else if riskMode == "aggressive", rrValue(setup.rr) >= 1.8, total >= 58 {
            label = "Strong"
        } else if riskMode == "aggressive", rrValue(setup.rr) >= 2.2, total >= 55 {
            label = "Strong"
        } else if riskMode == "balanced", total >= 68, rrValue(setup.rr) >= 2.5 {
            label = "Strong"
        } else if total >= 62 {
            label = "Moderate"
        } else if total >= 48 {
            label = contextualLabel(setup: setup, riskMode: riskMode)
        } else {
            label = "Avoid"
        }

        let reasons = [
            rrComponent.reason,
            trendComponent.reason,
            volumeComponent.reason,
            riskComponent.reason,
            confidenceComponent.reason,
            penaltyComponent.reason
        ]
        .filter { $0.isEmpty == false }
        .prefix(4)

        return SetupQualityScore(score: total, label: label, reasons: Array(reasons))
    }

    private static func currentRiskMode() -> String {
        let raw = UserDefaults.standard.string(forKey: "analysis.strategy.riskMode") ?? "balanced"
        if raw == "conservative" || raw == "low" { return "conservative" }
        if raw == "aggressive" || raw == "high" { return "aggressive" }
        return "balanced"
    }

    private static func maxPenalty(for riskMode: String) -> Double {
        switch riskMode {
        case "conservative": return 35
        case "aggressive": return 20
        default: return 25
        }
    }

    private static func normalizedScore(_ score: Int) -> Int {
        let value = Double(min(100, max(0, score)))
        let normalized: Double
        if value <= 78 {
            normalized = value
        } else if value <= 88 {
            normalized = 78 + (value - 78) * 0.55
        } else {
            normalized = 84.5 + (value - 88) * 0.36
        }
        return Int(round(min(100, max(0, normalized))))
    }

    private static func setupText(_ setup: ChartAnalysisPayload.TradeSetup) -> String {
        ([setup.direction, setup.setup, setup.trigger] + setup.notes + setup.rationale)
            .joined(separator: " ")
            .lowercased()
    }

    private static func isDirectional(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
        switch directionKind(setup.direction) {
        case .long, .short: return true
        case .neutral: return false
        }
    }

    private static func qualityFloor(setup: ChartAnalysisPayload.TradeSetup, riskMode: String) -> Int? {
        let text = setupText(setup)
        guard isDirectional(setup) else { return nil }
        guard text.contains("no high-quality setup") == false,
              text.contains("no edge") == false,
              text.contains("no-trade") == false,
              text.contains("no trade") == false else {
            return nil
        }
        let rr = rrValue(setup.rr)
        let hasUsableRiskReward = rr >= 1.0
        let contextual = text.contains("watch")
            || text.contains("conditional")
            || text.contains("speculative")
            || text.contains("aggressive")
            || text.contains("reclaim")
            || text.contains("breakdown")
            || text.contains("range rotation")
            || text.contains("reversal")
            || text.contains("pullback")
        guard hasUsableRiskReward || contextual else { return nil }
        switch riskMode {
        case "conservative": return 55
        case "aggressive": return 45
        default: return 50
        }
    }

    private static func contextualLabel(setup: ChartAnalysisPayload.TradeSetup, riskMode: String) -> String {
        let text = setupText(setup)
        if riskMode == "aggressive" {
            return text.contains("conditional") || text.contains("watch") ? "Conditional" : "Speculative"
        }
        if riskMode == "conservative" { return "Watch" }
        return text.contains("speculative") || text.contains("aggressive") ? "Speculative" : "Conditional"
    }

    /// Reads the grade `SetupEdgeModel` stamped onto the setup's notes.
    private static func edgeGrade(of setup: ChartAnalysisPayload.TradeSetup) -> SetupEdge.Grade? {
        if let field = setup.edgeGrade, let grade = SetupEdge.Grade(rawValue: String(field.prefix(1))) {
            return grade
        }
        guard let note = setup.notes.first(where: { $0.hasPrefix("Edge grade: ") }) else { return nil }
        return SetupEdge.Grade(rawValue: String(note.dropFirst("Edge grade: ".count).prefix(1)))
    }

    /// Measured expectancy per grade on held-out symbols was
    /// A +0.21R, B -0.03R, C -0.17R, D -0.25R. These bounds keep the badge
    /// honest about that ordering.
    private static func edgeScoreCeiling(for grade: SetupEdge.Grade) -> Int {
        switch grade {
        case .a: return 100
        case .b: return 74
        case .c: return 61
        case .d: return 47
        }
    }

    private static func edgeScoreFloor(for grade: SetupEdge.Grade) -> Int {
        switch grade {
        case .a: return 72
        case .b: return 50
        case .c: return 0
        case .d: return 0
        }
    }

    private static func scoreCap(setup: ChartAnalysisPayload.TradeSetup, context: SetupQualityContext) -> Int {
        min(
            setupStateCap(setup: setup),
            riskRewardCap(setup.rr),
            lowConfidenceCap(setup: setup),
            extremeRRCap(setup: setup, context: context),
            conflictConfidenceCap(setup: setup),
            overextensionCap(setup: setup, context: context),
            directionalConfluenceCap(setup: setup, context: context)
        )
    }

    private static func setupStateCap(setup: ChartAnalysisPayload.TradeSetup) -> Int {
        let joined = ([setup.direction, setup.setup, setup.trigger] + setup.notes + setup.rationale)
            .joined(separator: " ")
            .lowercased()

        var cap = 100
        if joined.contains("no high-quality setup") {
            cap = min(cap, 55)
        }
        if (joined.contains("neutral") && joined.contains("watch") == false) || joined.contains("no edge") {
            cap = min(cap, 50)
        }
        if joined.contains("avoid") || joined.contains("no-trade") || joined.contains("no trade") {
            cap = min(cap, 39)
        }
        return cap
    }

    private static func riskRewardCap(_ rr: String?) -> Int {
        let value = rrValue(rr)
        guard value > 0 else { return 55 }
        if value < 1.2 { return 65 }
        if value < 1.5 { return 78 }
        if value < 1.8 { return 84 }
        return 100
    }

    private static func lowConfidenceCap(setup: ChartAnalysisPayload.TradeSetup) -> Int {
        let joined = setupText(setup)
        let isLowConfidence = joined.contains("watchlist")
            || joined.contains("fallback")
            || joined.contains("low-confidence")
            || joined.contains("speculative")
            || joined.contains("no high-quality")
        guard isLowConfidence else { return 100 }
        switch currentRiskMode() {
        case "conservative": return 70
        case "aggressive": return 79
        default: return 76
        }
    }

    private static func extremeRRCap(setup: ChartAnalysisPayload.TradeSetup, context: SetupQualityContext) -> Int {
        let rr = rrValue(setup.rr)
        guard rr >= 4.95 else { return 100 }
        let joined = ([setup.setup, setup.trigger] + setup.notes + setup.rationale + context.confluence + context.riskNotes + [
            context.volume,
            context.trend,
            context.marketRegime
        ])
        .joined(separator: " ")
        .lowercased()

        let volumeConfirmed = joined.contains("volume expansion")
            || joined.contains("high volume")
            || joined.contains("strong volume")
            || joined.contains("volume confirms")
        let htfConfirmed = joined.contains("htf aligned")
            || joined.contains("higher timeframe aligned")
        let structureConfirmed = joined.contains("bos")
            || joined.contains("break of structure")
            || joined.contains("reclaim")
            || joined.contains("breakout confirmed")
            || joined.contains("accepted above")
            || joined.contains("accepted below")

        if volumeConfirmed && htfConfirmed && structureConfirmed { return 100 }
        return rr >= 6.0 ? 78 : 82
    }

    private static func conflictConfidenceCap(setup: ChartAnalysisPayload.TradeSetup) -> Int {
        let joined = ([setup.setup, setup.trigger] + setup.notes + setup.rationale)
            .joined(separator: " ")
            .lowercased()

        if let explicit = explicitConfidenceCap(from: joined) {
            return explicit
        }

        var conflicts = 0
        conflicts += joined.components(separatedBy: "diverges from").count - 1
        conflicts += joined.components(separatedBy: "conflict").count - 1
        conflicts += joined.components(separatedBy: "exhaustion").count - 1
        conflicts += joined.components(separatedBy: "trap risk").count - 1
        conflicts += joined.components(separatedBy: "reduced").count - 1
        conflicts += joined.components(separatedBy: "opposite").count - 1

        let riskMode = currentRiskMode()
        if conflicts >= 3 { return riskMode == "aggressive" ? 70 : (riskMode == "balanced" ? 58 : 39) }
        if conflicts == 2 { return riskMode == "aggressive" ? 82 : (riskMode == "balanced" ? 78 : 60) }
        if conflicts == 1 { return riskMode == "aggressive" ? 88 : (riskMode == "balanced" ? 86 : 78) }
        return 100
    }

    private static func overextensionCap(setup: ChartAnalysisPayload.TradeSetup, context: SetupQualityContext) -> Int {
        let joined = ([setup.setup, setup.trigger] + setup.notes + setup.rationale + context.confluence + context.riskNotes + [
            context.marketRegime,
            context.trend
        ])
        .joined(separator: " ")
        .lowercased()

        if joined.contains("exhausted trend") || joined.contains("exhaustion") || joined.contains("climax") || joined.contains("trap risk") {
            return currentRiskMode() == "conservative" ? 65 : (currentRiskMode() == "aggressive" ? 80 : 76)
        }
        if joined.contains("overbought") || joined.contains("stretched") || joined.contains("late trend") || joined.contains("late-stage") {
            return 90
        }
        return 100
    }

    private static func directionalConfluenceCap(setup: ChartAnalysisPayload.TradeSetup, context: SetupQualityContext) -> Int {
        let direction = directionKind(setup.direction)
        let joined = (context.confluence + setup.notes + setup.rationale)
            .joined(separator: " ")
            .lowercased()

        switch direction {
        case .long:
            if joined.contains("obv falling") || joined.contains("obv down") { return currentRiskMode() == "conservative" ? 62 : (currentRiskMode() == "aggressive" ? 84 : 78) }
            if joined.contains("macd bearish") || joined.contains("roc(14) down") { return currentRiskMode() == "conservative" ? 62 : (currentRiskMode() == "aggressive" ? 84 : 78) }
        case .short:
            if joined.contains("obv rising") || joined.contains("obv up") { return currentRiskMode() == "conservative" ? 62 : (currentRiskMode() == "aggressive" ? 84 : 78) }
            if joined.contains("macd bullish") || joined.contains("roc(14) up") { return currentRiskMode() == "conservative" ? 62 : (currentRiskMode() == "aggressive" ? 84 : 78) }
        case .neutral:
            return 100
        }
        return 100
    }

    private static func qualityPenaltyComponent(
        setup: ChartAnalysisPayload.TradeSetup,
        context: SetupQualityContext
    ) -> (points: Double, reason: String) {
        let joined = ([setup.setup, setup.trigger] + setup.notes + setup.rationale + context.confluence + context.riskNotes + [
            context.trend,
            context.signal,
            context.marketRegime,
            context.volume
        ])
        .joined(separator: " ")
        .lowercased()

        var penalty = 0.0
        var reasons: [String] = []

        func add(_ value: Double, _ reason: String) {
            penalty += value
            if reasons.contains(reason) == false {
                reasons.append(reason)
            }
        }

        if joined.contains("no high-quality setup") || joined.contains("no edge") || joined.contains("avoid") {
            add(30, "No edge / avoid")
        }
        if joined.contains("htf conflict") || joined.contains("higher timeframe conflict") {
            add(15, "Higher timeframe conflict")
        }
        if joined.contains("diverges from") || joined.contains("momentum conflict") || joined.contains("indicator conflict") {
            add(10, "Momentum conflict")
        }
        if joined.contains("exhausted trend") || joined.contains("exhaustion") || joined.contains("stretched") || joined.contains("overbought") || joined.contains("trap risk") {
            add(10, "Exhaustion risk")
        }
        if joined.contains("low volume") || joined.contains("volume is low") || joined.contains("declining volume") || joined.contains("without volume") || joined.contains("lacks follow-through") {
            add(8, "Weak volume")
        }
        if joined.contains("low adx") || joined.contains("no clear trend") || joined.contains("chop") || joined.contains("range-bound") || joined.contains("compression") {
            add(6, "Low-ADX / chop")
        }
        if joined.contains("regression slope opposite") || joined.contains("opposite regression") {
            add(10, "Regression slope conflict")
        }

        let capped = min(penalty, maxPenalty(for: currentRiskMode()))
        return (capped, reasons.prefix(2).joined(separator: " + "))
    }

    private static func explicitConfidenceCap(from text: String) -> Int? {
        guard let range = text.range(of: "confidence cap:") else { return nil }
        let suffix = text[range.upperBound...].drop { $0.isWhitespace }
        let digits = suffix.prefix { $0.isNumber }
        guard let value = Int(digits) else { return nil }
        var cap = max(0, min(value, 100))
        let riskMode = currentRiskMode()
        if text.contains("htf mixed") || text.contains("until direction confirms") {
            cap = max(cap, riskMode == "conservative" ? 75 : (riskMode == "aggressive" ? 82 : 80))
        } else if text.contains("htf") || text.contains("higher timeframe conflict") {
            cap = max(cap, riskMode == "conservative" ? 55 : (riskMode == "aggressive" ? 75 : 68))
        }
        return cap
    }

    private static func riskRewardComponent(_ rr: String?) -> (points: Double, reason: String) {
        let value = rrValue(rr)
        if value >= 3.0 { return (35, "Excellent R:R \(formatRR(value))") }
        if value >= 2.0 { return (30, "Clean R:R \(formatRR(value))") }
        if value >= 1.4 { return (23, "Acceptable R:R \(formatRR(value))") }
        if value >= 1.0 { return (16, "Thin R:R \(formatRR(value))") }
        return (8, "Weak or missing R:R")
    }

    private static func trendAlignmentComponent(
        setup: ChartAnalysisPayload.TradeSetup,
        context: SetupQualityContext
    ) -> (points: Double, reason: String) {
        let direction = directionKind(setup.direction)
        let combined = "\(context.trend) \(context.signal) \(context.marketRegime) \(setup.setup) \(setup.trigger)".lowercased()
        let bullishContext = combined.contains("bull") || combined.contains("uptrend") || combined.contains("higher high") || combined.contains("rebound")
        let bearishContext = combined.contains("bear") || combined.contains("downtrend") || combined.contains("lower low") || combined.contains("breakdown")
        let rangeContext = combined.contains("range") || combined.contains("consolidation") || combined.contains("rotation")

        switch direction {
        case .long where bullishContext && !bearishContext:
            return (25, "Aligned with bullish structure")
        case .short where bearishContext && !bullishContext:
            return (25, "Aligned with bearish structure")
        case .long where bearishContext && !bullishContext:
            return (7, "Counter-trend long")
        case .short where bullishContext && !bearishContext:
            return (7, "Counter-trend short")
        case .long where rangeContext:
            return (15, "Range setup, wait for trigger")
        case .short where rangeContext:
            return (15, "Range setup, wait for trigger")
        case .long, .short:
            return (14, "Direction partly supported")
        case .neutral:
            return (10, "No clear directional alignment")
        }
    }

    private static func volumeComponent(_ volume: String) -> (points: Double, reason: String) {
        let lower = volume.lowercased()
        if lower.contains("high") || lower.contains("elevated") || lower.contains("strong") {
            return (15, "Volume supports move")
        }
        if lower.contains("normal") || lower.contains("estimated") {
            return (10, "Volume is acceptable")
        }
        if lower.contains("synthetic") || lower.contains("not available") || lower.contains("unknown") {
            return (7, "Volume confidence limited")
        }
        if lower.contains("low") {
            return (5, "Low volume confirmation")
        }
        return (8, "Volume neutral")
    }

    private static func riskComponent(context: SetupQualityContext) -> (points: Double, reason: String) {
        let risk = context.risk.lowercased()
        let joinedNotes = context.riskNotes.joined(separator: " ").lowercased()
        let hasMacroFlag = joinedNotes.contains("fomc") ||
            joinedNotes.contains("cpi") ||
            joinedNotes.contains("rate") ||
            joinedNotes.contains("macro") ||
            joinedNotes.contains("event")

        if risk.contains("high") {
            return (4, hasMacroFlag ? "High macro/event risk" : "High risk environment")
        }
        if risk.contains("medium") || risk.contains("moderate") {
            return (10, hasMacroFlag ? "Moderate macro risk" : "Risk is manageable")
        }
        if risk.contains("low") {
            return (15, "Low risk backdrop")
        }
        return hasMacroFlag ? (8, "Event risk present") : (11, "No major risk flag")
    }

    private static func confidenceComponent(
        regimeConfidence: Int?,
        confluenceCount: Int
    ) -> (points: Double, reason: String) {
        let confidence = max(0, min(regimeConfidence ?? 50, 100))
        let confidencePoints = Double(confidence) / 100.0 * 7.0
        let confluencePoints = min(Double(confluenceCount), 3.0)
        let total = confidencePoints + confluencePoints
        if confidence >= 70 || confluenceCount >= 3 {
            return (total, "Good confluence")
        }
        if confidence >= 45 {
            return (total, "Moderate regime confidence")
        }
        return (total, "Lower regime confidence")
    }

    private enum DirectionKind {
        case long
        case short
        case neutral
    }

    private static func directionKind(_ direction: String) -> DirectionKind {
        let lower = direction.lowercased()
        if lower.contains("long") || lower.contains("bull") || lower.contains("buy") { return .long }
        if lower.contains("short") || lower.contains("bear") || lower.contains("sell") { return .short }
        return .neutral
    }

    private static func rrValue(_ rr: String?) -> Double {
        guard let rr else { return 0 }
        let cleaned = rr.lowercased().replacingOccurrences(of: " ", with: "")
        let parts = cleaned.split(separator: ":")
        if parts.count >= 2, let denom = Double(parts[1].filter { $0.isNumber || $0 == "." }) {
            return denom
        }
        let numeric = cleaned.filter { $0.isNumber || $0 == "." }
        return Double(numeric) ?? 0
    }

    private static func formatRR(_ value: Double) -> String {
        value > 0 ? "1:\(String(format: "%.1f", value))" : "n/a"
    }
}
