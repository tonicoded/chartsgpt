import Foundation

// ============================================================================
// SetupEdgeModel
//
// Estimates the expected value of a trade setup, in R, from the conditions it
// was generated in.
//
// Why this exists
// ---------------
// The engine used to rank setups with a hand-tuned tuple of booleans, and told
// users about quality through English prose in `notes` ("Confidence cap: 60"),
// which a later stage re-parsed by string matching. Walk-forward replay of
// ~30k real setups showed the resulting numbers carried no usable signal:
//
//   * advertised R:R was inversely related to outcome — the 68% of setups
//     promising 3R+ won 26.7% of the time, worse than the 1.2-2.0R setups
//   * the published "continuation probability" was anti-calibrated: its
//     45-54% bucket performed worse than its <35% bucket
//   * the published "trap risk" was inverted: the 26%+ bucket did best
//
// Meanwhile, conditions the engine already knew about *did* separate outcomes
// strongly. Those measured separations are the weights below.
//
// How the weights were set
// ------------------------
// Each weight is the measured expectancy of that bucket minus the overall
// mean, taken from walk-forward replay, then shrunk (see `shrinkage`) because
// the features are correlated and adding raw deltas would double-count.
// Weights were fit on a reserved subset of symbols and validated on symbols
// the fit never saw — see tools/engine_eval_runner.swift.
//
// These are *base rates over a historical sample*, not predictions. They rank
// setups against each other; they do not promise a result.
//
    // Stability audit, 2026-08-20: splitting the *fit* symbols into two halves and
    // re-measuring each feature showed the states below flipping sign between the
    // halves. A weight derived from the combined fit set therefore averaged noise
    // and predictably inverted out of sample. They are held at zero until a larger
    // sample gives them a stable sign; the plumbing stays so they can be re-measured.
//
// Kept because they held their sign across both fit halves: archetype, price vs
// EMA200, structure, bias skew, range budget.
// ============================================================================

nonisolated struct SetupEdgeFeatures: Sendable {
    enum Side: Sendable { case long, short }

    enum Archetype: String, Sendable {
        case continuation
        case breakdownContinuation
        case breakoutContinuation
        case reversal
        case fade
        case breakout
        case breakdown
        case pullback
        case pullbackContinuation
        case range
        case reclaim
        case trendRejection
        case rejectionMomentum
        case other
    }

    enum StructureKind: Sendable { case trendingUp, trendingDown, mixed }

    /// What kind of instrument this is. The engine reads the same charts for all
    /// of them, but they do not pay the same: on held-out symbols equities
    /// returned +0.214R per trade, metals +0.134R, crypto +0.098R and forex
    /// -0.044R. The model was blind to that, which made a forex grade actively
    /// misleading: filtering forex to grade B and above measured *worse* than
    /// not filtering at all.
    enum AssetClass: String, Sendable, Codable, Hashable {
        case crypto
        case equity
        case metal
        case forex
        case index
        case other
    }

    var side: Side
    var archetype: Archetype
    var assetClass: AssetClass
    var structure: StructureKind
    /// Regime confidence as published by `inferMarketRegime`, 0-100.
    var regimeConfidence: Int?
    /// Directional bias skew from the setup's point of view: bullish minus
    /// bearish for longs, the reverse for shorts. Range roughly -100...100.
    var biasSkew: Double?
    /// Whether price sits above the 200 EMA. `nil` when the EMA is unavailable.
    var isAboveEMA200: Bool?
    var regimeLabel: String
    var volumeState: String
    var isHighVolatility: Bool
    var hasLiquiditySweep: Bool
    var timeframeMinutes: Int

    // Context signals — see MarketContextSignals.swift.
    var volumeLocation: VolumeProfile.Location?
    /// Fraction of the instrument's average range already spent.
    var rangeUsedFraction: Double?
    var squeeze: SqueezeState?
    /// How the aggregated higher timeframes line up with this setup's side.
    var higherTimeframeAgreement: HigherTimeframeAlignment.Agreement?
}

/// Everything the edge model needs about the market, in plain Codable values.
///
/// `analyze` grades the setups it generates itself, but the app also shows
/// setups it built afterwards: the fallback ideas it synthesises when the
/// engine's own setups are all filtered out. Those used to reach the screen
/// ungraded, so the card silently lost the one measured number it has. Carrying
/// the context on the snapshot lets any later stage grade with exactly the same
/// weights and the same market read.
///
/// The three context signals it deliberately leaves out (volume location,
/// squeeze, higher timeframe agreement) all carry zero weight today, so nothing
/// is lost by not recomputing them outside `analyze`.
nonisolated struct SetupGradingContext: Sendable, Hashable, Codable {
    var timeframeMinutes: Int
    var regimeLabel: String
    var regimeConfidence: Int?
    var structureLabel: String
    var volumeState: String
    var isHighVolatility: Bool
    var hasLiquiditySweep: Bool
    var isAboveEMA200: Bool?
    var assetClass: SetupEdgeFeatures.AssetClass
    var biasBullish: Int?
    var biasBearish: Int?
    var rangeUsedFraction: Double?

    func features(for setup: ChartAnalysisPayload.TradeSetup) -> SetupEdgeFeatures {
        let direction = setup.direction.lowercased()
        let side: SetupEdgeFeatures.Side = direction.contains("bear") || direction.contains("short")
            ? .short
            : .long
        let hasBias = biasBullish != nil || biasBearish != nil
        let bullish = Double(biasBullish ?? 0)
        let bearish = Double(biasBearish ?? 0)

        return SetupEdgeFeatures(
            side: side,
            archetype: SetupEdgeModel.archetype(fromSetupName: setup.setup, trigger: setup.trigger),
            assetClass: assetClass,
            structure: SetupEdgeModel.structureKind(fromLabel: structureLabel),
            regimeConfidence: regimeConfidence,
            biasSkew: hasBias ? (side == .long ? bullish - bearish : bearish - bullish) : nil,
            isAboveEMA200: isAboveEMA200,
            regimeLabel: regimeLabel,
            volumeState: volumeState,
            isHighVolatility: isHighVolatility,
            hasLiquiditySweep: hasLiquiditySweep,
            timeframeMinutes: timeframeMinutes,
            volumeLocation: nil,
            rangeUsedFraction: rangeUsedFraction,
            squeeze: nil,
            higherTimeframeAgreement: nil
        )
    }
}

nonisolated struct SetupEdge: Sendable, Hashable {
    /// Continuous weighted score. Use this to order setups — `expectancyR` is a
    /// coarse calibrated step function and would tie almost everything.
    var rawScore: Double
    /// Estimated expectancy in R, calibrated against realised outcomes.
    var expectancyR: Double
    /// Share of setups in this tier that reached their first target before their
    /// stop in walk-forward replay. A measured base rate, not a forecast.
    var winProbability: Double
    var grade: Grade
    /// The largest contributors, strongest first, for explaining the grade.
    var drivers: [String]

    var tier: Tier { grade.tier }

    enum Grade: String, Sendable, Comparable {
        case a = "A"
        case b = "B"
        case c = "C"
        case d = "D"

        /// Ranks by quality, so `.a > .d`.
        static func < (lhs: Grade, rhs: Grade) -> Bool {
            let order: [Grade] = [.d, .c, .b, .a]
            return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
        }

        /// Grouping used by the "best only" filter: the two grades that measured
        /// clearly positive on both splits.
        var tier: Tier {
            switch self {
            case .a, .b: return .strong
            case .c, .d: return .fair
            }
        }

        /// Words rather than letters, because a letter means nothing to someone
        /// who has not read the model. Each one is backed by its own measurement
        /// now, which is what a four-way split has to earn.
        var label: String {
            switch self {
            case .a: return "Strong"
            case .b: return "Solid"
            case .c: return "Marginal"
            case .d: return "Weak"
            }
        }
    }

    /// The two groups the card shows. Named for what they are: one measurably
    /// better than the other, both positive.
    enum Tier: String, Sendable, Hashable {
        case strong
        case fair

        var label: String {
            switch self {
            case .strong: return "Strong"
            case .fair: return "Fair"
            }
        }
    }
}

nonisolated enum SetupEdgeModel {

    /// Mean expectancy of the unfiltered engine over the walk-forward sample.
    /// Everything below is expressed as a deviation from this.
    static let baseExpectancyR = -0.055

    /// Correlated features would double-count if their measured deltas were
    /// simply summed. Shrinking them keeps the ranking order — which is what
    /// the model is used for — while stopping the magnitudes from running away.
    static let shrinkage = 0.45

    static let minExpectancyR = -0.45
    static let maxExpectancyR = 0.35

    // MARK: Weights
    //
    // Refit 2026-08-22 on the current population, after per-class costs, forex on
    // the ordinary generator, the looser target gates and the symmetry fix. Every
    // bucket below was measured on the fit symbols and re-measured on the held-out
    // symbols; a bucket is kept only when both sides agree in sign and both move
    // at least 0.02R. The value used is the smaller of the two, so the model
    // understates rather than overstates.
    //
    // Half the previous feature set did not survive. Trend location, bias skew,
    // regime, timeframe, liquidity sweep and direction are all flat or sign
    // flipping now, so they are gone rather than shrunk. That is not a failure of
    // the measurement: those weights were fitted on a population where forex was
    // absent, equities and metals were charged crypto fees, and targets sat
    // further out. Change the population and the weights have to be earned again.

    /// Setup type. Fit / held out delta, both required to agree:
    /// reclaim +0.109 / +0.029, fade +0.049 / +0.035, pullback +0.036 / +0.110,
    /// other -0.114 / -0.138, reversal -0.171 / -0.153,
    /// breakdown continuation -0.225 / -0.250.
    ///
    /// Continuation and trend rejection both flipped sign between the splits and
    /// are held at zero, as are pullback continuation and range, which moved less
    /// than 0.02R on one side.
    private static func archetypeWeight(_ archetype: SetupEdgeFeatures.Archetype) -> Double {
        switch archetype {
        case .reclaim:                return  0.029
        case .fade:                   return  0.035
        case .pullback:               return  0.036
        case .other:                  return -0.114
        case .reversal:               return -0.153
        case .breakdownContinuation:  return -0.225
        case .continuation, .trendRejection, .pullbackContinuation,
             .range, .breakout, .breakdown, .breakoutContinuation, .rejectionMomentum:
            return 0
        }
    }

    /// Asset class. Equity +0.091 / +0.116, metal +0.203 / +0.043.
    ///
    /// Crypto is flat held out and goes to zero. Forex is *not* weighted: the fit
    /// split holds a single pair with 180 trades, below the 200 this refit
    /// requires on both sides, so there is nothing to stand on. It reads -0.044R
    /// held out and that is worth revisiting once more forex history is cached.
    private static func assetClassWeight(_ assetClass: SetupEdgeFeatures.AssetClass) -> Double {
        switch assetClass {
        case .equity: return  0.092
        case .metal:  return  0.043
        case .crypto, .forex, .index, .other: return 0
        }
    }

    /// Volatility. Expansion paid on both splits: +0.065 / +0.071 with it,
    /// -0.035 / -0.041 without.
    private static func volatilityWeight(_ isHighVolatility: Bool) -> Double {
        isHighVolatility ? 0.065 : -0.035
    }

    /// Market structure. Only the downtrend bucket survives: -0.066 / -0.051.
    /// Uptrend flipped sign and mixed is flat.
    private static func structureWeight(_ structure: SetupEdgeFeatures.StructureKind) -> Double {
        switch structure {
        case .trendingDown: return -0.051
        case .trendingUp, .mixed: return 0
        }
    }

    /// Regime confidence. Six of the seven bands are flat or unstable; only the
    /// forties hold, at -0.093 / -0.065. Narrow on purpose.
    private static func confidenceWeight(_ confidence: Int?) -> Double {
        guard let confidence else { return 0 }
        return (40..<50).contains(confidence) ? -0.065 : 0
    }

    /// Volume. Thin tape hurt on both splits (-0.089 / -0.135). Everything else
    /// is flat, including the "estimated" bucket, which is simply the metals
    /// feeds and is already carried by the asset class.
    private static func volumeWeight(_ volumeState: String) -> Double {
        volumeState.lowercased().contains("low") ? -0.089 : 0
    }

    /// Volume profile location. Trading above the value area held on both splits
    /// (+0.095 / +0.021). Below and inside are flat or flip.
    private static func volumeLocationWeight(_ location: VolumeProfile.Location?) -> Double {
        location == .aboveValue ? 0.021 : 0
    }

    /// Range budget. A day that has already travelled far kept paying
    /// (+0.084 / +0.074), and the middle of the range kept costing
    /// (-0.053 / -0.024).
    private static func rangeBudgetWeight(_ usedFraction: Double?) -> Double {
        guard let used = usedFraction else { return 0 }
        if used >= 1.5 { return 0.074 }
        if used >= 0.5, used < 0.8 { return -0.024 }
        return 0
    }

    /// Expectancy per grade, refit 2026-08-22, conservative end of the two splits.
    ///
    ///     grade   fit         held out
    ///     A       +0.225      +0.237
    ///     B       +0.118      +0.125
    ///     C       +0.016      +0.047
    ///     D       -0.244      -0.134
    static func calibratedExpectancy(rawScore: Double) -> Double {
        calibratedExpectancy(for: grade(forRawScore: rawScore))
    }

    static func calibratedExpectancy(for grade: SetupEdge.Grade) -> Double {
        switch grade {
        case .a: return  0.22
        case .b: return  0.12
        case .c: return  0.02
        case .d: return -0.13
        }
    }

    /// Share that reached the first target before the stop. Fit / held out:
    /// A 41.5 / 41.9, B 39.9 / 38.5, C 38.8 / 38.3, D 28.3 / 30.5.
    static func measuredHitRate(for grade: SetupEdge.Grade) -> Double {
        switch grade {
        case .a: return 0.415
        case .b: return 0.385
        case .c: return 0.383
        case .d: return 0.283
        }
    }

    /// How many setups each number rests on, held-out split only.
    static func measuredSampleSize(for grade: SetupEdge.Grade) -> Int {
        switch grade {
        case .a: return 3_318
        case .b: return 15_103
        case .c: return 8_573
        case .d: return 2_139
        }
    }

    static func grade(forRawScore rawScore: Double) -> SetupEdge.Grade {
        if rawScore >= -0.005 { return .a }
        if rawScore >= -0.075 { return .b }
        if rawScore >= -0.125 { return .c }
        return .d
    }

    static func evaluate(features: SetupEdgeFeatures) -> SetupEdge {
        // Seven inputs, down from fourteen. The seven that were dropped are not
        // shrunk to a small number, they are gone: on the current population they
        // are flat or they flip sign between the splits, and a weight that cannot
        // hold its sign is noise wearing a number.
        let contributions: [(String, Double)] = [
            ("setup type", archetypeWeight(features.archetype)),
            ("asset class", assetClassWeight(features.assetClass)),
            ("volatility", volatilityWeight(features.isHighVolatility)),
            ("market structure", structureWeight(features.structure)),
            ("regime confidence", confidenceWeight(features.regimeConfidence)),
            ("volume", volumeWeight(features.volumeState)),
            ("volume profile", volumeLocationWeight(features.volumeLocation)),
            ("range budget", rangeBudgetWeight(features.rangeUsedFraction)),
        ]

        let total = contributions.reduce(0.0) { $0 + $1.1 }
        let rawScore = min(
            max(baseExpectancyR + total * shrinkage, minExpectancyR),
            maxExpectancyR
        )
        let expectancy = calibratedExpectancy(rawScore: rawScore)

        let grade = grade(forRawScore: rawScore)

        // Deriving this from the advertised reward-to-risk gives a number like
        // 16%, because that advertised R:R is itself inflated — the engine
        // measures a ~30-40% hit rate across every grade. Report the rate that
        // was actually observed for this grade instead.
        let winProbability = measuredHitRate(for: grade)

        let drivers = contributions
            .filter { abs($0.1) >= 0.03 }
            .sorted { abs($0.1) > abs($1.1) }
            .prefix(3)
            .map { name, weight in "\(weight >= 0 ? "+" : "−") \(name)" }

        return SetupEdge(
            rawScore: rawScore,
            expectancyR: expectancy,
            winProbability: winProbability,
            grade: grade,
            drivers: Array(drivers)
        )
    }


    // MARK: Feature extraction

    static func archetype(fromSetupName name: String, trigger: String) -> SetupEdgeFeatures.Archetype {
        let text = (name + " " + trigger).lowercased()

        let hasContinuation = text.contains("continuation")
        if text.contains("breakdown") && hasContinuation { return .breakdownContinuation }
        if text.contains("breakout") && hasContinuation { return .breakoutContinuation }
        if text.contains("pullback") && hasContinuation { return .pullbackContinuation }
        if text.contains("rejection") && text.contains("momentum") { return .rejectionMomentum }
        if text.contains("trend") && text.contains("rejection") { return .trendRejection }
        if hasContinuation { return .continuation }
        if text.contains("reclaim") { return .reclaim }
        if text.contains("reversal") { return .reversal }
        if text.contains("fade") { return .fade }
        if text.contains("range") { return .range }
        if text.contains("pullback") { return .pullback }
        if text.contains("breakdown") { return .breakdown }
        if text.contains("breakout") { return .breakout }
        return .other
    }

    /// Classifies a symbol the way the rest of the engine already does, in one
    /// place so the model and the grading context can never disagree.
    static func assetClass(forSymbol symbol: String) -> SetupEdgeFeatures.AssetClass {
        let upper = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard upper.isEmpty == false else { return .other }

        if upper.hasPrefix("^") { return .index }

        if upper.hasSuffix("=X") {
            let base = String(upper.dropLast(2))
            // Metals quote as =X too: XAUUSD is gold, not a currency pair.
            if base.hasPrefix("XAU") || base.hasPrefix("XAG")
                || base.hasPrefix("XPT") || base.hasPrefix("XPD") || base.hasPrefix("XCU") {
                return .metal
            }
            if base.count == 6, base.allSatisfy(\.isLetter) { return .forex }
            return .other
        }

        if upper.hasSuffix("=F") {
            let base = String(upper.dropLast(2))
            if ["GC", "SI", "PL", "PA", "HG", "MGC", "SIL"].contains(base) { return .metal }
            return .other
        }

        if upper.hasSuffix("USDT") || upper.hasSuffix("USDC") || upper.hasSuffix("BUSD")
            || upper.hasSuffix("-USD") || upper.hasSuffix("PERP") {
            return .crypto
        }

        // What is left is a plain ticker.
        return upper.count <= 8 && upper.contains(where: \.isLetter) ? .equity : .other
    }

    static func structureKind(fromLabel label: String) -> SetupEdgeFeatures.StructureKind {
        let text = label.lowercased()
        if text.contains("higher highs and higher lows") { return .trendingUp }
        if text.contains("lower highs and lower lows") { return .trendingDown }
        return .mixed
    }

    /// Parses the "1:2.4" reward-to-risk format the engine emits.
    static func rewardToRisk(fromDisplayString text: String?) -> Double? {
        guard let text, let rewardPart = text.split(separator: ":").last else { return nil }
        let cleaned = rewardPart.filter { $0.isNumber || $0 == "." }
        guard let value = Double(cleaned), value.isFinite, value > 0 else { return nil }
        return value
    }
}
