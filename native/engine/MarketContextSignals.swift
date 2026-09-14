import Foundation

// ============================================================================
// MarketContextSignals
//
// Context the analysis engine did not previously compute: where price sits in
// the traded volume distribution, how much of the day's usual range is already
// spent, whether volatility is coiled or expanding, and what the higher
// timeframes are doing.
//
// Everything here is derived from the candles the engine already has. The
// higher-timeframe read in particular is built by aggregating the base series
// rather than fetching more data, so it works identically in the app and in
// offline replay, costs no network, and cannot silently disagree with the
// candles the rest of the analysis ran on.
//
// Each signal is measured for incremental edge before it earns a weight in
// `SetupEdgeModel` — see tools/ENGINE_EVAL.md.
// ============================================================================

// MARK: - Volume profile

/// Where price sits inside the distribution of traded volume, rather than
/// inside a simple high/low range. The point of control and value area tend to
/// act as magnets and as genuine support/resistance, which raw swing levels miss.
nonisolated struct VolumeProfile: Hashable, Sendable {
    /// Price level that traded the most volume.
    let pointOfControl: Double
    /// Upper bound of the value area (the band holding ~70% of volume).
    let valueAreaHigh: Double
    /// Lower bound of the value area.
    let valueAreaLow: Double

    enum Location: String, Sendable {
        case aboveValue
        case insideValue
        case belowValue
    }

    func location(of price: Double) -> Location {
        if price > valueAreaHigh { return .aboveValue }
        if price < valueAreaLow { return .belowValue }
        return .insideValue
    }

    /// Distance from price to the point of control, in ATR.
    func distanceToPOC(from price: Double, atr: Double?) -> Double? {
        guard let atr, atr > 0 else { return nil }
        return abs(price - pointOfControl) / atr
    }
}

// MARK: - Range budget

/// How much of the instrument's usual range is already spent.
///
/// A breakout that fires after the average range is already exhausted has far
/// less room left than the same breakout early in the session.
nonisolated struct RangeBudget: Hashable, Sendable {
    /// Average range of one "day" bucket over the lookback.
    let averageRange: Double
    /// Range travelled in the current bucket.
    let currentRange: Double

    /// Fraction of the average range already used, e.g. 1.2 means today has
    /// already travelled 120% of a normal day.
    var usedFraction: Double {
        guard averageRange > 0 else { return 0 }
        return currentRange / averageRange
    }
}

// MARK: - Volatility compression

/// Bollinger-inside-Keltner compression, and the release that follows it.
///
/// Compression says a move is being stored up; the release says it has started.
/// The engine previously had no notion of either.
nonisolated struct SqueezeState: Hashable, Sendable {
    /// Bollinger bands sit fully inside the Keltner channel.
    let isSqueezed: Bool
    /// Was squeezed on a recent bar and is no longer: expansion just began.
    let didJustRelease: Bool
    /// Consecutive bars currently in compression.
    let squeezeLength: Int
}

// MARK: - Higher timeframe alignment

/// A trend read on a coarser timeframe, derived by aggregating the base series.
nonisolated struct HigherTimeframeRead: Hashable, Sendable {
    enum Direction: String, Sendable { case bullish, bearish, neutral }

    /// How many base candles were folded into one higher-timeframe candle.
    let factor: Int
    let direction: Direction
    /// Fraction of higher-timeframe checks that agreed, 0...1.
    let strength: Double
}

nonisolated struct HigherTimeframeAlignment: Hashable, Sendable {
    let reads: [HigherTimeframeRead]

    enum Agreement: String, Sendable {
        /// Every higher timeframe points the same way.
        case aligned
        /// Higher timeframes disagree with each other.
        case mixed
        /// Every higher timeframe points the other way.
        case opposed
    }

    /// How the higher timeframes line up with a given direction.
    func agreement(with side: HigherTimeframeRead.Direction) -> Agreement {
        let directional = reads.filter { $0.direction != .neutral }
        guard directional.isEmpty == false else { return .mixed }

        let agreeing = directional.filter { $0.direction == side }.count
        if agreeing == directional.count { return .aligned }
        if agreeing == 0 { return .opposed }
        return .mixed
    }
}

// MARK: - Computation

nonisolated enum MarketContextSignals {

    // MARK: Volume profile

    /// Builds a volume-at-price histogram over the lookback and extracts the
    /// point of control and the value area.
    ///
    /// Returns `nil` when volume is absent or synthetic (several FX and index
    /// feeds report zero), because a profile built on fabricated volume would
    /// be worse than no profile at all.
    static func volumeProfile(candles: [Candle], lookback: Int = 200, binCount: Int = 60) -> VolumeProfile? {
        let window = Array(candles.suffix(lookback))
        guard window.count >= 40 else { return nil }

        let totalVolume = window.reduce(0.0) { $0 + $1.volume }
        guard totalVolume > 0 else { return nil }

        let high = window.map(\.high).max() ?? 0
        let low = window.map(\.low).min() ?? 0
        guard high > low, high.isFinite, low.isFinite else { return nil }

        let binWidth = (high - low) / Double(binCount)
        guard binWidth > 0 else { return nil }

        // Spread each candle's volume across the bins its range covers, so a
        // wide bar does not dump all its volume onto a single price.
        var bins = [Double](repeating: 0, count: binCount)
        for candle in window {
            // Feeds do send malformed bars. A non-finite price would trap in
            // `Int(_:)`, and a bar whose high sits below its low used to produce
            // an inverted range and crash the whole analysis.
            guard candle.low.isFinite, candle.high.isFinite, candle.volume.isFinite else { continue }

            let lowerPrice = min(candle.low, candle.high)
            let upperPrice = max(candle.low, candle.high)
            let firstIndex = max(0, min(binCount - 1, Int((lowerPrice - low) / binWidth)))
            let lastIndex = max(0, min(binCount - 1, Int((upperPrice - low) / binWidth)))
            let spanCount = max(1, lastIndex - firstIndex + 1)
            let share = candle.volume / Double(spanCount)
            for index in firstIndex...lastIndex {
                bins[index] += share
            }
        }

        guard let pocIndex = bins.indices.max(by: { bins[$0] < bins[$1] }) else { return nil }

        // Grow outward from the point of control until 70% of volume is covered.
        let target = totalVolume * 0.70
        var covered = bins[pocIndex]
        var lowerIndex = pocIndex
        var upperIndex = pocIndex

        while covered < target, lowerIndex > 0 || upperIndex < binCount - 1 {
            let below = lowerIndex > 0 ? bins[lowerIndex - 1] : -1
            let above = upperIndex < binCount - 1 ? bins[upperIndex + 1] : -1
            if above >= below {
                upperIndex += 1
                covered += bins[upperIndex]
            } else {
                lowerIndex -= 1
                covered += bins[lowerIndex]
            }
        }

        return VolumeProfile(
            pointOfControl: low + (Double(pocIndex) + 0.5) * binWidth,
            valueAreaHigh: low + Double(upperIndex + 1) * binWidth,
            valueAreaLow: low + Double(lowerIndex) * binWidth
        )
    }

    // MARK: Range budget

    /// Groups the series into day-sized buckets and compares the current
    /// bucket's range with the recent average.
    ///
    /// `barsPerDay` is derived from the timeframe. On daily and slower series
    /// this degrades to a simple range-vs-average-range comparison.
    static func rangeBudget(candles: [Candle], barsPerDay: Int, lookbackDays: Int = 14) -> RangeBudget? {
        let bars = max(1, barsPerDay)
        guard candles.count >= bars * 3 else { return nil }

        var ranges: [Double] = []
        var index = candles.count
        while index > 0, ranges.count <= lookbackDays {
            let start = max(0, index - bars)
            let bucket = candles[start..<index]
            if let high = bucket.map(\.high).max(), let low = bucket.map(\.low).min(), high > low {
                ranges.append(high - low)
            }
            index = start
        }

        guard let current = ranges.first, ranges.count >= 3 else { return nil }
        let history = Array(ranges.dropFirst())
        let average = history.reduce(0, +) / Double(history.count)
        guard average > 0 else { return nil }

        return RangeBudget(averageRange: average, currentRange: current)
    }

    static func barsPerDay(timeframeMinutes: Int) -> Int {
        guard timeframeMinutes > 0 else { return 1 }
        return max(1, 1440 / timeframeMinutes)
    }

    // MARK: Squeeze

    static func squeezeState(
        candles: [Candle],
        period: Int = 20,
        bollingerMultiplier: Double = 2.0,
        keltnerMultiplier: Double = 1.5,
        releaseLookback: Int = 5
    ) -> SqueezeState? {
        guard candles.count >= period + releaseLookback + 1 else { return nil }

        /// Whether the Bollinger band sits inside the Keltner channel at `end`.
        func isSqueezed(endingAt end: Int) -> Bool? {
            guard end >= period else { return nil }
            let window = Array(candles[(end - period)..<end])
            let closes = window.map(\.close)

            let mean = closes.reduce(0, +) / Double(closes.count)
            let variance = closes.reduce(0.0) { $0 + ($1 - mean) * ($1 - mean) } / Double(closes.count)
            let standardDeviation = variance.squareRoot()

            var trueRanges: [Double] = []
            trueRanges.reserveCapacity(window.count)
            for (offset, candle) in window.enumerated() {
                let previousClose = offset == 0 ? candle.close : window[offset - 1].close
                trueRanges.append(max(
                    candle.high - candle.low,
                    max(abs(candle.high - previousClose), abs(candle.low - previousClose))
                ))
            }
            let averageTrueRange = trueRanges.reduce(0, +) / Double(trueRanges.count)
            guard averageTrueRange > 0, standardDeviation.isFinite else { return nil }

            return (bollingerMultiplier * standardDeviation) < (keltnerMultiplier * averageTrueRange)
        }

        guard let currentlySqueezed = isSqueezed(endingAt: candles.count) else { return nil }

        var length = 0
        var cursor = candles.count
        while let squeezed = isSqueezed(endingAt: cursor), squeezed {
            length += 1
            cursor -= 1
        }

        var didJustRelease = false
        if currentlySqueezed == false {
            for back in 1...releaseLookback {
                if let squeezed = isSqueezed(endingAt: candles.count - back), squeezed {
                    didJustRelease = true
                    break
                }
            }
        }

        return SqueezeState(
            isSqueezed: currentlySqueezed,
            didJustRelease: didJustRelease,
            squeezeLength: length
        )
    }

    // MARK: Higher timeframe

    /// Folds `factor` base candles into one, oldest-aligned so the most recent
    /// bucket stays the partially-formed one.
    static func aggregate(candles: [Candle], factor: Int) -> [Candle] {
        guard factor > 1, candles.count >= factor else { return candles }

        var out: [Candle] = []
        out.reserveCapacity(candles.count / factor)

        // Align to the end so the newest candle always closes a bucket.
        let remainder = candles.count % factor
        var index = remainder

        while index + factor <= candles.count {
            let bucket = candles[index..<(index + factor)]
            guard let first = bucket.first, let last = bucket.last else { break }
            out.append(Candle(
                openTime: first.openTime,
                open: first.open,
                high: bucket.map(\.high).max() ?? first.high,
                low: bucket.map(\.low).min() ?? first.low,
                close: last.close,
                volume: bucket.reduce(0.0) { $0 + $1.volume }
            ))
            index += factor
        }

        return out
    }

    /// Reads trend direction on each higher timeframe built from the base series.
    ///
    /// Direction combines three independent checks — price versus a slow moving
    /// average, moving-average stack, and swing structure — and `strength`
    /// reports how many agreed, so a marginal read can be told from a clear one.
    static func higherTimeframeAlignment(
        candles: [Candle],
        factors: [Int] = [4, 24]
    ) -> HigherTimeframeAlignment {
        var reads: [HigherTimeframeRead] = []

        for factor in factors {
            let aggregated = aggregate(candles: candles, factor: factor)
            guard aggregated.count >= 55, let last = aggregated.last else { continue }

            let closes = aggregated.map(\.close)

            func simpleMovingAverage(_ period: Int) -> Double? {
                guard closes.count >= period else { return nil }
                let window = closes.suffix(period)
                return window.reduce(0, +) / Double(window.count)
            }

            var bullishVotes = 0
            var totalVotes = 0

            if let slow = simpleMovingAverage(50) {
                totalVotes += 1
                if last.close > slow { bullishVotes += 1 }
            }

            if let fast = simpleMovingAverage(20), let slow = simpleMovingAverage(50) {
                totalVotes += 1
                if fast > slow { bullishVotes += 1 }
            }

            // Swing structure: compare the last two halves of a short window.
            if aggregated.count >= 20 {
                let recent = aggregated.suffix(10)
                let prior = aggregated.suffix(20).prefix(10)
                let recentHigh = recent.map(\.high).max() ?? 0
                let recentLow = recent.map(\.low).min() ?? 0
                let priorHigh = prior.map(\.high).max() ?? 0
                let priorLow = prior.map(\.low).min() ?? 0
                totalVotes += 1
                if recentHigh > priorHigh && recentLow > priorLow { bullishVotes += 1 }
            }

            guard totalVotes > 0 else { continue }

            let bullishShare = Double(bullishVotes) / Double(totalVotes)
            let direction: HigherTimeframeRead.Direction
            if bullishShare >= 0.67 {
                direction = .bullish
            } else if bullishShare <= 0.33 {
                direction = .bearish
            } else {
                direction = .neutral
            }

            reads.append(HigherTimeframeRead(
                factor: factor,
                direction: direction,
                strength: max(bullishShare, 1 - bullishShare)
            ))
        }

        return HigherTimeframeAlignment(reads: reads)
    }
}
