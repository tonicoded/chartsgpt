import Foundation

// Minimal stubs required by MarketDataService.swift + MarketAnalysisEngine.swift when compiling as a CLI.
// We intentionally avoid importing SwiftUI / app-only modules.

enum DataProvider: String, Sendable {
    case yahoo
    case stooq
    case auto
}

enum AnalysisSettings {
    static var dataProvider: DataProvider = .auto
}

enum StrategyRiskMode: String, CaseIterable, Identifiable, Sendable, Codable {
    case conservative
    case balanced
    case aggressive

    var id: String { rawValue }

    var title: String {
        switch self {
        case .conservative: return "Conservative"
        case .balanced: return "Balanced"
        case .aggressive: return "Aggressive"
        }
    }
}

nonisolated struct MarketNewsItem: Hashable, Sendable, Codable {
    let title: String
    let url: String
    let source: String?
    let publishedAt: Date?
    let snippet: String?
    let tone: Double?
}

nonisolated struct MarketNewsDigest: Hashable, Sendable, Codable {
    let query: String
    let lookbackDays: Int
    let fetchedAt: Date
    let summary: String?
    let errorMessage: String?
    let items: [MarketNewsItem]

    func bulletLines(maxCount: Int = 5) -> [String] { [] }
}

nonisolated struct MacroCalendarEvent: Hashable, Sendable, Codable {
    let title: String
    let currency: String
    let impact: String?
    let scheduledAt: Date?
    let forecast: String?
    let previous: String?
    let actual: String?
}

nonisolated struct MacroCalendarDigest: Hashable, Sendable, Codable {
    let fetchedAt: Date
    let currencies: [String]
    let lookaheadDays: Int
    let source: String
    let errorMessage: String?
    let events: [MacroCalendarEvent]

    func lines(maxCount: Int = 8) -> [String] { [] }
}

nonisolated struct DerivativesDigest: Hashable, Sendable, Codable {
    let fetchedAt: Date
    let source: String
    let errorMessage: String?

    let fundingRate: Double?
    let fundingRateNextAt: Date?

    let openInterest: Double?
    let openInterestChange24h: Double?

    let longShortRatio: Double?
    let longAccountPct: Double?
    let shortAccountPct: Double?
}

// Needed for some shared payload helpers and types in the analysis engine.
nonisolated struct ChartAnalysisPayload: Codable, Sendable {
    struct KeyLevel: Codable, Hashable, Sendable {
        var price: String
        var kind: String
        var note: String?
    }

    struct Scenario: Codable, Hashable, Sendable {
        var name: String
        var trigger: String
        var path: String
        var invalidation: String?
        var probability: Int?
    }

    struct TimeHorizonTargets: Codable, Hashable, Sendable {
        var shortTerm: [String]
        var mediumTerm: [String]
        var longTerm: [String]
    }

    struct TradeSetup: Codable, Hashable, Sendable {
        var horizon: String
        var direction: String
        var setup: String
        var trigger: String
        var entry: String?
        var stop: String?
        var targets: [String]
        var rr: String?
        var notes: [String]
        var rationale: [String]
        // Mirrors the app's fields, set by SetupEdgeModel.
        var edgeGrade: String?
        var edgeExpectancyR: Double?
        var edgeHitRate: Double?
        var edgeRawScore: Double?

        init(
            horizon: String,
            direction: String,
            setup: String,
            trigger: String,
            entry: String?,
            stop: String?,
            targets: [String],
            rr: String?,
            notes: [String],
            rationale: [String] = []
        ) {
            self.horizon = horizon
            self.direction = direction
            self.setup = setup
            self.trigger = trigger
            self.entry = entry
            self.stop = stop
            self.targets = targets
            self.rr = rr
            self.notes = notes
            self.rationale = rationale
        }
    }

    struct Bias: Codable, Hashable, Sendable {
        var bullish: Int?
        var bearish: Int?
        var neutral: Int?
    }
}


struct Candle: Hashable, Sendable, Codable {
 let openTime: Date
 let open: Double
 let high: Double
 let low: Double
 let close: Double
 let volume: Double
}
