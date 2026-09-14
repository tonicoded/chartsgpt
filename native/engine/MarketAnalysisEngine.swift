import Foundation

nonisolated enum MarketAnalysisMode: Sendable, Equatable {
    case live
    case backtest
}

nonisolated struct IndicatorSelection: Hashable, Sendable, Codable {
    enum Key: String, CaseIterable, Identifiable, Sendable, Codable {
        case emaTrend
        case rsi
        case bollingerBands
        case macd
        case fibonacci
        case adx
        case volume

        var id: String { rawValue }

        var title: String {
            switch self {
            case .emaTrend: return "EMA trend"
            case .rsi: return "RSI"
            case .bollingerBands: return "Bollinger Bands"
            case .macd: return "MACD"
            case .fibonacci: return "Fibonacci"
            case .adx: return "ADX"
            case .volume: return "Volume filter"
            }
        }
    }

    var emaTrend: Bool = true
    var rsi: Bool = true
    var bollingerBands: Bool = true
    var macd: Bool = true
    var fibonacci: Bool = true
    var adx: Bool = true
    var volume: Bool = true

    nonisolated static let allEnabled = IndicatorSelection()

    func isEnabled(_ key: Key) -> Bool {
        switch key {
        case .emaTrend: return emaTrend
        case .rsi: return rsi
        case .bollingerBands: return bollingerBands
        case .macd: return macd
        case .fibonacci: return fibonacci
        case .adx: return adx
        case .volume: return volume
        }
    }

    mutating func set(_ key: Key, enabled: Bool) {
        switch key {
        case .emaTrend: emaTrend = enabled
        case .rsi: rsi = enabled
        case .bollingerBands: bollingerBands = enabled
        case .macd: macd = enabled
        case .fibonacci: fibonacci = enabled
        case .adx: adx = enabled
        case .volume: volume = enabled
        }
    }

    func disabling(_ key: Key) -> IndicatorSelection {
        var copy = self
        copy.set(key, enabled: false)
        return copy
    }
}

nonisolated struct MarketSnapshot: Hashable, Sendable, Codable {
    let exchange: String
    let symbol: String
    let timeframe: String
    let candleCount: Int
    let start: Date
    let end: Date
    let lastClose: Double
    let changePct: Double?
    let marketRegime: String
    let marketStructure: String
    let regimeConfidence: Int?
    let signal: String
    let riskLevel: String
    let volumeState: String
    let summary: String
    let indicators: [String]
    let confluence: [String]
    let fibLevels: [String]
    let supportResistance: [ChartAnalysisPayload.KeyLevel]
    let scenarios: [ChartAnalysisPayload.Scenario]
    let targets: ChartAnalysisPayload.TimeHorizonTargets
    let tradeSetups: [ChartAnalysisPayload.TradeSetup]
    let bias: ChartAnalysisPayload.Bias?
    let riskNotes: [String]
    let news: MarketNewsDigest?
    let macroCalendar: MacroCalendarDigest?
    let derivatives: DerivativesDigest?
    let fearGreed: FearGreedData?
    /// What the edge model needs to grade a setup that was built after this
    /// snapshot. Nil for snapshots decoded from history written before it
    /// existed. See `SetupGradingContext`.
    var gradingContext: SetupGradingContext?
}

nonisolated struct FearGreedData: Hashable, Sendable, Codable {
    let value: Int
    let classification: String
    let source: String
}

nonisolated enum MarketAnalysisEngine {
    /// Whether forex gets its own generator and its own narrowed level set.
    /// Off: see the note on `fxDedicatedSetups`.
    static let fxUsesDedicatedStrategy = false

    private enum TimeframeKind {
        case intraday
        case daily
        case weekly
        case monthly
    }

    /// Leading multiplier of a timeframe token: "15m" -> 15, "mo" -> 1.
    private static func timeframeCount(_ raw: String, droppingLast suffixLength: Int) -> Int? {
        let head = raw.dropLast(suffixLength)
        if head.isEmpty { return 1 }
        guard let value = Int(head), value > 0 else { return nil }
        return value
    }

    /// Minutes a timeframe string represents, or nil when it can't be parsed.
    ///
    /// The `M` suffix is the trap here. Binance spells one month `1M`, but chart
    /// UIs, OCR and the vision model all write minutes with an uppercase M too
    /// (`5M`, `15M`, `30M`). Reading those as months made a 15-minute scan get
    /// analysed as a 15-month chart: monthly swing radius, monthly stop floors,
    /// Position horizons, all on top of 15-minute candles. So only the exact
    /// single-month spellings mean months; every other `M` is minutes.
    private static func timeframeMinutes(from timeframe: String) -> Int? {
        let trimmed = timeframe.trimmingCharacters(in: .whitespacesAndNewlines)
        let raw = trimmed.lowercased()
        guard raw.isEmpty == false else { return nil }

        // Month spellings first: "1month" also ends in "h", "1mon" in "n".
        if raw.hasSuffix("month"), let v = timeframeCount(raw, droppingLast: 5) { return v * 43200 }
        if raw.hasSuffix("mon"), let v = timeframeCount(raw, droppingLast: 3) { return v * 43200 }
        if raw.hasSuffix("mo"), let v = timeframeCount(raw, droppingLast: 2) { return v * 43200 }
        // Binance's own monthly spelling, kept case-sensitive on purpose.
        if trimmed == "1M" { return 43200 }

        if raw.hasSuffix("wk"), let v = timeframeCount(raw, droppingLast: 2) { return v * 10080 }
        if raw.hasSuffix("m"), let v = timeframeCount(raw, droppingLast: 1) { return v }
        if raw.hasSuffix("h"), let v = timeframeCount(raw, droppingLast: 1) { return v * 60 }
        if raw.hasSuffix("d"), let v = timeframeCount(raw, droppingLast: 1) { return v * 1440 }
        if raw.hasSuffix("w"), let v = timeframeCount(raw, droppingLast: 1) { return v * 10080 }
        return nil
    }

    private static func timeframeKind(from timeframe: String) -> TimeframeKind {
        // Derived from the parsed length so the kind can never disagree with the
        // minutes: those two drifting apart is what caused the 15M/15m mix-up.
        guard let minutes = timeframeMinutes(from: timeframe) else { return .intraday }
        if minutes >= 43200 { return .monthly }
        if minutes >= 10080 { return .weekly }
        if minutes >= 1440 { return .daily }
        return .intraday
    }

    static func analyze(
        exchange: String,
        symbol: String,
        timeframe: String,
        candles: [Candle],
        indicatorSelection: IndicatorSelection = .allEnabled,
        newsDigest: MarketNewsDigest? = nil,
        macroDigest: MacroCalendarDigest? = nil,
        derivativesDigest: DerivativesDigest? = nil,
        fearGreed: FearGreedData? = nil,
        mode: MarketAnalysisMode = .live
    ) -> MarketSnapshot {
        let tfKind = timeframeKind(from: timeframe)
        let closes = candles.map(\.close)
        let highs = candles.map(\.high)
        let lows = candles.map(\.low)
        let volumes = candles.map(\.volume)

        let ema20Raw = ema(values: closes, period: 20).last
        let ema50Raw = ema(values: closes, period: 50).last
        let ema200Raw = ema(values: closes, period: 200).last
        let rsi14Raw = rsi(closes: closes, period: 14).last
        let atr14 = atr(candles: candles, period: 14).last
        let macdPackRaw = macd(closes: closes)
        let macdPack = indicatorSelection.macd ? macdPackRaw : (macd: [], signal: [], histogram: [])
        let macdLast = macdPack.macd.last
        let macdSignalLast = macdPack.signal.last
        let macdHistLast = macdPack.histogram.last
        let bollingerRaw = bollingerBands(closes: closes, period: 20, stdevMultiplier: 2.0)
        let bollinger = indicatorSelection.bollingerBands
            ? bollingerRaw
            : BollingerPack(middle: nil, upper: nil, lower: nil, widthPct: nil)
        let stoch = stochasticOscillator(candles: candles, period: 14, smoothing: 3)
        let adxPackRaw = adx(candles: candles, period: 14)
        let adxPack = indicatorSelection.adx
            ? adxPackRaw
            : ADXPack(adx: nil, plusDI: nil, minusDI: nil)
        let obvPack = obv(candles: candles, lookback: 20)
        let roc14 = roc(values: closes, period: 14).last
        let atrPctHistory = atrPctSeries(candles: candles, period: 14)
        let volatilityRegime = volatilityRegimeLabel(currentATRpct: atrPctHistory.last, history: atrPctHistory)

        let ema20 = indicatorSelection.emaTrend ? ema20Raw : nil
        let ema50 = indicatorSelection.emaTrend ? ema50Raw : nil
        let ema200 = indicatorSelection.emaTrend ? ema200Raw : nil
        let rsi14 = indicatorSelection.rsi ? rsi14Raw : nil

        let lastClose = candles.last?.close ?? 0
        let changePct: Double?
        if candles.count >= 2, let prev = candles.dropLast().last?.close, prev != 0 {
            changePct = (lastClose - prev) / prev * 100.0
        } else {
            changePct = nil
        }

        let trendStrength = calculateTrendStrength(closes: closes, ema20: ema20, ema50: ema50)
        let volatilityPct = (atr14 != nil && lastClose > 0) ? (atr14! / lastClose * 100.0) : nil
        let (volumeState, volumeNote) = volumeStateLabel(
            exchange: exchange,
            symbol: symbol,
            candles: candles,
            volatilityPct: volatilityPct,
            volatilityRegime: volatilityRegime
        )
        let volumeLastToAvg20: Double? = {
            guard candles.count >= 25 else { return nil }
            let recent20 = candles.suffix(20).map(\.volume)
            let avg = recent20.reduce(0, +) / Double(recent20.count)
            guard avg > 0 else { return nil }
            return candles.last!.volume / avg
        }()

        let structure = inferMarketStructure(highs: highs, lows: lows, timeframeKind: tfKind)
        let (regimeLabel, regimeConfidence) = inferMarketRegime(
            lastClose: lastClose,
            ema20: ema20,
            ema50: ema50,
            ema200: ema200,
            structure: structure,
            trendStrength: trendStrength,
            volatilityPct: volatilityPct,
            rsi14: rsi14,
            macdHistogram: macdHistLast,
            adxValue: adxPack.adx,
            plusDI: adxPack.plusDI,
            minusDI: adxPack.minusDI,
            roc14: roc14
        )

        let (fibLevels, fibKeyLevels, fibExtensionKeyLevels, fibConfluence): (
            [String],
            [ChartAnalysisPayload.KeyLevel],
            [ChartAnalysisPayload.KeyLevel],
            [String]
        ) = {
            guard indicatorSelection.fibonacci else {
                return ([], [], [], [])
            }
            return fibonacciPackage(
                candles: candles,
                currentPrice: lastClose,
                timeframeKind: tfKind
            )
        }()

        let microLevels = deriveMicroLevels(candles: candles, currentPrice: lastClose, timeframeKind: tfKind)
        let pivotLevels = pivotLevels(candles: candles, currentPrice: lastClose)

        let swingPoints = swingPoints(candles: candles, timeframeKind: tfKind)
        let avwap = anchoredVWAPPack(
            candles: candles,
            volumes: volumes,
            currentPrice: lastClose,
            regimeLabel: regimeLabel,
            structure: structure,
            swingPoints: swingPoints
        )
        let regressionChannel = regressionChannelPack(
            closes: closes,
            currentPrice: lastClose,
            timeframeKind: tfKind
        )
        let rsiSeries = rsi(closes: closes, period: 14)
        let divergenceSignals = divergenceSignals(candles: candles, rsiSeries: rsiSeries, swingPoints: swingPoints)

        let isYahooFX = {
            let upper = symbol.uppercased()
            guard upper.hasSuffix("=X") else { return false }
            let base = String(upper.dropLast(2))
            if base.hasPrefix("XAU") || base.hasPrefix("XAG") || base.hasPrefix("XPT") || base.hasPrefix("XPD") || base.hasPrefix("XCU") {
                return false
            }
            return base.count == 6 && base.allSatisfy(\.isLetter)
        }()

        let mergedLevels = mergeKeyLevels(
            baseLevels: deriveSupportResistance(highs: highs, lows: lows, currentPrice: lastClose, timeframeKind: tfKind),
            extraLevels: microLevels + fibKeyLevels + fibExtensionKeyLevels + pivotLevels,
            currentPrice: lastClose
        )

        // Forex used to get its own level set here, narrowed to one support and
        // one resistance on intraday. That is what starved the FX generators:
        // "price is near a level" was almost never true, so every directional
        // branch was skipped. Forex now reads the same levels as everything else.
        let derivedLevels: [ChartAnalysisPayload.KeyLevel] = {
            guard fxUsesDedicatedStrategy, isYahooFX,
                  let atr14,
                  atr14 > 0 else {
                return mergedLevels
            }

            let nearbyWindow: Double
            if let minutes = timeframeMinutes(from: timeframe) {
                switch minutes {
                case 15: nearbyWindow = 2.4
                case 30: nearbyWindow = 3.2
                case 60: nearbyWindow = 3.6
                case 120, 240: nearbyWindow = 4.2
                default: nearbyWindow = 4.6
                }
            } else {
                switch tfKind {
                case .daily: nearbyWindow = 5.2
                case .weekly: nearbyWindow = 6.5
                case .monthly: nearbyWindow = 8.0
                case .intraday: nearbyWindow = 4.2
                }
            }

            let nearby = mergedLevels.filter { level in
                guard let value = Double(level.price) else { return false }
                return abs(value - lastClose) / atr14 <= nearbyWindow
            }

            let nearbySupports = nearby
                .filter { $0.kind == "support" }
                .sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) }
            let nearbyResistances = nearby
                .filter { $0.kind == "resistance" }
                .sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) }
            let allSupports = mergedLevels
                .filter { $0.kind == "support" }
                .sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) }
            let allResistances = mergedLevels
                .filter { $0.kind == "resistance" }
                .sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) }

            let visiblePerSide = tfKind == .intraday ? 1 : 2
            var supports = Array(nearbySupports.suffix(visiblePerSide))
            var resistances = Array(nearbyResistances.prefix(visiblePerSide))

            func nearestUsableLevel(
                _ levels: [ChartAnalysisPayload.KeyLevel],
                isSupport: Bool
            ) -> ChartAnalysisPayload.KeyLevel? {
                let ordered = isSupport ? levels.reversed() : levels
                let relaxedWindow = nearbyWindow * (tfKind == .intraday ? 1.35 : 1.75)
                for level in ordered {
                    guard let value = Double(level.price) else { continue }
                    guard abs(value - lastClose) / atr14 <= relaxedWindow else { continue }
                    return level
                }
                return nil
            }

            let distance = max(
                atr14 * (tfKind == .daily ? 0.9 : (tfKind == .weekly ? 1.1 : (tfKind == .monthly ? 1.4 : 1.0))),
                lastClose >= 20 ? 0.12 : 0.00035
            )
            if supports.isEmpty {
                if let fallback = nearestUsableLevel(allSupports, isSupport: true) {
                    supports.append(fallback)
                } else {
                    let price = formatPrice(max(lastClose - distance, lastClose * 0.000001))
                    supports.append(.init(price: price, kind: "support", note: "ATR downside reference"))
                }
            }
            if resistances.isEmpty {
                if let fallback = nearestUsableLevel(allResistances, isSupport: false) {
                    resistances.append(fallback)
                } else {
                    let price = formatPrice(lastClose + distance)
                    resistances.append(.init(price: price, kind: "resistance", note: "ATR upside reference"))
                }
            }

            let stitched = supports + resistances
            guard stitched.isEmpty == false else { return mergedLevels }
            var seen: Set<String> = []
            return stitched
                .filter { seen.insert("\($0.kind)|\($0.price)").inserted }
                .sorted {
                    (Double($0.price) ?? 0) < (Double($1.price) ?? 0)
                }
        }()

        let structureLayer = marketStructureLayer(
            candles: candles,
            swingPoints: swingPoints,
            levels: derivedLevels,
            atr14: atr14,
            timeframeKind: tfKind
        )
        let regimeProfile = marketRegimeProfile(
            regimeLabel: regimeLabel,
            regimeConfidence: regimeConfidence,
            structure: structure,
            structureLayer: structureLayer,
            trendStrength: trendStrength,
            volatilityPct: volatilityPct,
            volatilityRegime: volatilityRegime,
            adxValue: adxPack.adx,
            plusDI: adxPack.plusDI,
            minusDI: adxPack.minusDI,
            rsi14: rsi14,
            stochK: stoch.k,
            volumeState: volumeState
        )

        var (scenarios, targets) = buildScenariosAndTargets(
            levels: derivedLevels,
            lastPrice: lastClose,
            symbol: symbol,
            timeframe: timeframe
        )
        var tradeSetups = generateTradeSetups(
            symbol: symbol,
            timeframe: timeframe,
            lastCandle: candles.last,
            lastClose: lastClose,
            atr14: atr14,
            volatilityPct: volatilityPct,
            volumeState: volumeState,
            volumeLastToAvg20: volumeLastToAvg20,
            levels: derivedLevels,
            regimeLabel: regimeLabel,
            structure: structure,
            confluence: confluenceForSetups(from: fibConfluence),
            ema20: ema20,
            ema50: ema50,
            ema200: ema200,
            avwapVwap: avwap?.vwap,
            bollingerMiddle: bollinger.middle,
            rsi14: rsi14,
            stochK: stoch.k,
            stochD: stoch.d,
            macdHist: macdHistLast,
            volatilityRegimeLabel: volatilityRegime?.label,
            volatilityRegimePercentile: volatilityRegime?.percentile,
            obvDelta: obvPack.delta,
            roc14Pct: roc14,
            regressionSlopePct: regressionChannel?.slopePctPerBar,
            trendStrength: trendStrength,
            divergenceSignals: divergenceSignals,
            patternSignals: detectDeterministicPatterns(candles: candles, swingPoints: swingPoints),
            structureLayer: structureLayer,
            adx: adxPack,
            useEMAFilter: indicatorSelection.emaTrend,
            useRSIFilter: indicatorSelection.rsi,
            useMACDFilter: indicatorSelection.macd,
            useADXFilter: indicatorSelection.adx,
            useVolumeFilter: indicatorSelection.volume,
            mode: mode
        )
        let (confluence, indicators, bias, riskNotes) = buildSignals(
            regimeLabel: regimeLabel,
            ema20: ema20,
            ema50: ema50,
            ema200: ema200,
            rsi14: rsi14,
            stochK: stoch.k,
            stochD: stoch.d,
            atr14: atr14,
            volatilityPct: volatilityPct,
            volatilityRegime: volatilityRegime,
            trendStrength: trendStrength,
            structure: structure,
            candles: candles,
            levels: derivedLevels,
            fibConfluence: fibConfluence,
            bollinger: bollinger,
            adx: adxPack,
            obv: obvPack,
            avwap: avwap,
            roc14: roc14,
            regressionChannel: regressionChannel,
            divergenceSignals: divergenceSignals,
            structureLayer: structureLayer,
            swingPoints: swingPoints,
            macd: macdLast,
            macdSignal: macdSignalLast,
            macdHist: macdHistLast,
            indicatorSelection: indicatorSelection
        )
        let probabilityLayer = probabilityLayer(
            regimeLabel: regimeLabel,
            regimeProfile: regimeProfile,
            structureLayer: structureLayer,
            bias: bias,
            rsi14: rsi14,
            stochK: stoch.k,
            macdHist: macdHistLast,
            adx: adxPack,
            volumeState: volumeState,
            volatilityRegime: volatilityRegime
        )
        scenarios = applyProbabilityLayer(to: scenarios, probabilityLayer: probabilityLayer)

        tradeSetups = applyLiveSetupFilters(
            setups: tradeSetups,
            symbol: symbol,
            timeframe: timeframe,
            regimeLabel: regimeLabel,
            regimeConfidence: regimeConfidence,
            bias: bias,
            mode: mode
        )
        tradeSetups = applyMarketStructureLayer(
            setups: tradeSetups,
            structureLayer: structureLayer,
            regimeLabel: regimeLabel,
            structure: structure
        )
        // Context signals derived from the same candles the rest of the
        // analysis ran on — no extra fetches, so the app and offline replay
        // cannot disagree. See MarketContextSignals.swift.
        let volumeProfile = MarketContextSignals.volumeProfile(candles: candles)
        let rangeBudget = MarketContextSignals.rangeBudget(
            candles: candles,
            barsPerDay: MarketContextSignals.barsPerDay(
                timeframeMinutes: timeframeMinutes(from: timeframe) ?? 1440
            )
        )
        let squeeze = MarketContextSignals.squeezeState(candles: candles)
        let higherTimeframe = MarketContextSignals.higherTimeframeAlignment(candles: candles)

        // Rank by measured edge before the probability layer runs, so the
        // headline setup is the strongest one rather than the first generated.
        let scoredSetups = applySetupEdgeModel(
            setups: tradeSetups,
            symbol: symbol,
            timeframe: timeframe,
            regimeLabel: regimeLabel,
            regimeConfidence: regimeConfidence,
            bias: bias,
            structure: structure,
            structureLayer: structureLayer,
            volumeState: volumeState,
            volatilityRegime: volatilityRegime,
            lastClose: lastClose,
            ema200: ema200,
            volumeProfile: volumeProfile,
            rangeBudget: rangeBudget,
            squeeze: squeeze,
            higherTimeframe: higherTimeframe
        )
        tradeSetups = scoredSetups.map(\.setup)

        // Carried on the snapshot so setups built later can be graded with the
        // same weights instead of reaching the screen with no grade at all.
        let gradingContext = SetupGradingContext(
            timeframeMinutes: timeframeMinutes(from: timeframe) ?? 1440,
            regimeLabel: regimeLabel,
            regimeConfidence: regimeConfidence,
            structureLabel: structure,
            volumeState: volumeState,
            isHighVolatility: (volatilityRegime?.label.lowercased().contains("high") ?? false)
                || regimeLabel.lowercased().contains("high volatility"),
            hasLiquiditySweep: structureLayer.hasBullishSweep || structureLayer.hasBearishSweep,
            isAboveEMA200: ema200.map { lastClose > $0 },
            assetClass: SetupEdgeModel.assetClass(forSymbol: symbol),
            biasBullish: bias?.bullish,
            biasBearish: bias?.bearish,
            rangeUsedFraction: rangeBudget?.usedFraction
        )

        tradeSetups = applyProbabilityLayer(to: tradeSetups, probabilityLayer: probabilityLayer)
        if let macroDigest, let macroAlert = sameDayHighImpactMacroAlert(macroDigest: macroDigest) {
            tradeSetups = tradeSetups.map { setup in
                var updated = setup
                if updated.notes.contains(macroAlert) == false {
                    updated.notes.insert(macroAlert, at: 0)
                }
                return updated
            }
        }

        let signal = signalLabel(regimeLabel: regimeLabel, tradeSetups: tradeSetups)
        let riskLevel = riskLevelLabel(volatilityPct: volatilityPct, volatilityRegime: volatilityRegime)

        var augmentedRiskNotes = riskNotes
        let regimeImplicationNote = "Regime implication: \(regimeProfile.implication)"
        if augmentedRiskNotes.contains(regimeImplicationNote) == false {
            augmentedRiskNotes.insert(regimeImplicationNote, at: 0)
        }
        if let volumeNote, augmentedRiskNotes.contains(volumeNote) == false {
            augmentedRiskNotes.insert(volumeNote, at: 0)
        }
        if let macroDigest {
            for note in macroRiskNotes(macroDigest: macroDigest).reversed() where !augmentedRiskNotes.contains(note) {
                augmentedRiskNotes.insert(note, at: 0)
            }
        }
        if let derivativesDigest {
            for note in derivativesRiskNotes(digest: derivativesDigest).reversed() where !augmentedRiskNotes.contains(note) {
                augmentedRiskNotes.insert(note, at: 0)
            }
        }
        if let fearGreed {
            for note in fearGreedRiskNotes(data: fearGreed, symbol: symbol).reversed() where !augmentedRiskNotes.contains(note) {
                augmentedRiskNotes.insert(note, at: 0)
            }
        }
        for signal in divergenceSignals.reversed() {
            let line = "Divergence: \(signal)"
            if augmentedRiskNotes.contains(line) == false {
                augmentedRiskNotes.insert(line, at: 0)
            }
        }
        for note in structureLayer.riskNotes.reversed() where augmentedRiskNotes.contains(note) == false {
            augmentedRiskNotes.insert(note, at: 0)
        }
        if augmentedRiskNotes.contains(probabilityLayer.riskNote) == false {
            augmentedRiskNotes.insert(probabilityLayer.riskNote, at: 0)
        }

        let summary = buildSummary(
            symbol: symbol,
            timeframe: timeframe,
            lastClose: lastClose,
            changePct: changePct,
            regime: regimeLabel,
            structure: structure,
            levels: derivedLevels
        )

        var enrichedConfluence = confluence
        let regimeConfluence = "Market regime: \(regimeProfile.kind.rawValue) (\(regimeProfile.confidence)% confidence)"
        if enrichedConfluence.contains(regimeConfluence) == false {
            enrichedConfluence.append(regimeConfluence)
        }
        for item in regimeProfile.characteristics where !enrichedConfluence.contains(item) {
            enrichedConfluence.append(item)
        }
        for item in structureLayer.confluenceItems where !enrichedConfluence.contains(item) {
            enrichedConfluence.append(item)
        }
        if let newsDigest {
            for item in newsConfluenceItems(newsDigest: newsDigest) where !enrichedConfluence.contains(item) {
                enrichedConfluence.append(item)
            }
        }
        if let derivativesDigest {
            for item in derivativesConfluenceItems(digest: derivativesDigest) where !enrichedConfluence.contains(item) {
                enrichedConfluence.append(item)
            }
        }
        if let fearGreed {
            for item in fearGreedConfluenceItems(data: fearGreed, symbol: symbol) where !enrichedConfluence.contains(item) {
                enrichedConfluence.append(item)
            }
        }

        return MarketSnapshot(
            exchange: exchange,
            symbol: symbol,
            timeframe: timeframe,
            candleCount: candles.count,
            start: candles.first?.openTime ?? Date(),
            end: candles.last?.openTime ?? Date(),
            lastClose: lastClose,
            changePct: changePct,
            marketRegime: regimeLabel,
            marketStructure: structure,
            regimeConfidence: regimeConfidence,
            signal: signal,
            riskLevel: riskLevel,
            volumeState: volumeState,
            summary: summary,
            indicators: indicators,
            confluence: enrichedConfluence,
            fibLevels: fibLevels,
            supportResistance: derivedLevels,
            scenarios: scenarios,
            targets: targets,
            tradeSetups: tradeSetups,
            bias: bias,
            riskNotes: augmentedRiskNotes,
            news: newsDigest,
            macroCalendar: macroDigest,
            derivatives: derivativesDigest,
            fearGreed: fearGreed,
            gradingContext: gradingContext
        )
    }

    /// Grades a setup the app built after `analyze` returned, using the context
    /// that analysis left behind. Setups reaching the screen without a grade
    /// hide a measured number, so every displayed setup runs through here.
    static func graded(
        _ setup: ChartAnalysisPayload.TradeSetup,
        context: SetupGradingContext
    ) -> ChartAnalysisPayload.TradeSetup {
        guard setup.edgeGrade == nil else { return setup }

        let edge = SetupEdgeModel.evaluate(features: context.features(for: setup))
        var updated = setup
        updated.edgeGrade = edge.grade.rawValue
        updated.edgeExpectancyR = edge.expectancyR
        updated.edgeHitRate = edge.winProbability
        updated.edgeRawScore = edge.rawScore

        let gradeNote = "Edge grade: \(edge.grade.rawValue) (\(edge.grade.label)) • "
            + "historical expectancy \(String(format: "%+.2f", edge.expectancyR))R • "
            + "hit rate \(Int((edge.winProbability * 100).rounded()))% at this grade"
        if updated.notes.contains(gradeNote) == false {
            updated.notes.append(gradeNote)
        }
        if edge.drivers.isEmpty == false {
            let driverNote = "Edge drivers: " + edge.drivers.joined(separator: ", ")
            if updated.rationale.contains(driverNote) == false {
                updated.rationale.append(driverNote)
            }
        }
        return updated
    }

    private static func macroRiskNotes(macroDigest: MacroCalendarDigest) -> [String] {
        guard macroDigest.events.isEmpty == false else { return [] }

        let now = Date()
        let etFormatter = DateFormatter()
        etFormatter.locale = Locale(identifier: "en_US_POSIX")
        etFormatter.timeZone = TimeZone(identifier: "America/New_York")
        etFormatter.dateFormat = "MMM d"

        let upcoming = macroDigest.events
            .filter { event in
                guard let date = event.scheduledAt else { return false }
                let delta = date.timeIntervalSince(now)
                return delta > 0 && delta <= 7 * 24 * 3600
            }
            .filter { event in
                let impact = (event.impact ?? "").lowercased()
                return impact.contains("high") || impact.contains("medium")
            }
            .sorted { ($0.scheduledAt ?? .distantFuture) < ($1.scheduledAt ?? .distantFuture) }

        guard upcoming.isEmpty == false else { return [] }

        let highWithin24h = upcoming.filter { event in
            let impact = (event.impact ?? "").lowercased()
            guard impact.contains("high"), let date = event.scheduledAt else { return false }
            return date.timeIntervalSince(now) <= 24 * 3600
        }

        let highWithin72h = upcoming.filter { event in
            let impact = (event.impact ?? "").lowercased()
            guard impact.contains("high"), let date = event.scheduledAt else { return false }
            return date.timeIntervalSince(now) <= 72 * 3600
        }

        var notes: [String] = []
        if highWithin24h.isEmpty == false {
            notes.append("Macro event risk elevated: high-impact releases/speeches within 24h can trigger liquidity spikes and faster setup invalidation.")
        }
        if highWithin72h.count >= 3 {
            notes.append("Macro event cluster ahead: expect chop, fake reversals, and lower breakout reliability until the calendar clears.")
        }

        notes.append(contentsOf: upcoming.prefix(5).compactMap { event -> String? in
            let currency = event.currency.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = event.title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !currency.isEmpty, !title.isEmpty else { return nil }
            let impact = (event.impact ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let dateStr = event.scheduledAt.map { etFormatter.string(from: $0) } ?? "TBA"
            let isWithin24h = event.scheduledAt.map { $0.timeIntervalSince(now) <= 24 * 3600 } ?? false
            let urgency = isWithin24h ? " — within 24h, expect volatility." : "."
            let impactPrefix = impact.isEmpty ? "" : "\(impact) "
            return "Macro (\(dateStr)): \(impactPrefix)\(currency) — \(title)\(urgency)"
        })

        return notes
    }

    private static func sameDayHighImpactMacroAlert(macroDigest: MacroCalendarDigest) -> String? {
        let now = Date()
        let calendar = Calendar.autoupdatingCurrent
        let upcomingHigh = macroDigest.events
            .filter { event in
                guard let date = event.scheduledAt else { return false }
                let impact = (event.impact ?? "").lowercased()
                return impact.contains("high")
                    && date > now
                    && calendar.isDate(date, inSameDayAs: now)
            }
            .sorted { ($0.scheduledAt ?? .distantFuture) < ($1.scheduledAt ?? .distantFuture) }

        guard let event = upcomingHigh.first, let date = event.scheduledAt else { return nil }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "HH:mm"

        let hours = max(0, date.timeIntervalSince(now) / 3600)
        let timeText: String
        if hours < 1 {
            let minutes = max(1, Int(round(date.timeIntervalSince(now) / 60)))
            timeText = "in \(minutes)m"
        } else {
            timeText = "in \(String(format: "%.1f", hours))h"
        }

        let currency = event.currency.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = event.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let prefix = currency.isEmpty ? "" : "\(currency) "
        return "Macro alert: High-impact \(prefix)\(title) at \(formatter.string(from: date)) (\(timeText)). Expect volatility/spread risk around this setup."
    }

    private static func newsConfluenceItems(newsDigest: MarketNewsDigest) -> [String] {
        guard newsDigest.items.isEmpty == false else { return [] }

        let tones = newsDigest.items.compactMap(\.tone)
        guard tones.isEmpty == false else { return [] }

        let avgTone = tones.reduce(0, +) / Double(tones.count)
        let positiveCount = tones.filter { $0 > 0.1 }.count
        let negativeCount = tones.filter { $0 < -0.1 }.count
        let total = tones.count

        if avgTone > 0.2 {
            return ["News sentiment: bullish (\(positiveCount)/\(total) headlines positive)"]
        } else if avgTone < -0.2 {
            return ["News sentiment: bearish (\(negativeCount)/\(total) headlines negative)"]
        } else {
            return ["News sentiment: mixed/neutral (\(total) recent headlines)"]
        }
    }

    /// Confluence items derived from derivatives data (funding rate, OI, L/S ratio).
    private static func derivativesConfluenceItems(digest: DerivativesDigest) -> [String] {
        guard digest.errorMessage == nil else { return [] }
        var items: [String] = []

        if let rate = digest.fundingRate {
            let pct = rate * 100
            if pct > 0.03 {
                items.append(String(format: "Funding elevated (%+.3f%%) — longs dominant", pct))
            } else if pct > 0.005 {
                items.append(String(format: "Funding rate positive (%+.3f%%) — longs paying", pct))
            } else if pct < -0.03 {
                items.append(String(format: "Funding negative (%.3f%%) — shorts dominant", pct))
            } else if pct < -0.005 {
                items.append(String(format: "Funding rate negative (%.3f%%) — shorts paying", pct))
            } else {
                items.append(String(format: "Funding rate neutral (%+.3f%%)", pct))
            }
        }

        if let change = digest.openInterestChange24h {
            if change > 5 {
                items.append(String(format: "OI expanding (%+.1f%% 24h) — trend supported", change))
            } else if change < -5 {
                items.append(String(format: "OI declining (%.1f%% 24h) — participation falling", change))
            }
        }

        if let ls = digest.longShortRatio {
            if ls > 1.8 {
                items.append(String(format: "Long-heavy positioning (L/S %.2f)", ls))
            } else if ls < 0.6 {
                items.append(String(format: "Short-heavy positioning (L/S %.2f)", ls))
            }
        }

        return items
    }

    /// Risk notes derived from derivatives data — crowded trades, squeeze setups.
    private static func derivativesRiskNotes(digest: DerivativesDigest) -> [String] {
        guard digest.errorMessage == nil else { return [] }
        var notes: [String] = []

        if let rate = digest.fundingRate {
            let pct = rate * 100
            if pct > 0.05 {
                notes.append(String(format: "High funding rate (%+.3f%%) — long squeeze risk if price drops.", pct))
            } else if pct < -0.05 {
                notes.append(String(format: "Deeply negative funding (%.3f%%) — short squeeze risk if price rises.", pct))
            }
        }

        if let ls = digest.longShortRatio, let lp = digest.longAccountPct {
            if lp > 0.72 {
                notes.append(String(format: "%.0f%% of accounts are long — crowded long, watch for flush.", lp * 100))
            } else if lp < 0.35 {
                let sp = 1 - lp
                notes.append(String(format: "%.0f%% of accounts are short — crowded short, squeeze possible.", sp * 100))
            }
            _ = ls // suppress unused warning
        }

        return notes
    }

    /// Confluence items derived from Fear & Greed Index.
    private static func fearGreedConfluenceItems(data: FearGreedData, symbol: String) -> [String] {
        guard isFearGreedRelevant(symbol: symbol) else { return [] }
        let v = data.value
        switch v {
        case 0...15:
            return ["Fear & Greed: Extreme Fear (\(v)) — potential capitulation/reversal zone"]
        case 16...30:
            return ["Fear & Greed: Fear (\(v)) — risk-off sentiment"]
        case 70...84:
            return ["Fear & Greed: Greed (\(v)) — bullish sentiment"]
        case 85...100:
            return ["Fear & Greed: Extreme Greed (\(v)) — potential topping/overbought zone"]
        default:
            return []
        }
    }

    /// Risk notes derived from Fear & Greed Index.
    private static func fearGreedRiskNotes(data: FearGreedData, symbol: String) -> [String] {
        guard isFearGreedRelevant(symbol: symbol) else { return [] }
        let v = data.value
        switch v {
        case 0...15:
            return ["Fear & Greed at \(v) (Extreme Fear): historical reversal zones often mark local bottoms — counter-trend bounces possible."]
        case 85...100:
            return ["Fear & Greed at \(v) (Extreme Greed): markets often consolidate or pull back from these extremes — avoid chasing."]
        default:
            return []
        }
    }

    private static func isFearGreedRelevant(symbol: String) -> Bool {
        let upper = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if upper.hasPrefix("^") { return true } // Indices (Yahoo)
        return false
    }

    private static func signalLabel(regimeLabel: String, tradeSetups: [ChartAnalysisPayload.TradeSetup]) -> String {
        if tradeSetups.isEmpty {
            return "Hold"
        }
        return "Watch"
    }

    private static func applyLiveSetupFilters(
        setups: [ChartAnalysisPayload.TradeSetup],
        symbol: String,
        timeframe: String,
        regimeLabel: String,
        regimeConfidence: Int?,
        bias: ChartAnalysisPayload.Bias?,
        mode: MarketAnalysisMode
    ) -> [ChartAnalysisPayload.TradeSetup] {
        guard mode == .live else { return setups }
        guard setups.isEmpty == false else { return setups }

        let tfMinutes = timeframeMinutes(from: timeframe) ?? 0
        let regime = regimeLabel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let isRange = regime.contains("range") || regime.contains("consolidation")
        let conf = regimeConfidence ?? 0
        let bullish = bias?.bullish ?? 0
        let bearish = bias?.bearish ?? 0

        return setups.filter { setup in
            let text = (setup.setup + " " + setup.trigger).lowercased()
            let direction = setup.direction.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let isBullishSetup = direction.contains("bull")
            let isBearishSetup = direction.contains("bear")
            let strongBullishContext = bullish >= bearish + 18
                || ((regime.contains("bullish trend") || regime.contains("bullish rebound")) && bullish >= bearish + 8)
            let strongBearishContext = bearish >= bullish + 18
                || ((regime.contains("bearish trend") || regime.contains("bearish pullback")) && bearish >= bullish + 8)
            let directionalIdea = text.contains("watch")
                || text.contains("reclaim")
                || text.contains("breakdown")
                || text.contains("pullback")
                || text.contains("continuation")
                || text.contains("range rotation")
                || text.contains("fade")
                || text.contains("rejection")

            if directionalIdea {
                if isBullishSetup && strongBearishContext {
                    return false
                }
                if isBearishSetup && strongBullishContext {
                    return false
                }
            }

            // Continuation entries in choppy 30m environments tend to whipsaw.
            // Keep breakdown-continuation shorts only when the regime/bias clearly supports trend-following.
            if tfMinutes == 30, text.contains("30m breakdown continuation short") {
                let strongBearRegime = regime.contains("bearish trend") || regime.contains("bearish pullback")
                let strongBias = bearish >= 56 && bearish >= bullish + 10
                if !(strongBearRegime && strongBias && conf >= 32 && !isRange) {
                    return false
                }
            }

            // 15m range-bounce longs are whipsaw-prone; require stronger confirmation.
            if tfMinutes <= 15, text.contains("range bounce long") {
                let supportiveRange = isRange && bullish >= bearish + 12
                let supportiveTrend = (regime.contains("bullish trend") || regime.contains("bullish rebound")) && bullish >= 55
                if !(supportiveRange || supportiveTrend) {
                    return false
                }
            }

            return true
        }
    }

    /// Opt-in machine-readable dump of the edge features, for the offline eval
    /// harness to bucket outcomes by. Off in the app so users never see it.
    nonisolated(unsafe) static var emitEdgeDiagnostics = false

    /// Compact `key=value` line the eval harness turns into context tags.
    private static func edgeDiagnosticLine(features: SetupEdgeFeatures, edge: SetupEdge) -> String {
        var parts: [String] = []
        // Raw score in fine bands, so the score-to-outcome calibration curve can
        // be read straight off a run.
        parts.append(String(format: "raw=%+.2f", (edge.rawScore / 0.05).rounded(.down) * 0.05))
        parts.append("vloc=\(features.volumeLocation?.rawValue ?? "none")")
        if let used = features.rangeUsedFraction {
            let band: String
            if used < 0.5 { band = "under50" }
            else if used < 0.8 { band = "50-80" }
            else if used < 1.1 { band = "80-110" }
            else if used < 1.5 { band = "110-150" }
            else { band = "over150" }
            parts.append("rangeused=\(band)")
        } else {
            parts.append("rangeused=none")
        }
        if let squeeze = features.squeeze {
            if squeeze.didJustRelease {
                parts.append("squeeze=released")
            } else if squeeze.isSqueezed {
                parts.append("squeeze=on\(squeeze.squeezeLength >= 6 ? "-long" : "-short")")
            } else {
                parts.append("squeeze=off")
            }
        } else {
            parts.append("squeeze=none")
        }
        parts.append("htf=\(features.higherTimeframeAgreement?.rawValue ?? "none")")

        // Every remaining model input, so a refit can read all fourteen features
        // straight off a run instead of guessing at them from prose.
        parts.append("arch=\(features.archetype.rawValue)")
        parts.append("class=\(features.assetClass.rawValue)")
        parts.append("side=\(features.side == .long ? "long" : "short")")
        parts.append("ema200=\(features.isAboveEMA200.map { $0 ? "above" : "below" } ?? "none")")
        parts.append("sweep=\(features.hasLiquiditySweep ? "yes" : "no")")
        parts.append("highvol=\(features.isHighVolatility ? "yes" : "no")")
        parts.append("tfmin=\(features.timeframeMinutes)")
        parts.append("struct=\(structureTag(features.structure))")
        if let confidence = features.regimeConfidence {
            parts.append("conf=\((confidence / 10) * 10)")
        } else {
            parts.append("conf=none")
        }
        if let skew = features.biasSkew {
            parts.append(String(format: "skew=%+.0f", (skew / 20).rounded(.down) * 20))
        } else {
            parts.append("skew=none")
        }
        return "EdgeDiag: " + parts.joined(separator: " ")
    }

    private static func structureTag(_ structure: SetupEdgeFeatures.StructureKind) -> String {
        switch structure {
        case .trendingUp: return "up"
        case .trendingDown: return "down"
        case .mixed: return "mixed"
        }
    }

    /// Scores every setup with `SetupEdgeModel`, reorders so the strongest idea
    /// leads, and attaches an honest grade.
    ///
    /// Nothing is dropped here. A user who opens the app during a bad tape still
    /// gets setups; they get them labelled `D / Low conviction` with the reasons
    /// attached, rather than dressed up with an inflated R:R.
    private static func applySetupEdgeModel(
        setups: [ChartAnalysisPayload.TradeSetup],
        symbol: String,
        timeframe: String,
        regimeLabel: String,
        regimeConfidence: Int?,
        bias: ChartAnalysisPayload.Bias?,
        structure: String,
        structureLayer: MarketStructureLayer,
        volumeState: String,
        volatilityRegime: VolatilityRegime?,
        lastClose: Double,
        ema200: Double?,
        volumeProfile: VolumeProfile?,
        rangeBudget: RangeBudget?,
        squeeze: SqueezeState?,
        higherTimeframe: HigherTimeframeAlignment
    ) -> [(setup: ChartAnalysisPayload.TradeSetup, edge: SetupEdge)] {
        guard setups.isEmpty == false else { return [] }

        let tfMinutes = timeframeMinutes(from: timeframe) ?? 1440
        let structureKind = SetupEdgeModel.structureKind(fromLabel: structure)
        let isHighVolatility = (volatilityRegime?.label.lowercased().contains("high") ?? false)
            || regimeLabel.lowercased().contains("high volatility")
        let hasSweep = structureLayer.hasBullishSweep || structureLayer.hasBearishSweep
        let isAboveEMA200: Bool? = ema200.map { lastClose > $0 }

        let bullish = Double(bias?.bullish ?? 0)
        let bearish = Double(bias?.bearish ?? 0)
        let hasBias = bias?.bullish != nil || bias?.bearish != nil

        let scored = setups.map { setup -> (setup: ChartAnalysisPayload.TradeSetup, edge: SetupEdge) in
            let direction = setup.direction.lowercased()
            let side: SetupEdgeFeatures.Side = direction.contains("bear") ? .short : .long
            let htfSide: HigherTimeframeRead.Direction = side == .long ? .bullish : .bearish

            let features = SetupEdgeFeatures(
                side: side,
                archetype: SetupEdgeModel.archetype(fromSetupName: setup.setup, trigger: setup.trigger),
                assetClass: SetupEdgeModel.assetClass(forSymbol: symbol),
                structure: structureKind,
                regimeConfidence: regimeConfidence,
                biasSkew: hasBias ? (side == .long ? bullish - bearish : bearish - bullish) : nil,
                isAboveEMA200: isAboveEMA200,
                regimeLabel: regimeLabel,
                volumeState: volumeState,
                isHighVolatility: isHighVolatility,
                hasLiquiditySweep: hasSweep,
                timeframeMinutes: tfMinutes,
                volumeLocation: volumeProfile?.location(of: lastClose),
                rangeUsedFraction: rangeBudget?.usedFraction,
                squeeze: squeeze,
                higherTimeframeAgreement: higherTimeframe.agreement(with: htfSide)
            )

            let edge = SetupEdgeModel.evaluate(features: features)

            var updated = setup
            // The field is what the UI reads; the note is kept for the export
            // text and for anything decoded from older history.
            updated.edgeGrade = edge.grade.rawValue
            updated.edgeExpectancyR = edge.expectancyR
            updated.edgeHitRate = edge.winProbability
            updated.edgeRawScore = edge.rawScore
            let gradeNote = "Edge grade: \(edge.grade.rawValue) (\(edge.grade.label)) • "
                + "historical expectancy \(String(format: "%+.2f", edge.expectancyR))R • "
                + "hit rate \(Int((edge.winProbability * 100).rounded()))% at this grade"
            if updated.notes.contains(gradeNote) == false {
                updated.notes.append(gradeNote)
            }
            if edge.drivers.isEmpty == false {
                let driverNote = "Edge drivers: " + edge.drivers.joined(separator: ", ")
                if updated.rationale.contains(driverNote) == false {
                    updated.rationale.append(driverNote)
                }
            }
            if emitEdgeDiagnostics {
                updated.notes.append(edgeDiagnosticLine(features: features, edge: edge))
            }
            return (updated, edge)
        }

        // Stable sort: equal-edge setups keep the generator's original order.
        let ranked = scored.enumerated()
            .sorted { lhs, rhs in
                if lhs.element.edge.rawScore != rhs.element.edge.rawScore {
                    return lhs.element.edge.rawScore > rhs.element.edge.rawScore
                }
                return lhs.offset < rhs.offset
            }
            .map(\.element)

        // Everything the engine produced is returned, strongest measured edge
        // first. There is no selectivity setting any more: hiding a setup and
        // telling the user "nothing found" was worse than showing a C and
        // labelling it a C, and the grade badge already says which is which.
        return ranked
    }

    private static func riskLevelLabel(volatilityPct: Double?, volatilityRegime: VolatilityRegime?) -> String {
        // Absolute ATR% is the most user-intuitive "risk" proxy.
        // Do not allow a "Low" regime percentile to down-rank obviously high-volatility environments.
        if let volatilityPct {
            if volatilityPct >= 2.2 { return "High" }
        }

        if let volatilityRegime {
            let lower = volatilityRegime.label.lowercased()
            if lower.contains("high") { return "High" }
            if lower.contains("low") { return "Low" }
            if lower.contains("normal") { return "Medium" }
        }

        guard let volatilityPct else { return "Medium" }
        if volatilityPct >= 1.1 { return "Medium" }
        return "Low"
    }

    private static func volumeStateLabel(
        exchange: String,
        symbol: String,
        candles: [Candle],
        volatilityPct: Double?,
        volatilityRegime: VolatilityRegime?
    ) -> (state: String, note: String?) {
        let normalizedExchange = exchange.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedSymbol = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let isYahooFX = normalizedExchange.contains("yahoo") && normalizedSymbol.hasSuffix("=X")
        let isIndexSymbol = normalizedSymbol.hasPrefix("^") // S&P 500, Nasdaq, etc.
        let isFuturesSymbol = normalizedSymbol.hasSuffix("=F") // Gold, Oil, etc.

        // P3: Improve volume confidence labeling for assets where Yahoo Finance
        // doesn't provide real volume data.
        if isYahooFX {
            return ("Synthetic", "FX volume is synthetic — volume signals have lower confidence.")
        }
        if isIndexSymbol {
            // Yahoo Finance index volume is typically zero or missing.
            return ("Not available", "Index volume unavailable — volume signals skipped.")
        }
        if isFuturesSymbol {
            // Futures volume from Yahoo Finance is often delayed or incomplete.
            return ("Estimated", "Futures volume may be delayed — volume signals are moderate confidence.")
        }
        guard candles.count >= 25 else { return ("Unknown", "Insufficient candle data for volume analysis.") }
        let recent20 = candles.suffix(20).map(\.volume)
        let avg = recent20.reduce(0, +) / Double(recent20.count)
        guard avg > 0 else { return ("Not available", "No volume data available for this instrument.") }
        let last = candles.last?.volume ?? 0
        let last3 = candles.suffix(3).map(\.volume)
        let avg3 = last3.reduce(0, +) / Double(max(last3.count, 1))

        let ratioLast = last / avg
        let ratio3 = avg3 / avg

        let rangePct: Double? = {
            guard let lastCandle = candles.last, lastCandle.close > 0 else { return nil }
            return (lastCandle.high - lastCandle.low) / lastCandle.close * 100.0
        }()

        if ratioLast >= 1.25 || ratio3 >= 1.20 {
            return ("High", "Volume elevated vs 20-period average.")
        }

        if ratioLast <= 0.75 && ratio3 <= 0.80 {
            // If price movement is clearly elevated, do not label volume as "Low" (users interpret this as low activity).
            let isHighVolRegime = volatilityRegime?.label.lowercased().contains("high") == true
            if isHighVolRegime || (volatilityPct ?? 0) >= 0.70 || (rangePct ?? 0) >= 0.50 {
                return ("Normal", "Price movement elevated; volume is muted vs 20-period average.")
            }
            return ("Low", "Volume muted vs 20-period average.")
        }

        return ("Normal", nil)
    }

    private static func confluenceForSetups(from fibConfluence: [String]) -> [String] {
        fibConfluence
    }

    private enum StructureBias: String, Hashable, Sendable {
        case bullish
        case bearish
        case mixed
    }

    private struct MarketStructureLayer: Hashable, Sendable {
        let swingLabel: String
        let bias: StructureBias
        let events: [String]
        let confluenceItems: [String]
        let riskNotes: [String]
        let hasBullishBOS: Bool
        let hasBearishBOS: Bool
        let hasBullishCHoCH: Bool
        let hasBearishCHoCH: Bool
        let hasBullishSweep: Bool
        let hasBearishSweep: Bool
        let hasBullishReclaim: Bool
        let hasBearishReclaim: Bool
        let hasBullishReaction: Bool
        let hasBearishReaction: Bool
        let isRangeLike: Bool

        static let empty = MarketStructureLayer(
            swingLabel: "Structure layer: insufficient swing data",
            bias: .mixed,
            events: [],
            confluenceItems: [],
            riskNotes: [],
            hasBullishBOS: false,
            hasBearishBOS: false,
            hasBullishCHoCH: false,
            hasBearishCHoCH: false,
            hasBullishSweep: false,
            hasBearishSweep: false,
            hasBullishReclaim: false,
            hasBearishReclaim: false,
            hasBullishReaction: false,
            hasBearishReaction: false,
            isRangeLike: false
        )
    }

    private struct MarketRegimeProfile: Hashable, Sendable {
        enum Kind: String, Hashable, Sendable {
            case trendingUp = "Trending up"
            case trendingDown = "Trending down"
            case ranging = "Range / chop"
            case compression = "Compression"
            case breakoutExpansion = "Breakout expansion"
            case highVolatility = "High volatility"
            case exhaustion = "Exhaustion"
            case reversal = "Reversal environment"
            case unclear = "Unclear"
        }

        let kind: Kind
        let confidence: Int
        let characteristics: [String]
        let implication: String
    }

    private struct ProbabilityLayer: Hashable, Sendable {
        let bullish: Int
        let bearish: Int
        let range: Int
        let trap: Int
        let pullbackRisk: String

        var riskNote: String {
            "Probability layer: bullish \(bullish)% • bearish \(bearish)% • range \(range)% • trap \(trap)% • pullback risk \(pullbackRisk)"
        }
    }

    private static func marketRegimeProfile(
        regimeLabel: String,
        regimeConfidence: Int?,
        structure: String,
        structureLayer: MarketStructureLayer,
        trendStrength: Double?,
        volatilityPct: Double?,
        volatilityRegime: VolatilityRegime?,
        adxValue: Double?,
        plusDI: Double?,
        minusDI: Double?,
        rsi14: Double?,
        stochK: Double?,
        volumeState: String
    ) -> MarketRegimeProfile {
        let regime = regimeLabel.lowercased()
        let structureText = "\(structure) \(structureLayer.swingLabel) \(structureLayer.events.joined(separator: " "))".lowercased()
        let strength = abs(trendStrength ?? 0)
        let adx = adxValue ?? 0
        let highVolatility = volatilityRegime?.label.lowercased().contains("high") == true || (volatilityPct ?? 0) >= 2.5
        let lowVolatility = volatilityRegime?.label.lowercased().contains("low") == true || ((volatilityPct ?? 999) <= 0.65)
        let volumeLower = volumeState.lowercased()
        let weakVolume = volumeLower.contains("low") || volumeLower.contains("synthetic") || volumeLower.contains("not available")
        let elevatedVolume = volumeLower.contains("high") || volumeLower.contains("elevated")
        let rangeEvidenceCount = [
            regime.contains("range") || regime.contains("consolidation"),
            structureLayer.isRangeLike || structureText.contains("range"),
            structureText.contains("mixed") || structureText.contains("transition"),
            adx > 0 && adx < 18,
            strength < 0.08
        ].filter { $0 }.count
        let rangeLike = rangeEvidenceCount >= 2
        let compressionLike = lowVolatility
            && adx > 0
            && adx < 16
            && strength < 0.12
            && (rangeLike || weakVolume)
        let bullishDirection = regime.contains("bullish trend")
            || regime.contains("bullish rebound")
            || regime.contains("bullish reversal")
            || structureLayer.bias == .bullish
            || ((plusDI ?? 0) > (minusDI ?? 0) + 1.0)
        let bearishDirection = regime.contains("bearish trend")
            || regime.contains("bearish pullback")
            || regime.contains("bearish reversal")
            || structureLayer.bias == .bearish
            || ((minusDI ?? 0) > (plusDI ?? 0) + 1.0)
        let exhaustionLike = ((rsi14 ?? 50) >= 74 && (stochK ?? 50) >= 88)
            || ((rsi14 ?? 50) <= 26 && (stochK ?? 50) <= 12)
            || regime.contains("exhaust")
        let expansionLike = highVolatility
            && elevatedVolume
            && adx >= 20
            && (structureLayer.hasBullishBOS || structureLayer.hasBearishBOS || structureText.contains("bos"))
        let reversalLike = regime.contains("reversal")
            || structureLayer.hasBullishCHoCH
            || structureLayer.hasBearishCHoCH
            || structureLayer.hasBullishSweep
            || structureLayer.hasBearishSweep

        let kind: MarketRegimeProfile.Kind
        if exhaustionLike {
            kind = .exhaustion
        } else if expansionLike {
            kind = .breakoutExpansion
        } else if reversalLike {
            kind = .reversal
        } else if compressionLike {
            kind = .compression
        } else if rangeLike || (adx > 0 && adx < 16 && strength < 0.06) {
            kind = .ranging
        } else if highVolatility {
            kind = .highVolatility
        } else if bullishDirection && !bearishDirection {
            kind = .trendingUp
        } else if bearishDirection && !bullishDirection {
            kind = .trendingDown
        } else {
            kind = .unclear
        }

        var characteristics: [String] = []
        if adx > 0 {
            characteristics.append("Regime input: ADX \(Int(adx.rounded()))")
        }
        if let trendStrength {
            characteristics.append("Regime input: trend strength \(String(format: "%.2f", trendStrength))")
        }
        if let volatilityRegime {
            characteristics.append("Regime input: volatility \(volatilityRegime.label)")
        }
        if structureLayer.isRangeLike {
            characteristics.append("Regime input: overlapping/range-like structure")
        }
        if structureLayer.hasBullishBOS || structureLayer.hasBearishBOS {
            characteristics.append("Regime input: break of structure detected")
        }
        if weakVolume {
            characteristics.append("Regime input: weak volume confirmation")
        } else if elevatedVolume {
            characteristics.append("Regime input: elevated volume participation")
        }

        let implication: String = {
            switch kind {
            case .trendingUp:
                return "Preferred: bullish pullbacks/continuation. Penalized: countertrend shorts and range fades without rejection."
            case .trendingDown:
                return "Preferred: bearish pullbacks/rejections. Penalized: countertrend longs and bottom-fishing without reclaim."
            case .ranging:
                return "Preferred: range rotations/reclaims. Avoid: breakout chasing until price accepts outside the range."
            case .compression:
                return "Preferred: confirmed break-and-hold after volume expansion. Avoid: early breakout chasing inside compression."
            case .breakoutExpansion:
                return "Preferred: breakout continuation after retest holds. Penalized: mean reversion against expansion."
            case .highVolatility:
                return "Preferred: confirmation-based setups with wider invalidation. Avoid: tight stops and late entries."
            case .exhaustion:
                return "Preferred: pullback/reversal confirmation. Avoid: late continuation/FOMO entries."
            case .reversal:
                return "Preferred: reclaim/breakdown confirmation. Penalized: stale continuation in the old trend."
            case .unclear:
                return "Preferred: wait/no-edge. Avoid: forcing direction before structure, volume, or HTF confirms."
            }
        }()

        var confidence = Double(regimeConfidence ?? 45)
        switch kind {
        case .breakoutExpansion:
            confidence += elevatedVolume ? 10 : 4
            confidence += (adx >= 25 ? 8 : 0)
        case .compression:
            confidence += lowVolatility ? 10 : 0
            confidence += rangeLike ? 6 : 0
        case .ranging:
            confidence += rangeLike ? 8 : 0
            confidence -= highVolatility ? 5 : 0
        case .exhaustion:
            confidence += exhaustionLike ? 12 : 0
        case .trendingUp, .trendingDown:
            confidence += adx >= 22 ? 8 : 0
            confidence += strength >= 0.10 ? 6 : 0
        case .highVolatility:
            confidence += highVolatility ? 10 : 0
        case .reversal:
            confidence += reversalLike ? 8 : 0
        case .unclear:
            confidence = min(confidence, 55)
        }

        return MarketRegimeProfile(
            kind: kind,
            confidence: Int(min(max(confidence, 10), 95).rounded()),
            characteristics: Array((characteristics + regimeActionLines(for: kind)).prefix(8)),
            implication: implication
        )
    }

    private static func regimeActionLines(for kind: MarketRegimeProfile.Kind) -> [String] {
        switch kind {
        case .trendingUp:
            return [
                "Regime preferred: bullish pullbacks / continuation",
                "Regime penalized: countertrend shorts",
                "Regime trap risk: normal unless extended"
            ]
        case .trendingDown:
            return [
                "Regime preferred: bearish pullbacks / rejections",
                "Regime penalized: countertrend longs",
                "Regime trap risk: normal unless oversold"
            ]
        case .ranging:
            return [
                "Regime preferred: mean reversion / range fades",
                "Regime penalized: breakout continuation",
                "Regime trap risk: elevated"
            ]
        case .compression:
            return [
                "Regime preferred: confirmed break-and-hold",
                "Regime penalized: early breakout chasing",
                "Regime trap risk: high until expansion confirms"
            ]
        case .breakoutExpansion:
            return [
                "Regime preferred: continuation after retest",
                "Regime penalized: mean reversion against expansion",
                "Regime trap risk: moderate"
            ]
        case .highVolatility:
            return [
                "Regime preferred: confirmation with wider invalidation",
                "Regime penalized: tight-stop entries",
                "Regime trap risk: elevated"
            ]
        case .exhaustion:
            return [
                "Regime preferred: pullback / reversal confirmation",
                "Regime penalized: late continuation",
                "Regime trap risk: high"
            ]
        case .reversal:
            return [
                "Regime preferred: reclaim / breakdown confirmation",
                "Regime penalized: stale continuation",
                "Regime trap risk: elevated"
            ]
        case .unclear:
            return [
                "Regime preferred: wait / no-edge",
                "Regime penalized: forced direction",
                "Regime trap risk: elevated"
            ]
        }
    }

    private static func probabilityLayer(
        regimeLabel: String,
        regimeProfile: MarketRegimeProfile,
        structureLayer: MarketStructureLayer,
        bias: ChartAnalysisPayload.Bias?,
        rsi14: Double?,
        stochK: Double?,
        macdHist: Double?,
        adx: ADXPack,
        volumeState: String,
        volatilityRegime: VolatilityRegime?
    ) -> ProbabilityLayer {
        // Fixed policy. The three selectivity modes were measured against each
        // other on both splits (see tools/ENGINE_EVAL.md): conservative +0.073R
        // per trade held out, balanced +0.026R, aggressive -0.042R. The user no
        // longer chooses; the engine always runs the one that measured best.
        let regime = regimeLabel.lowercased()
        var bullish = 33.0
        var bearish = 33.0
        var range = 34.0
        var trap = 8.0

        let biasBull = Double(bias?.bullish ?? 0)
        let biasBear = Double(bias?.bearish ?? 0)
        bullish += (biasBull - biasBear) * 0.22
        bearish += (biasBear - biasBull) * 0.22

        if regime.contains("bullish trend") || regime.contains("bullish rebound") {
            bullish += 12
            range -= 6
        } else if regime.contains("bearish trend") || regime.contains("bearish pullback") {
            bearish += 12
            range -= 6
        } else if regime.contains("range") || regime.contains("consolidation") {
            range += 16
            bullish -= 5
            bearish -= 5
        } else if regime.contains("reversal") {
            trap += 5
        }

        switch regimeProfile.kind {
        case .trendingUp:
            bullish += 8
            bearish -= 4
            range -= 5
        case .trendingDown:
            bearish += 8
            bullish -= 4
            range -= 5
        case .ranging:
            range += 14
            bullish -= 4
            bearish -= 4
            trap += 4
        case .compression:
            range += 12
            trap += 8
            bullish -= 3
            bearish -= 3
        case .breakoutExpansion:
            range -= 8
            trap = max(4, trap - 2)
            if structureLayer.bias == .bullish {
                bullish += 10
            } else if structureLayer.bias == .bearish {
                bearish += 10
            }
        case .highVolatility:
            trap += 7
            range += 2
        case .exhaustion:
            trap += 12
            range += 5
            bullish -= regime.contains("bullish") ? 3 : 0
            bearish -= regime.contains("bearish") ? 3 : 0
        case .reversal:
            trap += 7
            range += 4
        case .unclear:
            range += 8
            trap += 4
        }

        switch structureLayer.bias {
        case .bullish:
            bullish += 10
            bearish -= 5
            range -= 3
        case .bearish:
            bearish += 10
            bullish -= 5
            range -= 3
        case .mixed:
            range += 6
        }
        if structureLayer.hasBullishBOS { bullish += 7; range -= 3 }
        if structureLayer.hasBearishBOS { bearish += 7; range -= 3 }
        if structureLayer.hasBullishCHoCH { bullish += 5; trap += 2 }
        if structureLayer.hasBearishCHoCH { bearish += 5; trap += 2 }
        if structureLayer.hasBullishSweep || structureLayer.hasBearishSweep { trap += 7; range += 3 }
        if structureLayer.hasBullishReclaim || structureLayer.hasBullishReaction { bullish += 4 }
        if structureLayer.hasBearishReclaim || structureLayer.hasBearishReaction { bearish += 4 }
        if structureLayer.isRangeLike { range += 10; trap += 3 }

        if let macdHist {
            if macdHist > 0 { bullish += 4 } else if macdHist < 0 { bearish += 4 }
        }
        if let adxValue = adx.adx {
            if adxValue >= 25 {
                range -= 5
                if (adx.plusDI ?? 0) >= (adx.minusDI ?? 0) { bullish += 4 } else { bearish += 4 }
            } else if adxValue <= 15 {
                range += 7
                trap += 2
            }
        }
        if let rsi14 {
            if rsi14 >= 72 {
                bullish += 2
                trap += rsi14 >= 76 ? 9 : 5
            } else if rsi14 <= 28 {
                bearish += 2
                trap += rsi14 <= 24 ? 9 : 5
            } else if rsi14 >= 55 {
                bullish += 3
            } else if rsi14 <= 45 {
                bearish += 3
            }
        }
        if let stochK {
            if stochK >= 92 || stochK <= 8 {
                trap += 7
            } else if stochK >= 88 || stochK <= 12 {
                trap += 4
            }
        }

        if let rsi14, let stochK, (rsi14 >= 74 && stochK >= 92) || (rsi14 <= 26 && stochK <= 8) {
            trap += 8
            range += 3
        }

        let volume = volumeState.lowercased()
        if volume.contains("low") || volume.contains("synthetic") || volume.contains("not available") {
            trap += 3
            range += 2
        } else if volume.contains("high") {
            trap = max(4, trap - 2)
        }

        if let volatilityRegime {
            let label = volatilityRegime.label.lowercased()
            if label.contains("high") {
                trap += 4
            } else if label.contains("low") {
                range += 4
            }
        }

        // Was a three-way switch on the selectivity setting. One policy now, so
        // the conservative arm is written out inline.
        trap += 3
        range += 3
        bullish -= bullish >= bearish ? 4 : 1
        bearish -= bearish > bullish ? 4 : 1

        bullish = min(max(bullish, 8), 82)
        bearish = min(max(bearish, 8), 82)
        range = min(max(range, 8), 76)
        let directionalSum = bullish + bearish + range
        if directionalSum > 0 {
            bullish = bullish / directionalSum * 100
            bearish = bearish / directionalSum * 100
            range = range / directionalSum * 100
        }

        trap = min(max(trap, 4), 42)
        let pullbackRisk: String = {
            let exhaustion = (rsi14 ?? 50) >= 70 || (rsi14 ?? 50) <= 30 || (stochK ?? 50) >= 85 || (stochK ?? 50) <= 15
            if trap >= 24 || exhaustion { return "High" }
            if trap >= 14 || structureLayer.isRangeLike { return "Moderate" }
            return "Low"
        }()

        return ProbabilityLayer(
            bullish: Int(bullish.rounded()),
            bearish: Int(bearish.rounded()),
            range: Int(range.rounded()),
            trap: Int(trap.rounded()),
            pullbackRisk: pullbackRisk,
        )
    }

    private static func applyProbabilityLayer(
        to scenarios: [ChartAnalysisPayload.Scenario],
        probabilityLayer: ProbabilityLayer
    ) -> [ChartAnalysisPayload.Scenario] {
        scenarios.map { scenario in
            let name = scenario.name.lowercased()
            let probability: Int
            if name.contains("bull") {
                probability = probabilityLayer.bullish
            } else if name.contains("bear") {
                probability = probabilityLayer.bearish
            } else {
                probability = probabilityLayer.range
            }
            return ChartAnalysisPayload.Scenario(
                name: scenario.name,
                trigger: scenario.trigger,
                path: scenario.path,
                invalidation: scenario.invalidation,
                probability: probability
            )
        }
    }

    private static func applyProbabilityLayer(
        to setups: [ChartAnalysisPayload.TradeSetup],
        probabilityLayer: ProbabilityLayer
    ) -> [ChartAnalysisPayload.TradeSetup] {
        setups.map { setup in
            let direction = setup.direction.lowercased()
            let continuation: Int
            let reversal: Int
            if direction.contains("bull") {
                continuation = probabilityLayer.bullish
                reversal = probabilityLayer.bearish
            } else if direction.contains("bear") {
                continuation = probabilityLayer.bearish
                reversal = probabilityLayer.bullish
            } else {
                continuation = probabilityLayer.range
                reversal = max(probabilityLayer.bullish, probabilityLayer.bearish)
            }
            var updated = setup
            let trap = probabilityLayer.trap
            let continuationShare = max(0, continuation)
            let reversalShare = max(0, reversal)
            let directionalTotal = max(continuationShare + reversalShare, 1)
            let remaining = max(0, 100 - trap)
            let normalizedContinuation = Int((Double(continuationShare) / Double(directionalTotal) * Double(remaining)).rounded())
            let normalizedReversal = max(0, 100 - trap - normalizedContinuation)
            let note = "Probability: continuation \(normalizedContinuation)% • reversal \(normalizedReversal)% • trap \(trap)% • pullback risk \(probabilityLayer.pullbackRisk)"
            if updated.notes.contains(note) == false {
                updated.notes.append(note)
            }
            return updated
        }
    }

    private static func generateTradeSetups(
        symbol: String,
        timeframe: String,
        lastCandle: Candle?,
        lastClose: Double,
        atr14: Double?,
        volatilityPct: Double?,
        volumeState: String,
        volumeLastToAvg20: Double?,
        levels: [ChartAnalysisPayload.KeyLevel],
        regimeLabel: String,
        structure: String,
        confluence: [String],
        ema20: Double?,
        ema50: Double?,
        ema200: Double?,
        avwapVwap: Double?,
        bollingerMiddle: Double?,
        rsi14: Double?,
        stochK: Double?,
        stochD: Double?,
        macdHist: Double?,
        volatilityRegimeLabel: String? = nil,
        volatilityRegimePercentile: Int? = nil,
        obvDelta: Double? = nil,
        roc14Pct: Double? = nil,
        regressionSlopePct: Double? = nil,
        trendStrength: Double? = nil,
        divergenceSignals: [String] = [],
        patternSignals: [String] = [],
        structureLayer: MarketStructureLayer = .empty,
        adx: ADXPack,
        useEMAFilter: Bool,
        useRSIFilter: Bool,
        useMACDFilter: Bool,
        useADXFilter: Bool,
        useVolumeFilter: Bool,
        mode: MarketAnalysisMode = .live
    ) -> [ChartAnalysisPayload.TradeSetup] {
        let numericLevels = levels.compactMap { level -> (value: Double, price: String, kind: String)? in
            guard let v = Double(level.price) else { return nil }
            guard v > 0 else { return nil }
            return (v, level.price, level.kind)
        }.sorted { $0.value < $1.value }

        guard !numericLevels.isEmpty else { return [] }

        // Fixed policy. The three selectivity modes were measured against each
        // other on both splits (see tools/ENGINE_EVAL.md): conservative +0.073R
        // per trade held out, balanced +0.026R, aggressive -0.042R. The user no
        // longer chooses; the engine always runs the one that measured best.
        // Selectivity is no longer a user setting. These two constants pin the
        // generator to the policy that measured best on both splits, and keep the
        // surrounding branches readable: the value after the colon is the one the
        // engine now uses. See "Setup selectivity" in tools/ENGINE_EVAL.md.
        let isBalancedRisk = false
        let isAggressiveRisk = false

        let kind = timeframeKind(from: timeframe)
        let minutes = timeframeMinutes(from: timeframe) ?? 60
        let isHigherIntraday = kind == .intraday && minutes >= 240

        let allowScalp = (kind == .intraday && minutes <= 60)
        let allowShortTerm = (kind == .intraday || kind == .daily)
        // Higher intraday and daily charts behave closer to swing trading than short-term.
        // Allow swing setups there so 4h/6h/8h style scans do not surface scalp-like ideas.
        let allowSwing = (isHigherIntraday || kind == .daily || kind == .weekly || kind == .monthly)

        // Dynamic horizon label — matches the actual timeframe so swing setups
        // on daily/weekly charts don't misleadingly say "Short-term".
        let defaultHorizon: String = {
            switch kind {
            case .intraday:
                if isHigherIntraday { return "Swing" }
                return minutes <= 30 ? "Scalp" : "Short-term"
            case .daily:    return "Swing"
            case .weekly:   return "Swing"
            case .monthly:  return "Position"
            }
        }()

        let below = numericLevels.filter { $0.value < lastClose }
        let above = numericLevels.filter { $0.value > lastClose }

        let support = below.last
        let resistance = above.first
        let nextResistance = above.dropFirst().first
        let nextSupport = below.dropLast().last

        let atr = atr14 ?? (lastClose * 0.006)

        let volatilityStopMultiplier: Double = {
            guard let volatilityPct else { return 1.0 }
            if volatilityPct >= 3.0 { return 1.18 }
            if volatilityPct <= 0.70 { return 0.92 }
            return 1.0
        }()
        let adjustedStopScale = volatilityStopMultiplier
        let scalpStop = max(atr * 0.7, lastClose * 0.003) * adjustedStopScale
        let shortStop: Double
        if minutes <= 5 {
            shortStop = max(atr * 1.8, lastClose * 0.005) * adjustedStopScale
        } else if minutes <= 15 {
            shortStop = max(atr * 1.5, lastClose * 0.005) * adjustedStopScale
        } else {
            shortStop = max(atr * 1.2, lastClose * 0.005) * adjustedStopScale
        }
        let swingStop = max(atr * 2.0, lastClose * 0.010) * adjustedStopScale

        // Price floors are relative on purpose. A literal 0.0001 is eight times
        // the entire price of a sub-cent instrument, so clamping to it put the
        // stop above the entry on a long and the setup was discarded. Every
        // price clamp below scales with `lastClose`.
        func safe(_ value: Double) -> Double? {
            guard value.isFinite, value > 0 else { return nil }
            return value
        }

        func fmt(_ value: Double) -> String {
            let upperSymbol = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()

            func fractionDigits(for step: Double) -> Int {
                if step >= 1 { return 0 }
                if step >= 0.1 { return 1 }
                if step >= 0.01 { return 2 }
                if step >= 0.001 { return 3 }
                if step >= 0.0001 { return 4 }
                if step >= 0.00001 { return 5 }
                return 8
            }

            let step: Double = {
                if upperSymbol.hasPrefix("^") {
                    if upperSymbol == "^VIX" { return value >= 100 ? 0.1 : 0.01 }
                    if value >= 1000 { return 1.0 }
                    if value >= 100 { return 0.1 }
                    return 0.01
                }

                if upperSymbol.hasSuffix("=X") {
                    let base = String(upperSymbol.dropLast(2))
                    if base.hasPrefix("XAU") || base.hasPrefix("XAG") || base.hasPrefix("XPT") || base.hasPrefix("XPD") || base.hasPrefix("XCU") {
                        if value >= 1000 { return 1.0 }
                        if value >= 100 { return 0.1 }
                        return 0.01
                    }

                    if base.count == 6, base.allSatisfy(\.isLetter) {
                        let quote = String(base.suffix(3))
                        return quote == "JPY" ? 0.01 : 0.0001
                    }
                }

                if upperSymbol.hasSuffix("=F") {
                    if value >= 1000 { return 1.0 }
                    if value >= 100 { return 0.1 }
                    if value >= 10 { return 0.01 }
                    if value >= 1 { return 0.0001 }
                    if value >= 0.1 { return 0.00001 }
                    if value >= 0.01 { return 0.000001 }
                    return 0.00000001
                }

                if value >= 1000 { return 1.0 }
                if value >= 100 { return 0.1 }
                if value >= 10 { return 0.01 }
                if value >= 1 { return 0.0001 }
                if value >= 0.1 { return 0.00001 }
                if value >= 0.01 { return 0.000001 }
                return 0.00000001
            }()

            let rounded = roundToStep(value, step: step)
            let digits = fractionDigits(for: step)
            return String(format: "%.\(digits)f", rounded)
        }

        enum TradeDirection {
            case long
            case short
        }

        func inferDirection(entry: Double, stop: Double) -> TradeDirection? {
            if stop < entry { return .long }
            if stop > entry { return .short }
            return nil
        }

        func directionalReward(entry: Double, stop: Double, target: Double) -> Double? {
            guard let direction = inferDirection(entry: entry, stop: stop) else { return nil }
            switch direction {
            case .long:
                return target - entry
            case .short:
                return entry - target
            }
        }

        func rr(entry: Double, stop: Double, target: Double) -> String? {
            let displayedEntry = Double(fmt(entry)) ?? entry
            let displayedStop = Double(fmt(stop)) ?? stop
            let displayedTarget = Double(fmt(target)) ?? target
            let risk = abs(displayedEntry - displayedStop)
            guard risk > 0 else { return nil }
            guard let reward = directionalReward(entry: displayedEntry, stop: displayedStop, target: displayedTarget), reward > 0 else { return nil }
            return String(format: "1:%.1f", reward / risk)
        }

        func rrValue(entry: Double, stop: Double, target: Double) -> Double? {
            let risk = abs(entry - stop)
            guard risk > 0 else { return nil }
            guard let reward = directionalReward(entry: entry, stop: stop, target: target), reward > 0 else { return nil }
            return reward / risk
        }

        func minRR(for horizon: String) -> Double {
            switch horizon {
            case "Scalp", "Short-term":
                return 0.35
            case "Swing", "Position":
                return 0.45
            default:
                return 0.35
            }
        }

        let symbolUpper = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let isYahooFX: Bool = {
            guard symbolUpper.hasSuffix("=X") else { return false }
            let base = String(symbolUpper.dropLast(2))
            // Exclude metals spot codes, which also end in =X.
            if base.hasPrefix("XAU") || base.hasPrefix("XAG") || base.hasPrefix("XPT") || base.hasPrefix("XPD") || base.hasPrefix("XCU") {
                return false
            }
            return base.count == 6 && base.allSatisfy(\.isLetter)
        }()
        let isCryptoSymbol: Bool = {
            // Heuristic: symbols like BTCUSDT, LINKUSDT, ETH-USD, etc.
            if symbolUpper.hasPrefix("^") { return false }
            if symbolUpper.hasSuffix("=X") || symbolUpper.hasSuffix("=F") { return false }
            if symbolUpper.contains("USDT") { return true }
            if symbolUpper.contains("-USD") { return true }
            return false
        }()
        let isCryptoMajorSymbol: Bool = {
            guard isCryptoSymbol else { return false }
            return symbolUpper.hasPrefix("BTC") || symbolUpper.hasPrefix("ETH")
        }()
        let isCryptoAltSymbol = isCryptoSymbol && !isCryptoMajorSymbol
        let isEquitySymbol: Bool = {
            // Heuristic for regular tickers like AAPL/MSFT/TSLA.
            // Excludes crypto, FX, futures, and indices.
            if isCryptoSymbol { return false }
            if isYahooFX { return false }
            if symbolUpper.hasPrefix("^") { return false }
            if symbolUpper.hasSuffix("=F") { return false }
            // Avoid treating obviously "synthetic" Yahoo tickers as equities.
            if symbolUpper.contains("=X") { return false }
            return symbolUpper.count >= 1 && symbolUpper.count <= 8 && symbolUpper.contains(where: \.isLetter)
        }()

        let minStopDistance: Double = {
            if isYahooFX { return fxMinStopDistance() }
            let isCryptoLowTF = isCryptoSymbol && kind == .intraday && minutes > 0 && minutes <= 60
            let isEquityLowTF = isEquitySymbol && kind == .intraday && minutes > 0 && minutes <= 60

            // Detect compressed levels: nearest support AND resistance both within 1 ATR of price.
            let isCompressed = atr > 0
                && above.first.map { ($0.value - lastClose) / atr < 1.0 } ?? false
                && below.last.map { (lastClose - $0.value) / atr < 1.0 } ?? false

            let pctFloor: Double = {
                if isCryptoLowTF {
                    // Compressed levels: reduce pct floor so stops aren't pushed too far.
                    // Must match the atrFloor compression detection for consistency.
                    if isCompressed {
                        let extremeCompression = atr > 0
                            && above.first.map { ($0.value - lastClose) / atr < 0.1 } ?? false
                            && below.last.map { (lastClose - $0.value) / atr < 0.1 } ?? false
                        if extremeCompression {
                            if minutes <= 15 { return lastClose * 0.0008 }
                            if minutes <= 30 { return lastClose * 0.0007 }
                            return lastClose * 0.0006
                        }
                        if minutes <= 15 { return lastClose * 0.0012 }
                        if minutes <= 30 { return lastClose * 0.0011 }
                        return lastClose * 0.0010
                    }
                    // Crypto low timeframes are noisy; enforce slightly wider stops than the default.
                    if minutes <= 15 { return lastClose * 0.0028 }
                    if minutes <= 30 { return lastClose * 0.0027 }
                    return lastClose * 0.0026
                }
                if isEquityLowTF {
                    // Equities low timeframes can show misleadingly tiny stops (cents) that make
                    // R:R look enormous on paper. Enforce a wider minimum stop distance.
                    if minutes <= 15 { return lastClose * 0.0020 }
                    if minutes <= 30 { return lastClose * 0.0019 }
                    return lastClose * 0.0018
                }
                if isCryptoSymbol { return lastClose * 0.0020 }
                if symbolUpper.hasSuffix("=F") { return lastClose * 0.0016 }
                return lastClose * 0.0014
            }()
            let atrFloor: Double = {
                switch kind {
                case .intraday:
                    if isCryptoLowTF {
                        // Make low-TF crypto stops meaningfully wider vs ATR to reduce whipsaw
                        // and avoid printing unrealistically high R:R from tiny stop distances.
                        // However, when levels are extremely compressed (support/resistance
                        // clustered within 1 ATR), use a tighter multiplier so setups can
                        // actually achieve viable R:R.
                        let isCompressed = atr > 0 && above.first.map { ($0.value - lastClose) / atr < 1.0 } ?? false
                            && below.last.map { (lastClose - $0.value) / atr < 1.0 } ?? false
                        if isCompressed {
                            // Tight levels: use smaller multiplier so stop isn't pushed too far.
                            // For extreme compression (nearest level within 0.1 ATR), use the
                            // smallest multiplier to ensure R:R can actually be achieved.
                            let extremeCompression = atr > 0
                                && above.first.map { ($0.value - lastClose) / atr < 0.1 } ?? false
                                && below.last.map { (lastClose - $0.value) / atr < 0.1 } ?? false
                            if extremeCompression {
                                if minutes <= 15 { return atr * 0.35 }
                                if minutes <= 30 { return atr * 0.30 }
                                return atr * 0.25
                            }
                            if minutes <= 15 { return atr * 0.50 }
                            if minutes <= 30 { return atr * 0.45 }
                            return atr * 0.40
                        }
                        if minutes <= 15 { return atr * 0.85 }
                        if minutes <= 30 { return atr * 0.80 }
                        return atr * 0.75
                    }
                    if isEquityLowTF {
                        if minutes <= 15 { return atr * 0.55 }
                        if minutes <= 30 { return atr * 0.50 }
                        return atr * 0.45
                    }
                    if minutes <= 15 { return atr * (isCryptoSymbol ? 0.32 : 0.28) }
                    if minutes <= 60 { return atr * (isCryptoSymbol ? 0.30 : 0.26) }
                    return atr * (isCryptoSymbol ? 0.28 : 0.25)
                case .daily:
                    return atr * (isCryptoSymbol ? 0.30 : 0.28)
                case .weekly:
                    return atr * 0.32
                case .monthly:
                    return atr * 0.34
                }
            }()
            return max(atrFloor, pctFloor)
        }()

        func stopAbove(_ level: Double, buffer: Double) -> Double {
            level + max(buffer, minStopDistance)
        }

        func stopBelow(_ level: Double, buffer: Double) -> Double {
            level - max(buffer, minStopDistance)
        }

        func minRewardAtr(for horizon: String) -> Double {
            // TP1 still has to clear fees and slippage, but it no longer has to clear
            // the entry noise as well: entries now wait for the level to be accepted,
            // so the trade starts past the adverse excursion. Measured on the held-out
            // split, the edge sits at R:R 1.2 to 2.0; targets beyond 3R lose.
            switch horizon {
            case "Scalp":
                if isCryptoSymbol && kind == .intraday && minutes > 0 && minutes <= 60 { return 0.20 }
                if isEquitySymbol && kind == .intraday && minutes > 0 && minutes <= 60 { return 0.11 }
                if isYahooFX { return 0.11 }
                return 0.15
            case "Short-term":
                if isCryptoSymbol && kind == .intraday && minutes > 0 && minutes <= 60 { return 0.25 }
                if isEquitySymbol && kind == .intraday && minutes > 0 && minutes <= 60 { return 0.19 }
                return 0.27
            case "Swing", "Position": return 0.29
            default: return 0.21
            }
        }

        func selectTargets(entry: Double, stop: Double, candidates: [Double], horizon: String) -> (t1: Double, t2: Double?)? {
            let min = minRR(for: horizon)
            let minReward = minRewardAtr(for: horizon)
            let isSwingHorizon = horizon == "Swing" || horizon == "Position"
            if isSwingHorizon, entry > 0 {
                let riskPct = abs(entry - stop) / entry
                guard riskPct >= 0.0045 else { return nil }
            }
            let minRewardPct: Double = {
                switch horizon {
                case "Swing": return 0.0090
                case "Position": return 0.0120
                default: return 0.0
                }
            }()
            let maxDistancePct: Double = {
                switch horizon {
                case "Scalp": return 0.18
                case "Short-term": return 0.30
                case "Swing", "Position": return 0.45
                default: return 0.30
                }
            }()

            func eligible(_ candidate: Double, requireMinReward: Bool) -> Bool {
                guard candidate.isFinite, candidate > 0 else { return false }
                guard let direction = inferDirection(entry: entry, stop: stop) else { return false }
                switch direction {
                case .long:
                    if candidate <= entry { return false }
                case .short:
                    if candidate >= entry { return false }
                }
                if entry > 0, abs(candidate - entry) / entry > maxDistancePct { return false }
                if entry > 0, minRewardPct > 0, abs(candidate - entry) / entry < minRewardPct { return false }
                guard let rrV = rrValue(entry: entry, stop: stop, target: candidate), rrV >= min else { return false }
                if requireMinReward, atr > 0 {
                    return abs(candidate - entry) / atr >= minReward
                }
                return true
            }

            let eligibleWithReward = candidates.filter { eligible($0, requireMinReward: true) }
            let poolRaw = eligibleWithReward.isEmpty ? candidates.filter { eligible($0, requireMinReward: false) } : eligibleWithReward
            guard poolRaw.isEmpty == false else { return nil }

            // Prefer nearer targets for scalping / low-TF to keep TP2 from being a huge projection.
            let preferNearest: Bool = {
                // On very short timeframes, farther targets increase timeouts and turn many trades into
                // "stop or nothing" outcomes. Prefer nearer targets (higher hit rate + earlier BE moves),
                // even in backtests.
                if horizon == "Scalp" { return true }
                if horizon == "Short-term", kind == .intraday, minutes > 0 && minutes <= 60 { return true }
                if mode == .backtest { return false }
                return false
            }()

            let direction = inferDirection(entry: entry, stop: stop)
            func rewardDistance(_ candidate: Double) -> Double {
                guard let direction else { return Double.greatestFiniteMagnitude }
                switch direction {
                case .long:  return max(candidate - entry, 0)
                case .short: return max(entry - candidate, 0)
                }
            }

            // De-dupe by exact value first (candidates are already rounded heavily); then sort.
            var seen: Set<Double> = []
            var pool = poolRaw.filter { seen.insert($0).inserted }
            pool.sort { rewardDistance($0) < rewardDistance($1) }

            guard let first = pool.first else { return nil }

            let rr1 = rrValue(entry: entry, stop: stop, target: first) ?? 0
            guard rr1 >= 1.0 else { return nil }

            // Pick TP2 as the next-nearest eligible target, but avoid extreme step-ups in R:R on scalp/low-TF.
            let second: Double? = {
                guard pool.count >= 2 else { return nil }
                for candidate in pool.dropFirst() {
                    guard candidate != first else { continue }
                    guard fmt(candidate) != fmt(first) else { continue }
                    guard rewardDistance(candidate) > rewardDistance(first) else { continue }
                    if preferNearest, horizon == "Scalp" {
                        let rr2 = rrValue(entry: entry, stop: stop, target: candidate) ?? 0
                        // If TP2 implies an extreme RR jump, it usually means the target is too far for a scalp.
                        if rr1 > 0, rr2 > rr1 * 3.0 { continue }
                    }
                    return candidate
                }
                return nil
            }()

            return (first, second)
        }

        let adxValue = adx.adx ?? 0
        let structureLower = structure.lowercased()
        let structureIsBullish = structureLower.contains("higher highs and higher lows")
        let structureIsBearish = structureLower.contains("lower highs and lower lows")
        let structureLooksRangeLike = structureLower.contains("mixed")
            || structureLower.contains("range")
            || structureLower.contains("transition")

        // Trend/range classification should be robust on intraday: use ADX + structure rather than regime labels.
        // NOTE: For intraday crypto, ADX often sits in the "middle" and the old thresholds produced "no environment",
        // which suppressed setups and made trade counts tiny.
        let isTrendingEnvironment: Bool = {
            if useADXFilter {
                if kind == .intraday, isCryptoSymbol {
                    return (adxValue >= 18) && (structureLooksRangeLike == false)
                }
                return (adxValue >= 20) && (structureLooksRangeLike == false)
            }
            return structureLooksRangeLike == false
        }()
        let isRangeEnvironment: Bool = {
            if useADXFilter {
                if kind == .intraday, isCryptoSymbol {
                    return (adxValue <= 22) || (structureLooksRangeLike && adxValue <= 28)
                }
                return (adxValue <= 18) || (structureLooksRangeLike && adxValue <= 24)
            }
            return structureLooksRangeLike
        }()

        let rsiValue = useRSIFilter ? (rsi14 ?? 50) : 50
        let isOversold = useRSIFilter && (rsiValue <= 32)
        let macdHistValue = macdHist ?? 0
        let macdIsBullish = useMACDFilter ? (macdHistValue >= 0) : true
        let hasCountertrendTailwind = (!useMACDFilter || macdHistValue >= -0.03)
            && (!useRSIFilter || rsiValue >= 40)
        /// The mirror of `hasCountertrendTailwind`, reflected around a flat MACD
        /// and RSI 50. Without it every "is the other side still alive" question
        /// could only be asked about longs.
        let hasCountertrendHeadwind = (!useMACDFilter || macdHistValue <= 0.03)
            && (!useRSIFilter || rsiValue <= 60)
        let priceAboveEMA20 = ema20.map { lastClose >= $0 } ?? false
        let priceAboveEMA50 = ema50.map { lastClose >= $0 } ?? false
        let priceAboveEMA200 = ema200.map { lastClose >= $0 } ?? false
        let distanceFromEMA20Pct = ema20.map { abs(lastClose - $0) / max(lastClose, 0.000001) * 100.0 } ?? 0

        // P0: Correct regime label if EMA200 claim contradicts actual price vs EMA200 relationship.
        // The AI sometimes generates "below EMA200" when price is actually above (or vice versa).
        // We fix this by checking the actual EMA200 value against the current price.
        let correctedRegimeLabel: String = {
            guard let ema200 else { return regimeLabel }
            let labelLower = regimeLabel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let claimsBelow = labelLower.contains("below ema200")
            let claimsAbove = labelLower.contains("above ema200")
            let actuallyBelow = lastClose < ema200
            let actuallyAbove = lastClose >= ema200

            // If the label claims below but price is above, fix it
            if claimsBelow && actuallyAbove {
                return regimeLabel
                    .replacingOccurrences(of: "(below EMA200)", with: "(above EMA200)", options: .caseInsensitive)
                    .replacingOccurrences(of: "below EMA200", with: "above EMA200", options: .caseInsensitive)
            }
            // If the label claims above but price is below, fix it
            if claimsAbove && actuallyBelow {
                return regimeLabel
                    .replacingOccurrences(of: "(above EMA200)", with: "(below EMA200)", options: .caseInsensitive)
                    .replacingOccurrences(of: "above EMA200", with: "below EMA200", options: .caseInsensitive)
            }
            return regimeLabel
        }()

        let regimeLower = correctedRegimeLabel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let regimeLabelLooksRangeLike = regimeLower.contains("range")
            || regimeLower.contains("consolidation")
            || regimeLower.contains("sideways")
        let isBearishTrendRegime = regimeLower.contains("bearish trend")
        let isBearishPullbackRegime = regimeLower.contains("bearish pullback")
        let isBullishTrendRegime = regimeLower.contains("bullish trend")
        let isBullishReboundRegime = regimeLower.contains("bullish rebound")
        let isBullishPullbackRegime = regimeLower.contains("bullish pullback")
        let isBearishReboundRegime = regimeLower.contains("bearish rebound")
        let isBearishReversalRegime = regimeLower.contains("bearish reversal")
        let isBullishReversalRegime = regimeLower.contains("bullish reversal")
        let isBelowEMA200Regime = regimeLower.contains("below ema200")

        let dominantBias: String = {
            // EMA20/EMA50 cross gives the trend direction.
            // Price must be above/below EMA50 (not EMA20) to confirm bias — this keeps longs
            // active during pullbacks to EMA20 (still above EMA50 = still bullish), and keeps
            // shorts active during bounces off EMA20 (still below EMA50 = still bearish).
            guard useEMAFilter else { return "Neutral" }
            guard let ema20, let ema50 else { return "Neutral" }
            let emaSeparation = abs(ema20 - ema50) / max(abs(ema50), 0.000001)

            // Symmetric by construction: a market and its mirror image have to
            // produce mirrored labels. They did not. A downtrend had to clear
            // three extra confirmations that the matching uptrend never faced,
            // so falling markets were called Neutral where rising ones were
            // called Bullish, and the whole engine downstream reads this label.
            //
            // Measured on the cached universe before the fix: in bearish regimes
            // the engine offered 1.4 long setups per short, against 19 longs per
            // short in bullish regimes, on a sample that ends higher in 44 series
            // and lower in 46. See tools/ENGINE_EVAL.md.
            let priceBelowEMA50 = lastClose <= ema50

            if isRangeEnvironment {
                if emaSeparation < 0.012 { return "Neutral" }
                if ema20 > ema50, priceAboveEMA50, hasCountertrendTailwind { return "Bullish" }
                if ema20 < ema50, priceBelowEMA50, hasCountertrendHeadwind { return "Bearish" }
                return "Neutral"
            }

            if useADXFilter, adxValue < 15, emaSeparation < 0.005 { return "Neutral" }
            if ema20 > ema50, priceAboveEMA50 { return "Bullish" }
            if ema20 < ema50, priceBelowEMA50 { return "Bearish" }
            return "Neutral"
        }()

        let tfMinutes = minutes
        let isVeryShortTF = tfMinutes > 0 && tfMinutes <= 15
        let isUltraShortTF = tfMinutes > 0 && tfMinutes <= 30
        let isLowTF = tfMinutes > 0 && tfMinutes <= 60
        let useDedicatedLowTFStrategy = isCryptoSymbol && tfMinutes > 0 && tfMinutes <= 30
        let volumeLower = volumeState.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let isLowVolume = volumeLower == "low"
        let volRatio = volumeLastToAvg20 ?? 0
        let volPct = volatilityPct ?? 0
        let volumeOkayForTrend: Bool = {
            guard useVolumeFilter else { return true }
            guard isVeryShortTF else { return true }

            // 15m behavior varies strongly by asset class.
            if isCryptoSymbol {
                // Crypto 15m: still require decent participation, but don't block majors in strong ADX trends.
                if isLowVolume {
                    if isCryptoMajorSymbol {
                        return (!useADXFilter || adxValue >= 28) || volRatio >= 0.95
                    }
                    // Alts: "Low" is common on 15m (session effects + noisy tick volume).
                    // Allow trend setups when either relative volume is reasonable, or volatility+ADX indicate
                    // real movement despite muted volume classification.
                    if volRatio >= 0.80 { return true }
                    if volPct >= 0.90 && (!useADXFilter || adxValue >= 22) { return true }
                    return false
                }
                return true
            }
            if isEquitySymbol {
                // Equities 15m: volume is often labeled "low" midday; allow trend setups if ratio isn't extreme.
                return volRatio >= 0.70
            }
            return isLowVolume == false
        }()
        let strongBullMomentum = macdIsBullish && rsiValue >= 52
        let macdIsBearish = useMACDFilter ? (macdHistValue < 0) : true
        let strongBearMomentum = (useMACDFilter ? (macdHistValue < 0) : true) && rsiValue <= 48
        let stochIsRollingDown = (stochK ?? 50) < (stochD ?? 50)
        let stochIsRollingUp = (stochK ?? 50) > (stochD ?? 50)
        let stochIsOverbought = useRSIFilter && ((stochK ?? 50) >= 85)
        let stochIsOversold = useRSIFilter && ((stochK ?? 50) <= 15)
        let obvIsFalling = (obvDelta ?? 0) < 0
        let obvIsRising = (obvDelta ?? 0) > 0
        let rocValue = roc14Pct ?? 0
        let rocIsFalling = rocValue < -0.30
        let rocIsRising = rocValue > 0.30
        let regressionSlopeValue = regressionSlopePct ?? 0
        let regressionIsFalling = regressionSlopeValue < -0.005
        let regressionIsRising = regressionSlopeValue > 0.005
        let trendStrengthValue = trendStrength ?? 0
        let normalizedPatternSignals = patternSignals.map { $0.lowercased() }
        let normalizedDivergenceSignals = divergenceSignals.map { $0.lowercased() }
        let hasBearishPattern = normalizedPatternSignals.contains { signal in
            signal.contains("bearish")
                || signal.contains("evening star")
                || signal.contains("shooting")
                || signal.contains("descending triangle")
                || signal.contains("double top")
                || signal.contains("head and shoulders")
        }
        let hasBullishPattern = normalizedPatternSignals.contains { signal in
            signal.contains("bullish")
                || signal.contains("morning star")
                || signal.contains("hammer")
                || signal.contains("ascending triangle")
                || signal.contains("double bottom")
                || signal.contains("inverse head")
        }
        let patternVolumeConfirms = useVolumeFilter == false
            || volumeLower == "high"
            || volumeLower == "elevated"
            || volRatio >= 1.05
        let bearishPatternHasContext = hasBearishPattern
            && patternVolumeConfirms
            && (!useADXFilter || adxValue >= 18)
            && (regressionIsFalling || macdHistValue < 0 || trendStrengthValue < -0.05 || stochIsRollingDown)
        let bullishPatternHasContext = hasBullishPattern
            && patternVolumeConfirms
            && (!useADXFilter || adxValue >= 18)
            && (regressionIsRising || macdHistValue > 0 || trendStrengthValue > 0.05 || stochIsRollingUp)
        let hasBearishDivergence = normalizedDivergenceSignals.contains { signal in
            signal.contains("bearish") || signal.contains("negative")
        }
        let hasBullishDivergence = normalizedDivergenceSignals.contains { signal in
            signal.contains("bullish") || signal.contains("positive")
        }
        let isBullishExhausted = useRSIFilter && (rsiValue >= 70 || stochIsOverbought)
        let isBearishExhausted = useRSIFilter && (rsiValue <= 30 || stochIsOversold)

        enum RegimeLayer: String {
            case trending = "Trending"
            case ranging = "Ranging"
            case volatileExpansion = "Volatile expansion"
            case compression = "Compression"
            case reversalEnvironment = "Reversal environment"
        }

        let volatilityRegimeLower = volatilityRegimeLabel?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let volatilityIsHigh = volatilityRegimeLower == "high" || (volatilityRegimePercentile ?? 0) >= 80 || (volPct >= (isYahooFX ? 0.75 : 3.0))
        let volatilityIsLow = volatilityRegimeLower == "low" || (volatilityRegimePercentile ?? 100) <= 30 || (volPct > 0 && volPct <= (isYahooFX ? 0.18 : 0.90))
        let hasBearishReversalPressure = bearishPatternHasContext || hasBearishDivergence || (isBullishExhausted && (stochIsRollingDown || macdHistValue < 0 || obvIsFalling || regressionIsFalling))
        let hasBullishReversalPressure = bullishPatternHasContext || hasBullishDivergence || (isBearishExhausted && (stochIsRollingUp || macdHistValue > 0 || obvIsRising || regressionIsRising))
        let hasOpposingReversalPressure = (dominantBias == "Bullish" && hasBearishReversalPressure)
            || (dominantBias == "Bearish" && hasBullishReversalPressure)
            || (isBullishTrendRegime && hasBearishReversalPressure)
            || (isBearishTrendRegime && hasBullishReversalPressure)
        let trendStateLabel: String = {
            let strength = abs(trendStrengthValue)
            if hasOpposingReversalPressure || (isBullishExhausted && trendStrengthValue > 0) || (isBearishExhausted && trendStrengthValue < 0) {
                return "Exhausted trend"
            }
            if structureLooksRangeLike || (useADXFilter && adxValue < 16) || strength < 0.04 {
                return "Transitioning trend"
            }
            if strength >= 0.20 || adxValue >= 32 {
                return "Strong trend"
            }
            if strength >= 0.10 || adxValue >= 22 {
                return "Healthy trend"
            }
            return "Weak trend"
        }()
        let regimeLayer: RegimeLayer = {
            if hasOpposingReversalPressure {
                return .reversalEnvironment
            }
            if regimeLabelLooksRangeLike {
                return volatilityIsHigh ? .volatileExpansion : .ranging
            }
            if isRangeEnvironment {
                return volatilityIsHigh ? .volatileExpansion : .ranging
            }
            if volatilityIsLow && (!useADXFilter || adxValue < 18) && abs(trendStrengthValue) < 0.12 {
                return .compression
            }
            if volatilityIsHigh && (!isTrendingEnvironment || structureLooksRangeLike || hasBearishReversalPressure || hasBullishReversalPressure) {
                return .volatileExpansion
            }
            if isTrendingEnvironment {
                return .trending
            }
            return volatilityIsLow ? .compression : .ranging
        }()

        let regimeLayerLabel = regimeLayer.rawValue

        func isContinuationLike(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let text = setupText(setup)
            return text.contains("continuation")
                || text.contains("breakout")
                || text.contains("breakdown")
                || text.contains("pullback")
                || text.contains("trend resumes")
        }

        func hasLateTrendExhaustionCluster(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            guard useRSIFilter, isContinuationLike(setup) else { return false }
            let isBullish = setup.direction.lowercased().contains("bull")
            let isBearish = setup.direction.lowercased().contains("bear")
            let emaDistanceThreshold: Double = {
                if isYahooFX { return kind == .intraday ? 0.18 : 0.32 }
                if isCryptoSymbol { return kind == .intraday ? 1.15 : 1.80 }
                return kind == .intraday ? 0.70 : 1.20
            }()
            let levelWindowPct = max(atr / max(lastClose, 0.000001) * 100.0 * 1.25, isYahooFX ? 0.12 : 0.45)
            if isBullish {
                let nearResistance = distanceToResistancePct.map { $0 >= 0 && $0 <= levelWindowPct } ?? false
                return rsiValue > 74
                    && (stochK ?? 50) > 92
                    && distanceFromEMA20Pct >= emaDistanceThreshold
                    && nearResistance
            }
            if isBearish {
                let nearSupport = distanceToSupportPct.map { $0 >= 0 && $0 <= levelWindowPct } ?? false
                return rsiValue < 26
                    && (stochK ?? 50) < 8
                    && distanceFromEMA20Pct >= emaDistanceThreshold
                    && nearSupport
            }
            return false
        }

        func hasChopContinuationCluster(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            guard isContinuationLike(setup) else { return false }
            let weakVolume = useVolumeFilter && (isLowVolume || (volRatio > 0 && volRatio < 0.85))
            let weakTrend = useADXFilter && adxValue < (isCryptoSymbol ? 18 : 16)
            let compressed = regimeLayer == .compression || volatilityIsLow || structureLayer.isRangeLike
            return (regimeLayer == .ranging || compressed)
                && weakTrend
                && weakVolume
                && structureLooksRangeLike
        }

        let veryShortTrendStrengthOkay = !useADXFilter || adxValue >= 20
        let inHardBearishContext = isBearishTrendRegime && isBelowEMA200Regime && structureIsBearish && dominantBias == "Bearish"
        let inHardBullishContext = isBullishTrendRegime && !isBelowEMA200Regime && structureIsBullish && dominantBias == "Bullish"
        let strongBullishReversalSignal = isOversold
            && macdIsBullish
            && rsiValue <= 30
            && (useADXFilter == false || adxValue <= 22)
        let isOverbought = useRSIFilter && (rsiValue >= 68)
        let strongBearishReversalSignal = isOverbought
            && macdIsBearish
            && rsiValue >= 70
            && (useADXFilter == false || adxValue <= 22)
        let allowLowTFBreakoutContinuation = {
            if isVeryShortTF {
                return isBullishTrendRegime
                    && !isBelowEMA200Regime
                    && dominantBias == "Bullish"
                    && priceAboveEMA20
                    && priceAboveEMA50
                    && strongBullMomentum
                    && rsiValue >= 54
                    && rsiValue <= 62
                    && veryShortTrendStrengthOkay
                    && volumeOkayForTrend
                    && !isRangeEnvironment
            }
            if isLowTF {
                return (
                    isBullishTrendRegime
                    || (isBullishReboundRegime && !isBelowEMA200Regime && priceAboveEMA50)
                ) && priceAboveEMA20
                    && priceAboveEMA50
                    && strongBullMomentum
                    && rsiValue <= 66
                    && !isRangeEnvironment
            }
            return true
        }()
        let allowVeryShortBearishShorts = !isVeryShortTF || (
            isBearishTrendRegime
                && isBelowEMA200Regime
                && strongBearMomentum
                && !priceAboveEMA50
                && !isRangeEnvironment
        )
        let allowLowTFBreakdownAcceptance = {
            if isVeryShortTF {
                return isBearishTrendRegime
                    && isBelowEMA200Regime
                    && dominantBias == "Bearish"
                    && strongBearMomentum
                    && !priceAboveEMA20
                    && !priceAboveEMA50
                    && rsiValue >= 38
                    && rsiValue <= 46
                    && veryShortTrendStrengthOkay
                    && volumeOkayForTrend
                    && !isRangeEnvironment
            }
            if isLowTF {
                if isUltraShortTF, isCryptoAltSymbol {
                    // 30m alts: avoid "acceptance" shorts in chop; require clean bear trend below EMA200.
                    return isBearishTrendRegime
                        && isBelowEMA200Regime
                        && strongBearMomentum
                        && !priceAboveEMA20
                        && !priceAboveEMA50
                        && rsiValue <= 46
                        && (!useADXFilter || adxValue >= 18)
                        && volumeOkayForTrend
                        && !isRangeEnvironment
                }
                // 1h (and above) needs stricter bearish confirmation on alts to avoid chop shorts.
                if minutes >= 60, isCryptoAltSymbol {
                    return isBearishTrendRegime
                        && isBelowEMA200Regime
                        && strongBearMomentum
                        && !priceAboveEMA50
                        && rsiValue <= 46
                        && (!useADXFilter || adxValue >= 18)
                        && !isRangeEnvironment
                }
                // For majors, require bearish pullbacks to be below EMA200 before shorting.
                if minutes >= 60 {
                    return (isBearishTrendRegime || (isBearishPullbackRegime && isBelowEMA200Regime))
                        && strongBearMomentum
                        && !priceAboveEMA50
                        && !isRangeEnvironment
                }
                return (isBearishTrendRegime || isBearishPullbackRegime)
                    && strongBearMomentum
                    && !priceAboveEMA50
                    && !isRangeEnvironment
            }
            return true
        }()
        let allowBullishContinuationSetups = {
            if isUltraShortTF {
                return isBullishTrendRegime
                    && !structureIsBearish
                    && priceAboveEMA50
                    && strongBullMomentum
                    && !isRangeEnvironment
            }
            if isLowTF {
                return (
                    isBullishTrendRegime
                    || (
                        (isBullishReboundRegime || isBullishPullbackRegime)
                        && priceAboveEMA20
                        && priceAboveEMA50
                        && strongBullMomentum
                    )
                ) && !structureIsBearish
                    && (dominantBias == "Bullish" || strongBullMomentum)
            }
            return (
                isBullishTrendRegime
                || isBullishReboundRegime
                || isBullishPullbackRegime
                || (!isBearishTrendRegime && !isBearishPullbackRegime && !isBearishReboundRegime && !isBelowEMA200Regime)
            ) && !structureIsBearish
                && (dominantBias == "Bullish" || strongBullMomentum || (hasCountertrendTailwind && priceAboveEMA20))
        }()
        let allowBullishRangeMeanReversion = {
            guard isRangeEnvironment, !inHardBearishContext else { return false }
            if useDedicatedLowTFStrategy { return false }
            if isUltraShortTF {
                return strongBullishReversalSignal && isLowVolume == false
            }
            return dominantBias != "Bearish" || strongBullMomentum || hasCountertrendTailwind
        }()
        let rangeLongConfirmation = isVeryShortTF
            ? (strongBullishReversalSignal && isLowVolume == false)
            : (hasCountertrendTailwind || strongBullMomentum || dominantBias == "Bullish")
        let breakoutLongConfirmation = allowBullishContinuationSetups && (
            isUltraShortTF
                ? (strongBullMomentum && priceAboveEMA50 && rsiValue >= 52 && rsiValue <= 68)
                : (isLowTF
                    ? (dominantBias == "Bullish" || strongBullMomentum || (hasCountertrendTailwind && rsiValue >= 48))
                    : (dominantBias != "Bearish" || hasCountertrendTailwind))
        )

        let experimentalSetupsEnabled = UserDefaults.standard.bool(forKey: "analysis.experimentalSetupsEnabled")
        let enableRangeRotation = experimentalSetupsEnabled || isYahooFX || isCryptoSymbol || isEquitySymbol
        let enableBreakoutAcceptance = experimentalSetupsEnabled || isCryptoSymbol || isEquitySymbol
        let enableCountertrendReclaim = true
        let enableBreakoutContinuationLong = experimentalSetupsEnabled || kind == .daily || isCryptoSymbol || isEquitySymbol
        let allowRangeRotation = enableRangeRotation
            && (allowShortTerm || (isYahooFX && (kind == .weekly || kind == .monthly)))

        let requiredVolRatio: Double
        if kind == .weekly || kind == .monthly {
            requiredVolRatio = 1.30
        } else if kind == .intraday, isEquitySymbol, minutes > 0 && minutes <= 60 {
            requiredVolRatio = 1.05
        } else if kind == .intraday, isCryptoSymbol, isCryptoAltSymbol, minutes > 0 && minutes <= 60 {
            requiredVolRatio = 1.08
        } else if kind == .intraday, isCryptoSymbol, minutes > 0 && minutes <= 60 {
            requiredVolRatio = 1.12
        } else {
            requiredVolRatio = 1.20
        }
        let pullbackVolFloor: Double = (kind == .intraday && isEquitySymbol && minutes > 0 && minutes <= 60) ? 0.85 : 0.95
        let hasPullbackVolumeConfirmation = useVolumeFilter ? (volRatio >= pullbackVolFloor || isLowVolume == false) : true
        let hasBreakdownVolumeConfirmation = useVolumeFilter ? (volRatio >= requiredVolRatio) : true
        let pullbackAdxOkay = useADXFilter ? (adxValue <= 35) : true

        func isBearishRejectionCandle(_ candle: Candle) -> Bool {
            let upperWick = candle.high - max(candle.open, candle.close)
            let body = abs(candle.close - candle.open)
            guard upperWick.isFinite, body.isFinite else { return false }
            // Prefer bearish/doji closes for rejection (avoid strong green candles).
            guard candle.close <= candle.open else { return false }
            if body == 0 { return upperWick > 0 }
            return upperWick >= body * 2.0
        }

        func isActionable(level: Double) -> Bool {
            guard lastClose > 0 else { return false }
            let distancePct = abs(level - lastClose) / lastClose
            let distanceAtr = atr > 0 ? abs(level - lastClose) / atr : distancePct * 100.0
            switch kind {
            case .intraday:
                return distancePct <= 0.20 || distanceAtr <= 6.0
            case .daily:
                return distancePct <= 0.24 || distanceAtr <= 7.0
            case .weekly:
                return distancePct <= 0.30 || distanceAtr <= 9.0
            case .monthly:
                return distancePct <= 0.40 || distanceAtr <= 12.0
            }
        }

        let fxNearbyLevels = fxNearbyReferenceLevels()
        let fxNearbyBelow = fxNearbyLevels.compactMap { level -> (value: Double, price: String, kind: String)? in
            guard level.kind == "support", let value = Double(level.price), value < lastClose else { return nil }
            return (value, level.price, level.kind)
        }
        let fxNearbyAbove = fxNearbyLevels.compactMap { level -> (value: Double, price: String, kind: String)? in
            guard level.kind == "resistance", let value = Double(level.price), value > lastClose else { return nil }
            return (value, level.price, level.kind)
        }

        var actionableBelow = below.filter { isActionable(level: $0.value) }
        var actionableAbove = above.filter { isActionable(level: $0.value) }
        if isYahooFX, atr > 0 {
            let nearbyWindow = fxNearbyWindowAtr()
            let nearbyBelow = below.filter { abs(lastClose - $0.value) / atr <= nearbyWindow }
            let nearbyAbove = above.filter { abs(lastClose - $0.value) / atr <= nearbyWindow }
            actionableBelow = nearbyBelow.isEmpty ? actionableBelow : nearbyBelow
            actionableAbove = nearbyAbove.isEmpty ? actionableAbove : nearbyAbove
            if actionableBelow.isEmpty { actionableBelow = fxNearbyBelow }
            if actionableAbove.isEmpty { actionableAbove = fxNearbyAbove }
        }
        let localSupport = actionableBelow.last
        let localResistance = actionableAbove.first
        let localNextSupport = actionableBelow.dropLast().last
        let localNextResistance = actionableAbove.dropFirst().first
        let distanceToResistancePct = localResistance.map { ($0.value - lastClose) / max(lastClose, 0.000001) * 100.0 }
        let distanceToSupportPct = localSupport.map { (lastClose - $0.value) / max(lastClose, 0.000001) * 100.0 }

        let scalpMult1 = 1.8, scalpMult2 = 2.6

        func shortTermMultipliers(for timeframe: String) -> (Double, Double) {
            let minutes = timeframeMinutes(from: timeframe) ?? 60
            if minutes <= 5 {
                return useDedicatedLowTFStrategy ? (1.2, 1.8) : (2.0, 3.2)      // 5m
            } else if minutes <= 15 {
                return useDedicatedLowTFStrategy ? (1.3, 2.0) : (2.6, 4.0)      // 15m
            } else if minutes <= 60 {
                return useDedicatedLowTFStrategy ? (1.5, 2.3) : (2.6, 4.0)      // 1h
            } else if minutes <= 240 {
                return (2.6, 4.0)      // 4h
            } else if minutes <= 1440 {
                return (2.4, 3.6)      // daily
            } else {
                return (2.2, 3.2)      // weekly+
            }
        }

        func fallbackTargetBelow(from anchor: Double, multiplier: Double) -> Double? {
            safe(anchor - atr * multiplier)
        }

        func fallbackTargetAbove(from anchor: Double, multiplier: Double) -> Double? {
            safe(anchor + atr * multiplier)
        }

        func fxMinStopDistance() -> Double {
            guard isYahooFX else { return max(atr * 0.22, lastClose * 0.0012) }
            let pipFloor = lastClose >= 20 ? 0.12 : 0.00035
            switch kind {
            case .intraday:
                return max(atr * 0.55, pipFloor)
            case .daily:
                return max(atr * 0.50, pipFloor * 1.6)
            case .weekly:
                return max(atr * 0.45, pipFloor * 2.2)
            case .monthly:
                return max(atr * 0.40, pipFloor * 3.0)
            }
        }

        func fxNearbyWindowAtr() -> Double {
            guard isYahooFX else { return 0 }
            switch kind {
            case .intraday:
                if minutes <= 15 { return 2.4 }
                if minutes <= 60 { return 3.2 }
                return 4.0
            case .daily:
                return 4.6
            case .weekly:
                return 6.0
            case .monthly:
                return 8.0
            }
        }

        func fxNearbyReferenceLevels() -> [ChartAnalysisPayload.KeyLevel] {
            guard isYahooFX, atr > 0 else { return [] }
            let distance = max(atr * 1.0, fxMinStopDistance())
            let supportValue = safe(lastClose - distance)
            let resistanceValue = safe(lastClose + distance)
            var generated: [ChartAnalysisPayload.KeyLevel] = []
            if let supportValue, supportValue < lastClose {
                generated.append(.init(price: fmt(supportValue), kind: "support", note: "ATR downside reference"))
            }
            if let resistanceValue, resistanceValue > lastClose {
                generated.append(.init(price: fmt(resistanceValue), kind: "resistance", note: "ATR upside reference"))
            }
            return generated
        }

        func swingMaxRiskDistance(for timeframeKind: TimeframeKind) -> Double {
            // Must be >= swingStop baseline (atr * 2.0). A tighter cap inflates computed R:R on
            // shorts (tiny denominator → big ratio), causing pickBestSetup to favour shorts whose
            // stop then gets clipped so tight that any minor bounce hits it.
            switch timeframeKind {
            case .intraday:
                return atr * 2.0
            case .daily:
                return atr * 2.0
            case .weekly:
                return atr * 2.2
            case .monthly:
                return atr * 2.5
            }
        }

        func cappedLongStop(entry: Double, anchor: Double?, fallback: Double) -> Double? {
            let structureBuffer = max(atr * 0.22, lastClose * 0.0025)
            let maxRiskDistance = max(swingMaxRiskDistance(for: kind), lastClose * 0.009)
            let structureStop = anchor.map { stopBelow($0, buffer: structureBuffer) }
            let candidate = structureStop ?? fallback
            let minimumStop = entry - maxRiskDistance
            return safe(max(candidate, minimumStop))
        }

        func cappedShortStop(entry: Double, anchor: Double?, fallback: Double) -> Double? {
            let structureBuffer = max(atr * 0.22, lastClose * 0.0025)
            let maxRiskDistance = max(swingMaxRiskDistance(for: kind), lastClose * 0.009)
            let structureStop = anchor.map { stopAbove($0, buffer: structureBuffer) }
            let candidate = structureStop ?? fallback
            let maximumStop = entry + maxRiskDistance
            return safe(min(candidate, maximumStop))
        }

        func baseNotes(horizon: String) -> [String] {
            var notes: [String] = []
            notes.append("Regime layer: \(regimeLayerLabel).")
            notes.append("Regime: \(regimeLabel).")
            notes.append("Structure: \(structure).")
            if let first = confluence.first {
                notes.append(first)
            }
            if let ema20, let ema50 {
                notes.append(ema20 >= ema50 ? "EMA20>EMA50" : "EMA20<EMA50")
            }
            if let ema50, let ema200 {
                notes.append(ema50 >= ema200 ? "EMA50>EMA200" : "EMA50<EMA200")
            }
            notes.append("Trend state: \(trendStateLabel).")
            notes.append("Horizon: \(horizon).")
            return notes
        }

        /// Build human-readable rationale explaining WHY a setup is generated.
        func buildRationale(direction: String, entry: Double, stop: Double, horizon: String, setupType: String) -> [String] {
            var lines: [String] = []
            let isLong = direction.lowercased().contains("bull") || direction.lowercased().contains("long")

            // 1. Market context
            lines.append("Market regime: \(regimeLabel) — \(structure).")

            // 2. EMA alignment
            if useEMAFilter {
                if let ema20, let ema50 {
                    let emaDesc: String
                    if ema20 > ema50 {
                        emaDesc = "EMA(20) is above EMA(50) — short-term trend favors bulls"
                    } else if ema20 < ema50 {
                        emaDesc = "EMA(20) is below EMA(50) — short-term trend favors bears"
                    } else {
                        emaDesc = "EMA(20) ≈ EMA(50) — trend is flat"
                    }
                    let pricePos = priceAboveEMA20
                        ? (priceAboveEMA50 ? "Price is above both EMAs." : "Price is above EMA(20) but below EMA(50).")
                        : (priceAboveEMA50 ? "Price is below EMA(20) but holding EMA(50)." : "Price is below both EMAs.")
                    lines.append("\(emaDesc). \(pricePos)")
                }
                if let ema200 {
                    lines.append(priceAboveEMA200
                        ? "Price holds above EMA(200) (\(fmt(ema200))) — long-term trend intact."
                        : "Price is below EMA(200) (\(fmt(ema200))) — long-term trend is bearish.")
                }
            }

            // 3. RSI
            if useRSIFilter {
                let rsiLabel: String
                if rsiValue <= 30 { rsiLabel = "oversold" }
                else if rsiValue <= 40 { rsiLabel = "weak" }
                else if rsiValue <= 60 { rsiLabel = "neutral" }
                else if rsiValue <= 70 { rsiLabel = "strong" }
                else { rsiLabel = "overbought" }
                lines.append("RSI(14) at \(Int(rsiValue)) (\(rsiLabel))" + (isLong
                    ? (rsiValue <= 40 ? " — potential bounce zone." : rsiValue >= 70 ? " — momentum may be stretched." : ".")
                    : (rsiValue >= 60 ? " — potential rejection zone." : rsiValue <= 30 ? " — momentum may be exhausted." : ".")))
            }

            // 4. MACD
            if useMACDFilter {
                let histDir = macdHistValue >= 0 ? "positive" : "negative"
                let alignment = (isLong && macdHistValue >= 0) || (!isLong && macdHistValue < 0) ? "supports" : "diverges from"
                lines.append("MACD histogram is \(histDir) — \(alignment) this \(isLong ? "long" : "short") setup.")
            }

            // 5. ADX
            if useADXFilter {
                let trendStr: String
                if adxValue < 15 { trendStr = "no clear trend" }
                else if adxValue < 25 { trendStr = "moderate trend" }
                else if adxValue < 40 { trendStr = "strong trend" }
                else { trendStr = "very strong trend" }
                let diStr: String
                if let diPlus = adx.plusDI, let diMinus = adx.minusDI {
                    diStr = diPlus > diMinus ? " (+DI > -DI: buyers lead)" : " (-DI > +DI: sellers lead)"
                } else { diStr = "" }
                lines.append("ADX(14) at \(Int(adxValue)) (\(trendStr))\(diStr).")
            }

            // 6. Volume
            if useVolumeFilter {
                let volDesc: String
                let lowerVolume = volumeState.lowercased()
                let isDirectionalContinuation = setupType.lowercased().contains("continuation")
                    || setupType.lowercased().contains("breakout")
                    || setupType.lowercased().contains("breakdown")
                    || setupType.lowercased().contains("pullback")
                switch lowerVolume {
                case "high", "elevated":
                    if regimeLayer == .compression {
                        volDesc = "Volume is expanding out of compression — breakout potential is higher."
                    } else if (isLong && hasBearishReversalPressure) || (!isLong && hasBullishReversalPressure) {
                        volDesc = "High volume appears near reversal pressure — trap risk is elevated."
                    } else {
                        volDesc = "Volume is elevated — confirms participation."
                    }
                case "low":
                    volDesc = isDirectionalContinuation
                        ? "Volume is low — continuation needs confirmation before trust."
                        : "Volume is low — conviction is limited."
                default:
                    if isDirectionalContinuation && volRatio > 0 && volRatio < 0.85 {
                        volDesc = "Relative volume is fading — continuation quality is reduced."
                    } else {
                        volDesc = "Volume is normal."
                    }
                }
                lines.append(volDesc)
            }

            // 7. Key level context
            if let entryLevel = numericLevels.first(where: { abs($0.value - entry) / max(entry, 1) < 0.002 }) {
                let note = entryLevel.kind.lowercased().contains("support")
                    ? "Entry near \(entryLevel.price) (\(entryLevel.kind)) — historical support level."
                    : "Entry near \(entryLevel.price) (\(entryLevel.kind)) — historical resistance level."
                lines.append(note)
            }

            // 8. Environment
            if regimeLayer == .trending {
                lines.append("Environment classified as trending (\(trendStateLabel)) — favors breakout/continuation setups when momentum agrees.")
            } else if regimeLayer == .ranging {
                lines.append("Environment classified as range-bound — favors mean-reversion setups.")
            }

            // 9. Volatility context
            if let vPct = volatilityPct {
                if vPct <= 0.5 {
                    lines.append("Low volatility regime — tight stops are viable but breakouts need confirmation.")
                } else if vPct >= 2.0 {
                    lines.append("High volatility — wider stops used to avoid premature stop-outs.")
                }
            }

            return lines
        }

    /// Retired 2026-08-22. This intercepted every FX chart between 15m and 4h and,
    /// in practice, always returned a watch setup: on eight pairs over four
    /// timeframes the whole intraday range produced *zero* tradable ideas, while
    /// gold on the same data source and the same bar count produced hundreds.
    ///
    /// The reason it looked defensible was a measurement bug. The harness charged
    /// one crypto-shaped cost (8 bps fee, 2 bps slippage) to every instrument.
    /// Cost is a fraction of price and a result is expressed in R, so on a pair
    /// whose stop is six pips wide that came to 3.6R of fees per trade before the
    /// market moved. With realistic FX costs the picture changes: forex through
    /// the ordinary generator reads -0.053R against -0.028R for this dedicated
    /// path, on three times as many setups, and its 1h bucket is +0.004R.
    ///
    /// Neither number is an edge. But "no edge, and you can see the setups" beats
    /// "no edge, and the screen is empty", so forex now runs the same road as
    /// every other instrument. Kept here rather than deleted because the pip
    /// helpers inside are worth re-reading if forex ever gets its own model.
        func fxDedicatedSetups() -> [ChartAnalysisPayload.TradeSetup]? {
            guard fxUsesDedicatedStrategy, isYahooFX else { return nil }
            guard [15, 30, 60, 120, 240].contains(minutes) else { return nil }

            let regimeIsRange = regimeLower.contains("range") || regimeLower.contains("consolid")
            let regimeIsBullish = isBullishTrendRegime || isBullishReboundRegime || isBullishReversalRegime || dominantBias == "Bullish"
            let regimeIsBearish = isBearishTrendRegime || isBearishPullbackRegime || isBearishReversalRegime || dominantBias == "Bearish"

            let fxBase = String(symbolUpper.dropLast(2))
            let fxQuote = String(fxBase.suffix(3))

            let fxBaseCurrency = String(fxBase.prefix(3))
            let fxIsJPYPair = fxQuote == "JPY"
            let fxIsMajorNonJPY = !fxIsJPYPair && (fxBaseCurrency == "USD" || fxQuote == "USD")
            let fxIsCross = !fxIsJPYPair && !fxIsMajorNonJPY

            func fxDecimals() -> Int {
                fxQuote == "JPY" ? 3 : 4
            }

            func fxStep() -> Double {
                fxQuote == "JPY" ? 0.01 : 0.0005
            }

            func fmtFX(_ value: Double) -> String {
                String(format: "%.\(fxDecimals())f", value)
            }

            func fxRounded(_ value: Double) -> Double {
                let step = fxStep()
                guard step > 0 else {
                    let scale = pow(10.0, Double(fxDecimals()))
                    return (value * scale).rounded() / scale
                }
                return (value / step).rounded() * step
            }

            func fxPairFloorDistance() -> Double {
                if fxIsJPYPair { return 0.09 }
                if fxIsMajorNonJPY { return 0.00045 }
                if fxIsCross { return 0.00055 }
                return fxStep()
            }

            func fxRRCap(for horizon: String) -> Double {
                if horizon == "Swing" {
                    return fxIsJPYPair ? 8.5 : (fxIsCross ? 7.5 : 9.0)
                }
                return fxIsJPYPair ? 7.0 : (fxIsCross ? 6.0 : 7.5)
            }

            func fxRRIsAcceptable(entry: Double, stop: Double, target: Double, horizon: String) -> Bool {
                guard let value = rrValue(entry: entry, stop: stop, target: target) else { return false }
                return value >= minRR(for: horizon) && value <= fxRRCap(for: horizon)
            }

            func syntheticSupport() -> (value: Double, price: String, kind: String)? {
                let distance = max(atr * 1.0, lastClose * 0.0004)
                let value = fxRounded(lastClose - distance)
                guard value > 0, value < lastClose else { return nil }
                return (value, fmtFX(value), "support")
            }

            func syntheticResistance() -> (value: Double, price: String, kind: String)? {
                let distance = max(atr * 1.0, lastClose * 0.0004)
                let value = fxRounded(lastClose + distance)
                guard value > lastClose else { return nil }
                return (value, fmtFX(value), "resistance")
            }

            let supportLevel = localSupport ?? syntheticSupport()
            let resistanceLevel = localResistance ?? syntheticResistance()

            guard let supportLevel, let resistanceLevel else { return nil }

            func fxStopBelow(_ anchor: Double, bufferMultiplier: Double) -> Double? {
                safe(anchor - max(atr * bufferMultiplier, fxMinStopDistance(), fxPairFloorDistance()))
            }

            func fxStopAbove(_ anchor: Double, bufferMultiplier: Double) -> Double? {
                safe(anchor + max(atr * bufferMultiplier, fxMinStopDistance(), fxPairFloorDistance()))
            }

            let bullishPressure = priceAboveEMA20 && priceAboveEMA50 && (priceAboveEMA200 || minutes <= 60) && (adx.plusDI ?? 0) > (adx.minusDI ?? 0)
            let bearishPressure = (!priceAboveEMA20 || !priceAboveEMA50 || !priceAboveEMA200) && (adx.minusDI ?? 0) > (adx.plusDI ?? 0)
            let canFadeRangeLong = !bearishPressure || dominantBias == "Bullish"
            let canFadeRangeShort = !bullishPressure || dominantBias == "Bearish"

            func isNear(_ level: Double, atrMult: Double) -> Bool {
                guard atr > 0 else { return abs(lastClose - level) / max(lastClose, 0.000001) <= 0.003 }
                return abs(lastClose - level) / atr <= atrMult
            }

            func enriched(_ setup: ChartAnalysisPayload.TradeSetup) -> ChartAnalysisPayload.TradeSetup {
                guard setup.rationale.isEmpty else { return setup }
                let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                var updated = setup
                updated.rationale = buildRationale(
                    direction: setup.direction,
                    entry: entryValue,
                    stop: stopValue,
                    horizon: setup.horizon,
                    setupType: setup.setup
                )
                return updated
            }

            func decisionWatch(name: String, trigger: String, targets: [String], rationale: [String]) -> [ChartAnalysisPayload.TradeSetup] {
                [
                    ChartAnalysisPayload.TradeSetup(
                        horizon: minutes <= 60 ? "Short-term" : "Swing",
                        direction: "Neutral",
                        setup: name,
                        trigger: trigger,
                        entry: nil,
                        stop: nil,
                        targets: [],
                        rr: nil,
                        notes: baseNotes(horizon: minutes <= 60 ? "Short-term" : "Swing") + ["FX dedicated strategy: confirmation-first watch setup."],
                        rationale: rationale
                    )
                ]
            }

            let nearSupport = isNear(supportLevel.value, atrMult: minutes <= 30 ? 1.0 : 1.3)
            let nearResistance = isNear(resistanceLevel.value, atrMult: minutes <= 30 ? 1.0 : 1.3)
            let horizon = minutes <= 30 ? "Short-term" : "Swing"
            let distanceToResistance = max(resistanceLevel.value - lastClose, 0)
            let distanceToSupport = max(lastClose - supportLevel.value, 0)
            let shouldPreferBullishBreakoutWatch = regimeIsRange
                && bullishPressure
                && nearResistance
                && atr > 0
                && distanceToResistance <= max(atr * (minutes <= 30 ? 0.95 : 1.10), fxMinStopDistance() * 1.05)
                && distanceToSupport > distanceToResistance * 1.1

            if regimeIsRange {
                if shouldPreferBullishBreakoutWatch {
                    return decisionWatch(
                        name: "FX breakout watch",
                        trigger: "Watch for hold above \(resistanceLevel.price)",
                        targets: [resistanceLevel.price, nextResistance?.price ?? fmtFX(fxRounded(resistanceLevel.value + max(atr * 1.2, fxMinStopDistance())))],
                        rationale: [
                            "Bullish FX pressure is already pressing directly under nearby resistance.",
                            "A hold above \(resistanceLevel.price) is a better trigger than forcing a range entry late in the box.",
                            "Support at \(supportLevel.price) remains the nearby invalidation reference."
                        ]
                    )
                }

                if nearSupport, canFadeRangeLong, let stop = fxStopBelow(supportLevel.value, bufferMultiplier: 0.55) {
                    let candidates = [
                        resistanceLevel.value,
                        nextResistance?.value,
                        fallbackTargetAbove(from: max(supportLevel.value, lastClose), multiplier: 1.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: supportLevel.value, stop: stop, candidates: candidates, horizon: horizon),
                       fxRRIsAcceptable(entry: supportLevel.value, stop: stop, target: picked.t1, horizon: horizon) {
                        let setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bullish",
                            setup: "FX range rotation long",
                            trigger: "Acceptance above \(supportLevel.price)",
                            entry: fmt(supportLevel.value),
                            stop: fmt(stop),
                            targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                            rr: rr(entry: supportLevel.value, stop: stop, target: picked.t1),
                            notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: range-edge long."],
                            rationale: []
                        )
                        return [enriched(setup)]
                    }
                }

                if nearResistance, canFadeRangeShort, let stop = fxStopAbove(resistanceLevel.value, bufferMultiplier: 0.55) {
                    let candidates = [
                        supportLevel.value,
                        nextSupport?.value,
                        fallbackTargetBelow(from: min(resistanceLevel.value, lastClose), multiplier: 1.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: resistanceLevel.value, stop: stop, candidates: candidates, horizon: horizon),
                       fxRRIsAcceptable(entry: resistanceLevel.value, stop: stop, target: picked.t1, horizon: horizon) {
                        let setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bearish",
                            setup: "FX range rotation short",
                            trigger: "Acceptance below \(resistanceLevel.price)",
                            entry: fmt(resistanceLevel.value),
                            stop: fmt(stop),
                            targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                            rr: rr(entry: resistanceLevel.value, stop: stop, target: picked.t1),
                            notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: range-edge short."],
                            rationale: []
                        )
                        return [enriched(setup)]
                    }
                }

                return decisionWatch(
                    name: "FX range-edge watch",
                    trigger: "Wait for reclaim above \(resistanceLevel.price) or breakdown below \(supportLevel.price)",
                    targets: [resistanceLevel.price, supportLevel.price],
                    rationale: [
                        "Price is still between nearby FX range boundaries.",
                        "A move back above \(resistanceLevel.price) improves the bullish continuation path.",
                        "A move below \(supportLevel.price) weakens the range and opens the bearish path."
                    ]
                )
            }

            if regimeIsBullish {
                if nearSupport, let stop = fxStopBelow(supportLevel.value, bufferMultiplier: 0.50) {
                    let candidates = [
                        resistanceLevel.value,
                        nextResistance?.value,
                        fallbackTargetAbove(from: max(lastClose, supportLevel.value), multiplier: 1.8)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: supportLevel.value, stop: stop, candidates: candidates, horizon: horizon),
                       fxRRIsAcceptable(entry: supportLevel.value, stop: stop, target: picked.t1, horizon: horizon) {
                        let setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bullish",
                            setup: "FX pullback continuation long",
                            trigger: "Pullback holds \(supportLevel.price) and reclaims trend structure",
                            entry: fmt(supportLevel.value),
                            stop: fmt(stop),
                            targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                            rr: rr(entry: supportLevel.value, stop: stop, target: picked.t1),
                            notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: trend pullback setup."],
                            rationale: []
                        )
                        return [enriched(setup)]
                    }
                }

                if nearResistance {
                    if let stop = fxStopBelow(supportLevel.value, bufferMultiplier: 0.45) {
                        let entry = resistanceLevel.value
                        let candidates = [
                            nextResistance?.value,
                            actionableAbove.dropFirst(2).first?.value,
                            fallbackTargetAbove(from: max(entry, lastClose), multiplier: 1.8)
                        ].compactMap { $0 }
                        if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: horizon),
                           fxRRIsAcceptable(entry: entry, stop: stop, target: picked.t1, horizon: horizon) {
                            let setup = ChartAnalysisPayload.TradeSetup(
                                horizon: horizon,
                                direction: "Bullish",
                                setup: "FX breakout continuation long",
                                trigger: "Break and hold above \(resistanceLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: picked.t1),
                                notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: breakout continuation setup."],
                                rationale: []
                            )
                            return [enriched(setup)]
                        }
                    }

                    return decisionWatch(
                        name: "FX breakout watch",
                        trigger: "Watch for hold above \(resistanceLevel.price)",
                        targets: [resistanceLevel.price, (localNextResistance ?? nextResistance)?.price].compactMap { $0 },
                        rationale: [
                            "Bullish FX context is pressing directly under nearby resistance.",
                            "A hold above \(resistanceLevel.price) confirms continuation instead of forcing an early entry.",
                            "Support at \(supportLevel.price) is the nearby invalidation reference."
                        ]
                    )
                }
            }

            if regimeIsBearish {
                if nearResistance, let stop = fxStopAbove(resistanceLevel.value, bufferMultiplier: 0.50) {
                    let entry = resistanceLevel.value
                    let candidates = [
                        supportLevel.value,
                        nextSupport?.value,
                        fallbackTargetBelow(from: min(lastClose, resistanceLevel.value), multiplier: 1.8)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: horizon),
                       fxRRIsAcceptable(entry: entry, stop: stop, target: picked.t1, horizon: horizon) {
                        let setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bearish",
                            setup: "FX pullback rejection short",
                            trigger: "Acceptance below \(resistanceLevel.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: picked.t1),
                            notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: bearish rejection setup."],
                            rationale: []
                        )
                        return [enriched(setup)]
                    }
                }

                if nearSupport {
                    if let stop = fxStopAbove(resistanceLevel.value, bufferMultiplier: 0.45) {
                        let entry = supportLevel.value
                        let candidates = [
                            nextSupport?.value,
                            actionableBelow.dropLast(2).last?.value,
                            fallbackTargetBelow(from: min(entry, lastClose), multiplier: 1.8)
                        ].compactMap { $0 }
                        if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: horizon),
                           fxRRIsAcceptable(entry: entry, stop: stop, target: picked.t1, horizon: horizon) {
                            let setup = ChartAnalysisPayload.TradeSetup(
                                horizon: horizon,
                                direction: "Bearish",
                                setup: "FX breakdown continuation short",
                                trigger: "Break and hold below \(supportLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: picked.t1),
                                notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: downside continuation setup."],
                                rationale: []
                            )
                            return [enriched(setup)]
                        }
                    }

                    return decisionWatch(
                        name: "FX breakdown watch",
                        trigger: "Watch for break below \(supportLevel.price)",
                        targets: [supportLevel.price, (localNextSupport ?? nextSupport)?.price].compactMap { $0 },
                        rationale: [
                            "Bearish FX context is pressing directly on nearby support.",
                            "A clean break below \(supportLevel.price) confirms continuation instead of forcing an early short entry.",
                            "Resistance at \(resistanceLevel.price) is the nearby invalidation reference."
                        ]
                    )
                }
            }

            // Final fallback: generate a pending/limit directional setup aligned with the regime
            if regimeIsBullish {
                if let stop = fxStopBelow(supportLevel.value, bufferMultiplier: 0.50) {
                    let candidates = [
                        resistanceLevel.value,
                        nextResistance?.value,
                        fallbackTargetAbove(from: supportLevel.value, multiplier: 1.8)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: supportLevel.value, stop: stop, candidates: candidates, horizon: horizon),
                       fxRRIsAcceptable(entry: supportLevel.value, stop: stop, target: picked.t1, horizon: horizon) {
                        let setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bullish",
                            setup: "FX limit long at support",
                            trigger: "Acceptance above \(supportLevel.price)",
                            entry: fmt(supportLevel.value),
                            stop: fmt(stop),
                            targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                            rr: rr(entry: supportLevel.value, stop: stop, target: picked.t1),
                            notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: limit entry at support in bullish trend context."],
                            rationale: []
                        )
                        return [enriched(setup)]
                    }
                }
            }

            if regimeIsBearish {
                if let stop = fxStopAbove(resistanceLevel.value, bufferMultiplier: 0.50) {
                    let entry = resistanceLevel.value
                    let candidates = [
                        supportLevel.value,
                        nextSupport?.value,
                        fallbackTargetBelow(from: resistanceLevel.value, multiplier: 1.8)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: horizon),
                       fxRRIsAcceptable(entry: entry, stop: stop, target: picked.t1, horizon: horizon) {
                        let setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bearish",
                            setup: "FX limit short at resistance",
                            trigger: "Acceptance below \(resistanceLevel.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: picked.t1),
                            notes: baseNotes(horizon: horizon) + ["FX dedicated strategy: limit entry at resistance in bearish trend context."],
                            rationale: []
                        )
                        return [enriched(setup)]
                    }
                }
            }

            return decisionWatch(
                name: "FX decision watch",
                trigger: "Wait for reclaim above \(resistanceLevel.price) or breakdown below \(supportLevel.price)",
                targets: [resistanceLevel.price, supportLevel.price],
                rationale: [
                    "FX price is between nearby decision levels without a clean asymmetric entry yet.",
                    "Break and hold above \(resistanceLevel.price) improves the bullish path.",
                    "Break below \(supportLevel.price) improves the bearish path."
                ]
            )
        }

        if let dedicatedFX = fxDedicatedSetups(), dedicatedFX.isEmpty == false {
            return dedicatedFX
        }

        let useDedicated15mStrategy = minutes == 15

        if useDedicated15mStrategy {
            var dedicatedSetups: [ChartAnalysisPayload.TradeSetup] = []
            dedicatedSetups.reserveCapacity(4)

            func isNearby(_ level: Double) -> Bool {
                guard atr > 0 else { return true }
                return abs(lastClose - level) / atr <= (isCryptoMajorSymbol ? 3.1 : 2.6)
            }

            func nearestLongPullbackEntry() -> Double? {
                let candidates = [
                    ema20,
                    ema50,
                    localSupport?.value,
                    support?.value
                ].compactMap { $0 }.filter { $0.isFinite && $0 > 0 && $0 < lastClose && isNearby($0) }
                return candidates.max()
            }

            func nearestShortRejectionEntry() -> Double? {
                let candidates = [
                    ema20,
                    ema50,
                    localResistance?.value,
                    resistance?.value
                ].compactMap { $0 }.filter { $0.isFinite && $0 > 0 && $0 > lastClose && isNearby($0) }
                // For 15m rejection shorts, the "nearest" overhead level (often EMA20) tends to get
                // tagged constantly and can whipsaw. Prefer higher-quality entries (closer to EMA50 / structure)
                // for majors to reduce churn.
                if isCryptoMajorSymbol {
                    return candidates.max()
                }
                return candidates.min()
            }

            let majorBullContextOk15m: Bool = {
                // For majors on 15m, longs below EMA200 tend to whipsaw. Only allow them when
                // the "bullish rebound" is truly momentum-backed.
                guard isCryptoMajorSymbol else { return true }
                if isBelowEMA200Regime {
                    return isBullishReboundRegime && strongBullMomentum && rsiValue >= 50
                }
                return priceAboveEMA200
            }()

            let bullish15mTrend = (isBullishTrendRegime || dominantBias == "Bullish" || isBullishReboundRegime)
                && (!isCryptoAltSymbol || isTrendingEnvironment)
                && priceAboveEMA20
                && (priceAboveEMA50 || isBullishReboundRegime)
                && (isCryptoAltSymbol ? strongBullMomentum : macdIsBullish)
                && rsiValue >= (isCryptoAltSymbol ? 50 : 43)
                && rsiValue <= (isCryptoMajorSymbol ? 66 : 64)
                && (!useADXFilter || adxValue >= (isCryptoAltSymbol ? 18 : 15))
                && !isRangeEnvironment
                && volumeOkayForTrend
                && majorBullContextOk15m

            let bearish15mTrend = (isBearishTrendRegime || isBearishPullbackRegime || dominantBias == "Bearish")
                && (!isCryptoAltSymbol || isTrendingEnvironment)
                && !priceAboveEMA20
                && (!isCryptoAltSymbol || isBelowEMA200Regime || strongBearMomentum)
                && strongBearMomentum
                && rsiValue >= 38
                && rsiValue <= (isCryptoAltSymbol ? 54 : 58)
                && (!useADXFilter || adxValue >= (isCryptoAltSymbol ? 17 : 15))
                && !isRangeEnvironment
                && volumeOkayForTrend
                && (!isCryptoMajorSymbol || isBelowEMA200Regime || isBearishTrendRegime || isBearishPullbackRegime)

            // In strong bearish regimes, price can briefly reclaim EMA20 during a bounce.
            // We still want to surface a "rejection short" idea near overhead levels (EMA/structure)
            // instead of falling back to generic "Low‑TF watch" setups.
            let bearish15mRejectionContext = (isBearishTrendRegime || isBearishPullbackRegime || isBelowEMA200Regime)
                && (!isCryptoAltSymbol || isTrendingEnvironment)
                && !priceAboveEMA50
                && ((adx.minusDI ?? 0) > (adx.plusDI ?? 0))
                && (!useADXFilter || adxValue >= 18)
                && rsiValue <= 64
                && !isRangeEnvironment
                && volumeOkayForTrend

            // 15m majors: add a controlled mean-reversion module to avoid "n=3" situations.
            // Only active in explicit range environments and only with strong oscillator extremes.
            let isRange15mMajor = isCryptoMajorSymbol && isRangeEnvironment
            let stochKValue = stochK ?? 50
            let stochDValue = stochD ?? 50
            let stochOversold15m = stochKValue <= 14 && stochDValue <= 24
            let stochOverbought15m = stochKValue >= 86 && stochDValue >= 76
            let stochPullbackOk15m = isCryptoAltSymbol
                ? (stochKValue <= 38 && stochDValue <= 48)
                : (stochKValue <= 48 && stochDValue <= 58)
            let stochBreakoutOk15m = isCryptoAltSymbol
                ? (stochKValue <= 72)
                : (stochKValue <= 80)
            let stochRejectionOk15m = isCryptoAltSymbol
                ? (stochKValue >= 64 && stochDValue >= 54)
                : (stochKValue >= 58 && stochDValue >= 48)

            if isRange15mMajor,
               stochOversold15m,
               rsiValue <= 46,
               // If below EMA200, only take range longs when momentum is clearly improving.
               (!isBelowEMA200Regime || (strongBullMomentum && macdHistValue >= -0.01)),
               let rangeSupport = (localSupport ?? support),
               let rangeResistance = (localResistance ?? resistance),
               isActionable(level: rangeSupport.value),
               isActionable(level: rangeResistance.value)
            {
                let entry = max([ema20, ema50, rangeSupport.value].compactMap { $0 }.filter { $0 < lastClose && isNearby($0) }.max() ?? rangeSupport.value, rangeSupport.value)
                let stop = (localNextSupport ?? nextSupport)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.20)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.30))
                if let stop {
                    let candidates = [
                        rangeResistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: max(entry, lastClose), multiplier: 1.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Scalp",
                                direction: "Bullish",
                                setup: "15m Range bounce long",
                                trigger: "Acceptance above \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Scalp") + ["15m majors: range module only when stoch is oversold (avoid noisy mid-range entries)."]
                            ))
                        }
                    }
                }
            }

            if isRange15mMajor,
               stochOverbought15m,
               rsiValue >= 54,
               // If above EMA200, only take range shorts when bearish momentum is clear.
               (!priceAboveEMA200 || strongBearMomentum),
               let rangeSupport = (localSupport ?? support),
               let rangeResistance = (localResistance ?? resistance),
               isActionable(level: rangeSupport.value),
               isActionable(level: rangeResistance.value)
            {
                let entry = min([ema20, ema50, rangeResistance.value].compactMap { $0 }.filter { $0 > lastClose && isNearby($0) }.min() ?? rangeResistance.value, rangeResistance.value)
                let stop = (localNextResistance ?? nextResistance)
                    .map { safe(stopAbove($0.value, buffer: atr * 0.20)) }
                    .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.30))
                if let stop {
                    let candidates = [
                        rangeSupport.value,
                        (localNextSupport ?? nextSupport)?.value,
                        fallbackTargetBelow(from: min(entry, lastClose), multiplier: 1.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Scalp",
                                direction: "Bearish",
                                setup: "15m Range fade short",
                                trigger: "Acceptance below \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Scalp") + ["15m majors: range module only when stoch is overbought (avoid fading strong breakouts)."]
                            ))
                        }
                    }
                }
            }

            if bullish15mTrend,
               (!isCryptoAltSymbol || stochPullbackOk15m),
               let entry = nearestLongPullbackEntry(),
               let pullbackResistance = localResistance ?? resistance,
               isActionable(level: pullbackResistance.value) {
                let upsideRoomOkay = atr <= 0 || (pullbackResistance.value - entry) / atr >= 0.9
                let stop = (localNextSupport ?? nextSupport)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.18)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.28))
                if upsideRoomOkay, let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        pullbackResistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 1.4),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Scalp",
                                direction: "Bullish",
                                setup: "15m Momentum pullback long",
                                trigger: "Acceptance above \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Scalp") + ["15m dedicated strategy: buy momentum pullbacks instead of chasing raw breaks."]
                            ))
                        }
                    }
                }
            }

            let breakoutMomentumOk15m = strongBullMomentum
                && rsiValue >= 52
                && rsiValue <= (isCryptoMajorSymbol ? 68 : 70)
                && (!useADXFilter || adxValue >= 18)
                && (!useVolumeFilter || (
                    isCryptoAltSymbol
                        ? (volRatio >= 1.05 && isLowVolume == false)
                        : (volRatio >= 0.90 || isLowVolume == false || (!useADXFilter || adxValue >= 28))
                ))

            if bullish15mTrend,
               breakoutMomentumOk15m,
               (!isCryptoAltSymbol || stochBreakoutOk15m),
               let breakoutLevel = localResistance ?? resistance,
               isActionable(level: breakoutLevel.value) {
                let entry = breakoutLevel.value
                let stop = (localSupport ?? support)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.20)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.28))
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 1.6),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.4)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Scalp",
                                direction: "Bullish",
                                setup: "15m Momentum breakout long",
                                trigger: "15m breakout holds above \(breakoutLevel.price) with momentum",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Scalp") + ["15m dedicated strategy: add selective continuation entries when the tape is already moving."]
                            ))
                        }
                    }
                }
            }

            if (bearish15mTrend || bearish15mRejectionContext),
               (!isCryptoAltSymbol || stochRejectionOk15m),
               let entry = nearestShortRejectionEntry(),
               let pullbackSupport = localSupport ?? support,
               isActionable(level: pullbackSupport.value) {
                let downsideRoomOkay = atr <= 0 || (entry - pullbackSupport.value) / atr >= 0.9
                let stop = (localNextResistance ?? nextResistance)
                    .map { safe(stopAbove($0.value, buffer: atr * 0.18)) }
                    .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.28))
                if downsideRoomOkay, let stop {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        pullbackSupport.value,
                        (localNextSupport ?? nextSupport)?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 1.4),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Scalp",
                                direction: "Bearish",
                                setup: "15m Momentum rejection short",
                                trigger: "Acceptance below \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Scalp") + ["15m dedicated strategy: short momentum rejections in strong downtrend."]
                            ))
                        }
                    }
                }
            }

            let breakdownMomentumOk15m = strongBearMomentum
                && rsiValue <= 48
                && (!useADXFilter || adxValue >= 18)
                && (!useVolumeFilter || (
                    isCryptoAltSymbol
                        ? (volRatio >= 1.05 && isLowVolume == false)
                        : (volRatio >= 0.90 || isLowVolume == false || (!useADXFilter || adxValue >= 28))
                ))

            if bearish15mTrend,
               breakdownMomentumOk15m,
               let breakdownLevel = localSupport ?? support,
               isActionable(level: breakdownLevel.value) {
                let entry = breakdownLevel.value
                let breakdownNotTooExtended: Bool = {
                    guard isCryptoMajorSymbol else { return true }
                    guard atr > 0 else { return true }
                    let anchors = [ema20, ema50].compactMap { $0 }.filter { $0.isFinite && $0 > 0 }
                    guard let overhead = anchors.min() else { return true }
                    // If the breakdown is already far below EMA20/50, continuation shorts are often late.
                    return (overhead - entry) / atr <= 0.9
                }()
                if breakdownNotTooExtended {
                    let stop = (localResistance ?? resistance)
                        .map { safe(stopAbove($0.value, buffer: atr * 0.20)) }
                        .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.28))
                    if let stop {
                        let fallbackAnchor = min(entry, lastClose)
                        let candidates = [
                            (localNextSupport ?? nextSupport)?.value,
                            fallbackTargetBelow(from: fallbackAnchor, multiplier: 1.6),
                            fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.4)
                        ].compactMap { $0 }
                        if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                            let target1 = picked.t1
                            let target2 = picked.t2
                            if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                                dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                    horizon: "Scalp",
                                    direction: "Bearish",
                                    setup: "15m Momentum breakdown short",
                                    trigger: "15m breakdown holds below \(breakdownLevel.price) with momentum",
                                    entry: fmt(entry),
                                    stop: fmt(stop),
                                    targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                    rr: rr(entry: entry, stop: stop, target: target1),
                                    notes: baseNotes(horizon: "Scalp") + ["15m dedicated strategy: add selective downside continuation entries when the market is already pressing lower."]
                                ))
                            }
                        }
                    }
                }
            }

            if dedicatedSetups.isEmpty == false {
                return dedicatedSetups.map { setup in
                    guard setup.rationale.isEmpty else { return setup }
                    let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    var enriched = setup
                    enriched.rationale = buildRationale(direction: setup.direction, entry: entryValue, stop: stopValue, horizon: setup.horizon, setupType: setup.setup)
                    return enriched
                }
            }
        }

        let useDedicated30mStrategy = minutes == 30

        if useDedicated30mStrategy {
            var dedicatedSetups: [ChartAnalysisPayload.TradeSetup] = []
            dedicatedSetups.reserveCapacity(3)

            func isNearby30m(_ level: Double) -> Bool {
                guard atr > 0 else { return true }
                return abs(lastClose - level) / atr <= 3.2
            }

            let stochKValue = stochK ?? 50
            let stochDValue = stochD ?? 50
            let stochOversold30m = isCryptoAltSymbol
                ? (stochKValue <= 26 && stochDValue <= 36)
                : (stochKValue <= 30 && stochDValue <= 40)
            let stochOverbought30m = isCryptoAltSymbol
                ? (stochKValue >= 74 && stochDValue >= 64)
                : (stochKValue >= 70 && stochDValue >= 60)
            let stochPullbackOk30m = isCryptoAltSymbol ? stochOversold30m : true
            let isRange30mMajor = isCryptoMajorSymbol && isRangeEnvironment
            let rangeOversold30m = stochKValue <= 18 && stochDValue <= 28
            let rangeOverbought30m = stochKValue >= 82 && stochDValue >= 72

            let majorBullContextOk30m: Bool = {
                // On 30m, crypto majors tend to whipsaw on the long side when the broader regime is
                // still below EMA200. Only allow those longs when rebound momentum is clearly present.
                guard isCryptoMajorSymbol else { return true }
                if isBelowEMA200Regime {
                    return isBullishReboundRegime && strongBullMomentum && rsiValue >= 50
                }
                return priceAboveEMA200
            }()

            // 30m majors: range module (only in explicit ranges + oscillator extremes).
            // This reduces "Low‑TF watch fallback" frequency when the tape is choppy but bounded.
            if isRange30mMajor,
               rangeOversold30m,
               rsiValue <= 48,
               let rangeSupport = (localSupport ?? support),
               let rangeResistance = (localResistance ?? resistance),
               isActionable(level: rangeSupport.value),
               isActionable(level: rangeResistance.value)
            {
                let entry = max([ema20, ema50, rangeSupport.value].compactMap { $0 }.filter { $0 < lastClose && isNearby30m($0) }.max() ?? rangeSupport.value, rangeSupport.value)
                let stop = (localNextSupport ?? nextSupport)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.22)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.30))
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        rangeResistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 1.7),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bullish",
                                setup: "30m Range bounce long",
                                trigger: "Acceptance above \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["30m majors: range module only at stoch oversold (avoid mid-range churn)."]
                            ))
                        }
                    }
                }
            }

            if isRange30mMajor,
               rangeOverbought30m,
               rsiValue >= 52,
               let rangeSupport = (localSupport ?? support),
               let rangeResistance = (localResistance ?? resistance),
               isActionable(level: rangeSupport.value),
               isActionable(level: rangeResistance.value)
            {
                let entry = min([ema20, ema50, rangeResistance.value].compactMap { $0 }.filter { $0 > lastClose && isNearby30m($0) }.min() ?? rangeResistance.value, rangeResistance.value)
                let stop = (localNextResistance ?? nextResistance)
                    .map { safe(stopAbove($0.value, buffer: atr * 0.22)) }
                    .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.30))
                if let stop {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        rangeSupport.value,
                        (localNextSupport ?? nextSupport)?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 1.7),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bearish",
                                setup: "30m Range fade short",
                                trigger: "Acceptance below \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["30m majors: range module only at stoch overbought (avoid fading breakouts)."]
                            ))
                        }
                    }
                }
            }

            let bullish30mTrend = (isBullishTrendRegime || dominantBias == "Bullish" || isBullishReboundRegime)
                && isTrendingEnvironment
                && !isRangeEnvironment
                && priceAboveEMA20
                && (priceAboveEMA50 || isBullishReboundRegime)
                && (!isCryptoAltSymbol || priceAboveEMA200 || isBullishReboundRegime)
                && macdIsBullish
                && rsiValue >= (isCryptoAltSymbol ? 46 : 44)
                && rsiValue <= 66
                && (!useADXFilter || adxValue >= 15)
                && volumeOkayForTrend
                && majorBullContextOk30m

            let bearish30mTrend = (isBearishTrendRegime || isBearishPullbackRegime || dominantBias == "Bearish")
                && isTrendingEnvironment
                && !isRangeEnvironment
                && (!isCryptoAltSymbol || isBelowEMA200Regime)
                && !priceAboveEMA20
                && (!priceAboveEMA50 || isBearishPullbackRegime || isCryptoMajorSymbol)
                && strongBearMomentum
                && rsiValue >= 38
                && rsiValue <= (isCryptoMajorSymbol ? 56 : 54)
                && (!useADXFilter || adxValue >= (isCryptoAltSymbol ? 18 : 16))
                && volumeOkayForTrend

            // Similar to 15m: allow "rejection" shorts in bearish regimes even if price has
            // bounced back above EMA20, as long as the market is still below EMA50 and DI- leads.
            let bearish30mRejectionContext = (isBearishTrendRegime || isBearishPullbackRegime || isBelowEMA200Regime)
                && isTrendingEnvironment
                && !isRangeEnvironment
                && (!priceAboveEMA50 || isBearishPullbackRegime || isCryptoMajorSymbol)
                && ((adx.minusDI ?? 0) > (adx.plusDI ?? 0))
                && (!useADXFilter || adxValue >= 18)
                && rsiValue <= 64
                && volumeOkayForTrend

            if bullish30mTrend,
               strongBullMomentum,
               stochKValue <= 82,
               let resistance = (localResistance ?? resistance),
               isActionable(level: resistance.value),
               (lastCandle?.close ?? lastClose) > resistance.value {
                let entry = resistance.value
                let stop = (localSupport ?? support)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.24)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.32))
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        (localNextResistance ?? nextResistance)?.value,
                        actionableAbove.dropFirst(2).first?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 1.8),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.8)
                    ].compactMap { $0 }.filter { isNearby30m($0) || $0 > entry }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bullish",
                                setup: "30m Trend base breakout",
                                trigger: "30m breakout holds above \(resistance.price) in trend",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["30m dedicated strategy: trade clean trend breakouts after base formation."]
                            ))
                        }
                    }
                }
            }

            if bullish30mTrend,
               (isCryptoMajorSymbol || strongBullMomentum || priceAboveEMA200),
               stochPullbackOk30m,
               let support = (localSupport ?? support),
               let resistance = (localResistance ?? resistance),
               isActionable(level: support.value),
               isActionable(level: resistance.value) {
                let entry = max([ema20, ema50, support.value].compactMap { $0 }.filter { $0 < lastClose && isNearby30m($0) }.max() ?? support.value, support.value)
                let stop = (localNextSupport ?? nextSupport)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.20)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.30))
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        resistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 1.7),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bullish",
                                setup: "30m Structure pullback long",
                                trigger: "Acceptance above \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["30m dedicated strategy: buy structured pullbacks, not broad range dips."]
                            ))
                        }
                    }
                }
            }

            if (bearish30mTrend || bearish30mRejectionContext),
               (isCryptoMajorSymbol == false || (isBearishTrendRegime && isBelowEMA200Regime)),
               stochOverbought30m,
               lastCandle.map(isBearishRejectionCandle) ?? false,
               (dominantBias == "Bearish" || isBearishTrendRegime || (isCryptoMajorSymbol && isBearishPullbackRegime)),
               let rejection = [ema20, ema50, localResistance?.value, resistance?.value]
                .compactMap({ $0 })
                .filter({ $0 > lastClose && isNearby30m($0) })
                .min(),
               let support = (localSupport ?? support),
               isActionable(level: support.value) {
                let entry = rejection
                let stop = (localNextResistance ?? nextResistance)
                    .map { safe(stopAbove($0.value, buffer: atr * 0.22)) }
                    .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.30))
                if let stop {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        support.value,
                        (localNextSupport ?? nextSupport)?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 1.7),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bearish",
                                setup: "30m Trend rejection short",
                                trigger: "Acceptance below \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["30m dedicated strategy: short trend rejections instead of fading random highs."]
                            ))
                        }
                    }
                }
            }

            if bearish30mTrend,
               (dominantBias == "Bearish" || isBearishTrendRegime || isBearishPullbackRegime),
               let breakdownLevel = (localSupport ?? support),
               isActionable(level: breakdownLevel.value) {
                // Avoid staging breakdown triggers far away from price (stale orders), but don't require
                // an already-completed break — otherwise 30m/1h can collapse to ~0 trades.
                let shouldStageBreakdown = isNearby30m(breakdownLevel.value) || (lastCandle?.close ?? lastClose) < breakdownLevel.value
                if shouldStageBreakdown {
                    let entry = breakdownLevel.value
                    let breakdownNotTooExtended30m: Bool = {
                        guard isCryptoSymbol else { return true }
                        guard atr > 0 else { return true }
                        let anchors = [ema20, ema50].compactMap { $0 }.filter { $0.isFinite && $0 > 0 }
                        guard let overhead = anchors.min() else { return true }
                        return (overhead - entry) / atr <= (isCryptoMajorSymbol ? 1.1 : 0.9)
                    }()
                    if breakdownNotTooExtended30m {
                        let stop = (localResistance ?? resistance)
                            .map { safe(stopAbove($0.value, buffer: atr * 0.22)) }
                            .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.30))
                        if let stop {
                            let fallbackAnchor = min(entry, lastClose)
                            let candidates = [
                                (localNextSupport ?? nextSupport)?.value,
                                below.dropLast(2).last?.value,
                                fallbackTargetBelow(from: fallbackAnchor, multiplier: 1.9),
                                fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.0)
                            ].compactMap { $0 }
                            if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                                let target1 = picked.t1
                                let target2 = picked.t2
                                if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                                    dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                        horizon: defaultHorizon,
                                        direction: "Bearish",
                                        setup: "30m Breakdown continuation short",
                                        trigger: "30m breakdown holds below \(breakdownLevel.price) in downtrend",
                                        entry: fmt(entry),
                                        stop: fmt(stop),
                                        targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                        rr: rr(entry: entry, stop: stop, target: target1),
                                        notes: baseNotes(horizon: defaultHorizon) + ["30m dedicated strategy: press downside continuation only after structure breaks, not random fades."]
                                    ))
                                }
                            }
                        }
                    }
                }
            }

            if dedicatedSetups.isEmpty == false {
                return dedicatedSetups.map { setup in
                    guard setup.rationale.isEmpty else { return setup }
                    let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    var enriched = setup
                    enriched.rationale = buildRationale(direction: setup.direction, entry: entryValue, stop: stopValue, horizon: setup.horizon, setupType: setup.setup)
                    return enriched
                }
            }
        }

        let useDedicated1hStrategy = minutes == 60

        if useDedicated1hStrategy {
            var dedicatedSetups: [ChartAnalysisPayload.TradeSetup] = []
            dedicatedSetups.reserveCapacity(3)

            func isNearby1h(_ level: Double) -> Bool {
                guard atr > 0 else { return true }
                return abs(lastClose - level) / atr <= 3.8
            }

            let stochKValue = stochK ?? 50
            let stochDValue = stochD ?? 50
            let stochOversold1h = isCryptoAltSymbol
                ? (stochKValue <= 28 && stochDValue <= 38)
                : (stochKValue <= 35 && stochDValue <= 45)
            let stochOverbought1h = isCryptoAltSymbol
                ? (stochKValue >= 72 && stochDValue >= 62)
                : (stochKValue >= 65 && stochDValue >= 55)
            let structureIsLowerHighLowerLow = structureLower.contains("lower highs and lower lows")
            let structureIsHigherHighHigherLow = structureLower.contains("higher highs and higher lows")
            let emaTrendStrength1h: Double = {
                guard let ema20, let ema50 else { return 0 }
                return abs(ema20 - ema50) / max(abs(ema50), 0.000001)
            }()
            let emaTrendStrengthOkay1h = !useEMAFilter || (emaTrendStrength1h >= (isCryptoAltSymbol ? 0.006 : 0.004))

            let bullish1hTrend = (isBullishTrendRegime || dominantBias == "Bullish" || isBullishReboundRegime)
                && isTrendingEnvironment
                && priceAboveEMA20
                && (priceAboveEMA50 || isBullishReboundRegime)
                && (isCryptoAltSymbol ? strongBullMomentum : macdIsBullish)
                && rsiValue >= (isCryptoAltSymbol ? 48 : 43)
                && rsiValue <= 64
                && (!useADXFilter || adxValue >= (isCryptoAltSymbol ? 18 : 14))
                && volumeOkayForTrend
                && !structureIsLowerHighLowerLow
                && emaTrendStrengthOkay1h

            let bearish1hTrend = (isBearishTrendRegime || (isBearishPullbackRegime && isBelowEMA200Regime) || dominantBias == "Bearish")
                && isTrendingEnvironment
                && isBelowEMA200Regime
                && !priceAboveEMA20
                && !priceAboveEMA50
                && strongBearMomentum
                && rsiValue >= 36
                && rsiValue <= (isCryptoAltSymbol ? 48 : 54)
                && (!useADXFilter || adxValue >= (isCryptoAltSymbol ? 18 : 16))
                && volumeOkayForTrend
                && !structureIsHigherHighHigherLow
                && emaTrendStrengthOkay1h

            if bullish1hTrend && stochOversold1h,
               let support = (localSupport ?? support),
               let resistance = (localResistance ?? resistance),
               isActionable(level: support.value),
               isActionable(level: resistance.value) {
                let entry = max([ema20, ema50, support.value].compactMap { $0 }.filter { $0 < lastClose && isNearby1h($0) }.max() ?? support.value, support.value)
                let stop = (localNextSupport ?? nextSupport)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.18)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.28))
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        resistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        actionableAbove.dropFirst(2).first?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.0),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bullish",
                                setup: "1h Trend pullback long",
                                trigger: "Acceptance above \(fmt(entry))",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["1h dedicated strategy: enter after trend pullbacks into structure."]
                            ))
                        }
                    }
                }
            }

            if bullish1hTrend,
               stochKValue <= 76,
               (!useADXFilter || adxValue >= 22),
               let resistance = (localResistance ?? resistance),
               isActionable(level: resistance.value),
               (lastCandle?.close ?? lastClose) > resistance.value {
                let entry = resistance.value
                let stop = (localSupport ?? support)
                    .map { safe(stopBelow($0.value, buffer: atr * 0.22)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.30))
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        (localNextResistance ?? nextResistance)?.value,
                        actionableAbove.dropFirst(2).first?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.2),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.3)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bullish",
                                setup: "1h Trend continuation long",
                                trigger: "1h continuation confirms above \(resistance.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon) + ["1h dedicated strategy: only take continuation once the higher-quality break is confirmed."]
                            ))
                        }
                    }
                }
            }

            if bearish1hTrend && (stochOverbought1h || adxValue >= 26),
               (dominantBias == "Bearish" || isBearishTrendRegime),
               let support = (localSupport ?? support),
               isActionable(level: support.value) {
                // Avoid staging breakdown triggers far away from price (stale orders), but don't require
                // an already-completed break — otherwise 1h can collapse to ~0 trades.
                let stageableDistance = atr > 0 ? (abs(lastClose - support.value) / atr) : 0
                let shouldStageBreakdown = stageableDistance <= 2.4 || (lastCandle?.close ?? lastClose) < support.value
                if shouldStageBreakdown {
                    let entry = support.value
                    let breakdownNotTooExtended1h: Bool = {
                        guard isCryptoSymbol else { return true }
                        guard atr > 0 else { return true }
                        let anchors = [ema20, ema50].compactMap { $0 }.filter { $0.isFinite && $0 > 0 }
                        guard let overhead = anchors.min() else { return true }
                        let dist = max(0, overhead - entry) / atr
                        return dist <= (isCryptoMajorSymbol ? 1.25 : 1.05)
                    }()
                    if breakdownNotTooExtended1h {
                        let stop = (localResistance ?? resistance)
                            .map { safe(stopAbove($0.value, buffer: atr * 0.22)) }
                            .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.30))
                        if let stop {
                            let fallbackAnchor = min(entry, lastClose)
                            let candidates = [
                                (localNextSupport ?? nextSupport)?.value,
                                below.dropLast(2).last?.value,
                                fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.1),
                                fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.2)
                            ].compactMap { $0 }
                            if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                                let target1 = picked.t1
                                let target2 = picked.t2
                                if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                                    dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                        horizon: defaultHorizon,
                                        direction: "Bearish",
                                        setup: "1h Breakdown continuation short",
                                        trigger: "1h continuation confirms below \(support.price)",
                                        entry: fmt(entry),
                                        stop: fmt(stop),
                                        targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                                        rr: rr(entry: entry, stop: stop, target: target1),
                                        notes: baseNotes(horizon: defaultHorizon) + ["1h dedicated strategy: favor clean downside continuation, not random scalp shorts."]
                                    ))
                                }
                            }
                        }
                    }
                }
            }

            if dedicatedSetups.isEmpty == false {
                return dedicatedSetups.map { setup in
                    guard setup.rationale.isEmpty else { return setup }
                    let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    var enriched = setup
                    enriched.rationale = buildRationale(direction: setup.direction, entry: entryValue, stop: stopValue, horizon: setup.horizon, setupType: setup.setup)
                    return enriched
                }
            }
        }

        // On low timeframes (<= 1h) crypto is extremely noisy. If the dedicated low-TF modules
        // have no setup, do not fall back to generic multi-TF setups.
        if useDedicatedLowTFStrategy {
            guard let support = localSupport ?? support, let resistance = localResistance ?? resistance else {
                return []
            }

            let horizon = isVeryShortTF ? "Scalp" : "Short-term"
            var fallback: [ChartAnalysisPayload.TradeSetup] = []
            fallback.reserveCapacity(2)

            func addBearishBreakdownWatch() {
                let bullishTapeConflict = macdHistValue > 0
                    && obvIsRising
                    && rocIsRising
                guard bullishTapeConflict == false else { return }

                // When the nearest support is within 0.15 × ATR of the current close the
                // entry/target spread is too tight for a viable R:R — step down to the next level.
                let isTooClose = atr > 0 && abs(lastClose - support.value) < atr * 0.15
                let entryRes = isTooClose ? (localNextSupport ?? nextSupport ?? support) : support
                let entry = entryRes.value
                let stop = safe(stopAbove(entry, buffer: (isVeryShortTF ? scalpStop : shortStop) * 0.45))
                    ?? safe(entry + (isVeryShortTF ? scalpStop : shortStop))
                guard let stop else { return }

                let fallbackAnchor = min(entry, lastClose)
                let candidates = [
                    (localNextSupport ?? nextSupport)?.value,
                    below.dropLast(2).last?.value,
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: isVeryShortTF ? 1.8 : 2.4),
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: isVeryShortTF ? 2.8 : 3.4)
                ].compactMap { $0 }
                guard let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: horizon) else { return }
                let t1 = picked.t1
                let t2 = picked.t2

                guard let rrV = rrValue(entry: entry, stop: stop, target: t1), rrV >= 1.35 else { return }

                var setup = ChartAnalysisPayload.TradeSetup(
                    horizon: horizon,
                    direction: "Bearish",
                    setup: "Low‑TF breakdown watch",
                    trigger: "Break and hold below \(entryRes.price)",
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [t1, t2].compactMap { $0 }.prefix(3).map { fmt($0) },
                    rr: rr(entry: entry, stop: stop, target: t1),
                    notes: baseNotes(horizon: horizon) + [
                        "Low‑TF fallback: dedicated crypto module found no high‑quality setup."
                    ],
                    rationale: []
                )
                setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                fallback.append(setup)
            }

            func addBullishReclaimWatch() {
                let bearishTapeConflict = macdHistValue < 0
                    && obvIsFalling
                    && rocIsFalling
                guard bearishTapeConflict == false else { return }

                // When the nearest resistance is within 0.15 × ATR of the current close the
                // entry/target spread is too tight for a viable R:R — step up to the next level.
                let isTooClose = atr > 0 && abs(resistance.value - lastClose) < atr * 0.15
                let entryRes = isTooClose ? (localNextResistance ?? nextResistance ?? resistance) : resistance
                let entry = entryRes.value
                let stop = safe(stopBelow(entry, buffer: (isVeryShortTF ? scalpStop : shortStop) * 0.45))
                    ?? safe(entry - (isVeryShortTF ? scalpStop : shortStop))
                guard let stop else { return }

                let fallbackAnchor = max(entry, lastClose)
                let candidates = [
                    (localNextResistance ?? nextResistance)?.value,
                    actionableAbove.dropFirst(2).first?.value,
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: isVeryShortTF ? 1.8 : 2.4),
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: isVeryShortTF ? 2.8 : 3.4)
                ].compactMap { $0 }
                guard let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: horizon) else { return }
                let t1 = picked.t1
                let t2 = picked.t2

                guard let rrV = rrValue(entry: entry, stop: stop, target: t1), rrV >= 1.35 else { return }

                var setup = ChartAnalysisPayload.TradeSetup(
                    horizon: horizon,
                    direction: "Bullish",
                    setup: "Low‑TF reclaim watch",
                    trigger: "Reclaim above \(entryRes.price) and hold",
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [t1, t2].compactMap { $0 }.prefix(3).map { fmt($0) },
                    rr: rr(entry: entry, stop: stop, target: t1),
                    notes: baseNotes(horizon: horizon) + [
                        "Low‑TF fallback: dedicated crypto module found no high‑quality setup."
                    ],
                    rationale: []
                )
                setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                fallback.append(setup)
            }

            // This fallback fires only when no high-quality directional setup was found,
            // so there is no reliable signal to pick a single direction. Always generate
            // both watch levels and let the R:R guard inside each function determine
            // which ones are viable. The multi-asset scan and single Pick analysis will
            // then both surface the same setup types for the same asset.
            addBullishReclaimWatch()
            addBearishBreakdownWatch()

            // Ensure we return something actionable rather than an empty list, so the UI doesn't
            // have to synthesize generic setups for crypto low TF.
            if fallback.isEmpty == false {
                return fallback
            }

            return [
                ChartAnalysisPayload.TradeSetup(
                    horizon: horizon,
                    direction: "Neutral",
                    setup: "Conditional crypto watch",
                    trigger: "Wait for reclaim above \(resistance.price) or breakdown below \(support.price)",
                    entry: nil,
                    stop: nil,
                    targets: [],
                    rr: nil,
                    notes: [
                        "Low‑TF crypto is noisy; treat this as a trigger watch, not an entry signal.",
                        "Wait for a clearer level break/hold."
                    ]
                )
            ]
        }

        let useDedicatedMidTFStrategy = (120...240).contains(minutes)

        if useDedicatedMidTFStrategy {
            var dedicatedSetups: [ChartAnalysisPayload.TradeSetup] = []
            dedicatedSetups.reserveCapacity(4)

            let emaTrendStrengthMid: Double = {
                guard let ema20, let ema50 else { return 0 }
                return abs(ema20 - ema50) / max(abs(ema50), 0.000001)
            }()
            let emaTrendStrengthOkayMid = !useEMAFilter || emaTrendStrengthMid >= (isCryptoSymbol ? 0.0055 : 0.004)

            func isNearbyMid(_ level: Double) -> Bool {
                guard atr > 0 else { return true }
                return abs(lastClose - level) / atr <= 2.6
            }

            let bullishMidTrend = (dominantBias == "Bullish" || isBullishTrendRegime || isBullishReboundRegime)
                && isTrendingEnvironment
                && !isRangeEnvironment
                && priceAboveEMA20
                && priceAboveEMA50
                && (priceAboveEMA200 || isBullishReboundRegime)
                && macdIsBullish
                && rsiValue >= 46
                && rsiValue <= 68
                && (!useADXFilter || adxValue >= 16)
                && volumeOkayForTrend
                && !structureIsBearish
                && emaTrendStrengthOkayMid

            let bearishMidTrend = (dominantBias == "Bearish" || isBearishTrendRegime || isBearishPullbackRegime)
                && isTrendingEnvironment
                && !isRangeEnvironment
                && !priceAboveEMA20
                && !priceAboveEMA50
                && isBelowEMA200Regime
                && strongBearMomentum
                && rsiValue >= 34
                && rsiValue <= 56
                && (!useADXFilter || adxValue >= 16)
                && volumeOkayForTrend
                && !structureIsBullish
                && emaTrendStrengthOkayMid

            if bullishMidTrend,
               let breakoutLevel = localResistance ?? resistance,
               isActionable(level: breakoutLevel.value) {
                // Avoid staging stale breakouts far from current price.
                let breakoutConfirmed = (lastCandle?.close ?? lastClose) > breakoutLevel.value || isNearbyMid(breakoutLevel.value)
                if breakoutConfirmed {
                let entry = breakoutLevel.value
                let stop = cappedLongStop(
                    entry: entry,
                    anchor: (localSupport ?? support)?.value ?? ema50 ?? ema20,
                    fallback: entry - swingStop
                )
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        (localNextResistance ?? nextResistance)?.value,
                        above.dropFirst(2).first?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.6),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.8)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bullish",
                                setup: "2h-4h Trend expansion long",
                                trigger: "2h-4h trend expands through \(breakoutLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["2h-4h dedicated strategy: favor clean trend expansion after structure confirms."]
                            ))
                        }
                    }
                }
                }
            }

            if bullishMidTrend,
               hasPullbackVolumeConfirmation,
               let pullbackSupport = localSupport ?? support,
               let pullbackResistance = localResistance ?? resistance,
               isActionable(level: pullbackSupport.value),
               isActionable(level: pullbackResistance.value) {
                let entry = pullbackSupport.value
                let stop = cappedLongStop(
                    entry: entry,
                    anchor: (localNextSupport ?? nextSupport)?.value ?? ema50 ?? ema20,
                    fallback: entry - swingStop
                )
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        pullbackResistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.8),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 4.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bullish",
                                setup: "2h-4h Structure pullback long",
                                trigger: "Acceptance above \(pullbackSupport.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["2h-4h dedicated strategy: buy the higher-timeframe pullback, not the noisy chase."]
                            ))
                        }
                    }
                }
            }

            if bearishMidTrend,
               let breakdownLevel = localSupport ?? support,
               isActionable(level: breakdownLevel.value) {
                // Avoid staging stale breakdowns far from current price.
                let breakdownConfirmed = (lastCandle?.close ?? lastClose) < breakdownLevel.value || isNearbyMid(breakdownLevel.value)
                if breakdownConfirmed {
                let entry = breakdownLevel.value
                let stop = cappedShortStop(
                    entry: entry,
                    anchor: (localResistance ?? resistance)?.value ?? ema50 ?? ema20,
                    fallback: entry + swingStop
                )
                if let stop {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        (localNextSupport ?? nextSupport)?.value,
                        below.dropLast(2).last?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.8),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 4.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bearish",
                                setup: "2h-4h Breakdown continuation short",
                                trigger: "2h-4h trend continues below \(breakdownLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["2h-4h dedicated strategy: press continuation only in real bearish structure."]
                            ))
                        }
                    }
                }
                }
            }

            if bearishMidTrend,
               let rejectionLevel = localResistance ?? resistance,
               let supportLevel = localSupport ?? support,
               isActionable(level: rejectionLevel.value),
               isActionable(level: supportLevel.value) {
                let entry = rejectionLevel.value
                let stop = cappedShortStop(
                    entry: entry,
                    anchor: (localNextResistance ?? nextResistance)?.value ?? ema50 ?? ema20,
                    fallback: entry + swingStop
                )
                if let stop {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        supportLevel.value,
                        (localNextSupport ?? nextSupport)?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.6),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.8)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bearish",
                                setup: "2h-4h Trend rejection short",
                                trigger: "Acceptance below \(rejectionLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["2h-4h dedicated strategy: short failed rotations back into trend."]
                            ))
                        }
                    }
                }
            }

            let longCountMid = dedicatedSetups.filter { $0.direction == "Bullish" }.count
            let shortCountMid = dedicatedSetups.filter { $0.direction == "Bearish" }.count
            let canReturnMidDedicated = dedicatedSetups.isEmpty == false && (
                (longCountMid > 0 && shortCountMid > 0)
                || (longCountMid > 0 && (dominantBias == "Bullish" || isBullishTrendRegime || isBullishReboundRegime))
                || (shortCountMid > 0 && (dominantBias == "Bearish" || isBearishTrendRegime))
            )
            if canReturnMidDedicated {
                return dedicatedSetups.map { setup in
                    guard setup.rationale.isEmpty else { return setup }
                    let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    var enriched = setup
                    enriched.rationale = buildRationale(direction: setup.direction, entry: entryValue, stop: stopValue, horizon: setup.horizon, setupType: setup.setup)
                    return enriched
                }
            }
        }

        let useDedicatedHighTFStrategy = (360...480).contains(minutes)

        if useDedicatedHighTFStrategy {
            var dedicatedSetups: [ChartAnalysisPayload.TradeSetup] = []
            dedicatedSetups.reserveCapacity(4)

            let bullishHighTrend = (dominantBias == "Bullish" || isBullishTrendRegime || isBullishReboundRegime)
                && priceAboveEMA50
                && priceAboveEMA200
                && (ema20 ?? lastClose) >= (ema50 ?? lastClose)
                && macdIsBullish
                && rsiValue >= 46
                && rsiValue <= 66
                && (!useADXFilter || adxValue >= 14)
                && volumeOkayForTrend

            let bearishHighTrend = (dominantBias == "Bearish" || isBearishTrendRegime || isBearishPullbackRegime)
                && !priceAboveEMA50
                && isBelowEMA200Regime
                && strongBearMomentum
                && rsiValue >= 34
                && rsiValue <= 54
                && (!useADXFilter || adxValue >= 14)
                && volumeOkayForTrend

            if bullishHighTrend,
               let breakoutLevel = localResistance ?? resistance,
               isActionable(level: breakoutLevel.value) {
                let entry = breakoutLevel.value
                let stop = cappedLongStop(
                    entry: entry,
                    anchor: ema50 ?? (localSupport ?? support)?.value ?? ema20,
                    fallback: entry - swingStop
                )
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        (localNextResistance ?? nextResistance)?.value,
                        above.dropFirst(2).first?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.2),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 4.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bullish",
                                setup: "6h-8h Trend continuation long",
                                trigger: "6h-8h trend confirms above \(breakoutLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["6h-8h dedicated strategy: prioritize broad trend continuation over lower-TF churn."]
                            ))
                        }
                    }
                }
            }

            if bullishHighTrend,
               hasPullbackVolumeConfirmation,
               let baseSupport = localSupport ?? support,
               let baseResistance = localResistance ?? resistance,
               isActionable(level: baseSupport.value),
               isActionable(level: baseResistance.value) {
                let entry = baseSupport.value
                let stop = cappedLongStop(
                    entry: entry,
                    anchor: ema50 ?? (localNextSupport ?? nextSupport)?.value ?? ema20,
                    fallback: entry - swingStop
                )
                if let stop {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        baseResistance.value,
                        (localNextResistance ?? nextResistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.0),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 4.2)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bullish",
                                setup: "6h-8h Base retest long",
                                trigger: "Acceptance above \(baseSupport.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["6h-8h dedicated strategy: enter on base retests instead of forcing mid-range entries."]
                            ))
                        }
                    }
                }
            }

            if bearishHighTrend,
               let breakdownLevel = localSupport ?? support,
               isActionable(level: breakdownLevel.value) {
                let entry = breakdownLevel.value
                let stop = cappedShortStop(
                    entry: entry,
                    anchor: ema50 ?? (localResistance ?? resistance)?.value ?? ema20,
                    fallback: entry + swingStop
                )
                if let stop {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        (localNextSupport ?? nextSupport)?.value,
                        below.dropLast(2).last?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.2),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 4.6)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Swing") {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Swing") {
                            dedicatedSetups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: "Swing",
                                direction: "Bearish",
                                setup: "6h-8h Trend continuation short",
                                trigger: "6h-8h trend confirms below \(breakdownLevel.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: "Swing") + ["6h-8h dedicated strategy: press broad downside continuation only in clear bear structure."]
                            ))
                        }
                    }
                }
            }

            let longCountHigh = dedicatedSetups.filter { $0.direction == "Bullish" }.count
            let shortCountHigh = dedicatedSetups.filter { $0.direction == "Bearish" }.count
            let canReturnHighDedicated = dedicatedSetups.isEmpty == false && (
                (longCountHigh > 0 && shortCountHigh > 0)
                || (longCountHigh > 0 && (dominantBias == "Bullish" || isBullishTrendRegime || isBullishReboundRegime))
                || (shortCountHigh > 0 && (dominantBias == "Bearish" || isBearishTrendRegime))
            )
            if canReturnHighDedicated {
                return dedicatedSetups.map { setup in
                    guard setup.rationale.isEmpty else { return setup }
                    let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
                    var enriched = setup
                    enriched.rationale = buildRationale(direction: setup.direction, entry: entryValue, stop: stopValue, horizon: setup.horizon, setupType: setup.setup)
                    return enriched
                }
            }
        }

        var setups: [ChartAnalysisPayload.TradeSetup] = []
        setups.reserveCapacity(4)

        if enableBreakoutAcceptance,
           allowScalp,
           useDedicatedLowTFStrategy == false,
           isTrendingEnvironment,
           volumeOkayForTrend,
           breakoutLongConfirmation,
           let resistance = localResistance ?? resistance,
           isActionable(level: resistance.value) {
            let entry = resistance.value
            let stop = safe(stopBelow(entry, buffer: scalpStop * 0.45)) ?? safe(entry - scalpStop)
            if let stop {
                let fallbackAnchor = max(entry, lastClose)
                let candidates = [
                    (localNextResistance ?? nextResistance)?.value,
                    actionableAbove.dropFirst(2).first?.value,
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 1.6),
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.4)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                    let firstTarget = picked.t1
                    let target2 = picked.t2

                    if let rrV = rrValue(entry: entry, stop: stop, target: firstTarget), rrV >= minRR(for: "Scalp") {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: "Scalp",
                            direction: "Bullish",
                            setup: dominantBias == "Bearish" ? "Countertrend reclaim" : "Breakout acceptance",
                            trigger: dominantBias == "Bearish"
                                ? "Reclaims \(resistance.price) and holds above it"
                                : "Acceptance above \(resistance.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: Array(NSOrderedSet(array: [firstTarget, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                            rr: rr(entry: entry, stop: stop, target: firstTarget),
                            notes: baseNotes(horizon: "Scalp")
                        ))
                    }
                }
            }
        }

        if allowScalp,
           isTrendingEnvironment,
           volumeOkayForTrend,
           allowVeryShortBearishShorts,
           allowLowTFBreakdownAcceptance,
           hasBreakdownVolumeConfirmation,
           dominantBias != "Bullish",
           let support = localSupport ?? support,
           isActionable(level: support.value) {
            let entry = support.value
            let stop = (localResistance ?? resistance)
                .map { safe(stopAbove($0.value, buffer: scalpStop * 0.35)) }
                .flatMap { $0 } ?? safe(entry + scalpStop)
            if let stop {
                let fallbackAnchor = min(entry, lastClose)
                let (mult1, mult2) = (scalpMult1, scalpMult2)
                let candidates = [
                    (localNextSupport ?? nextSupport)?.value,
                    actionableBelow.dropLast(2).last?.value,
                    below.dropLast(3).last?.value,
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: mult1),
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: mult2)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: "Scalp") {
                    let target1 = picked.t1
                    let target2 = picked.t2

                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: "Scalp") {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: "Scalp",
                            direction: "Bearish",
                            setup: "Breakdown acceptance",
                            trigger: "Acceptance below \(support.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: "Scalp")
                        ))
                    }
                }
            }
        }

        if enableBreakoutContinuationLong,
           allowShortTerm,
           isTrendingEnvironment,
           volumeOkayForTrend,
           allowLowTFBreakoutContinuation,
           (useDedicatedLowTFStrategy ? allowBullishContinuationSetups : (dominantBias == "Bullish" || isBullishReboundRegime)),
           let resistance = localResistance ?? resistance,
           isActionable(level: resistance.value) {
            let entry = resistance.value
            let stop = (localSupport ?? support)
                .map { safe(stopBelow($0.value, buffer: atr * 0.25)) }
                .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.35)) ?? safe(entry - shortStop)
            if let stop {
                let fallbackAnchor = max(entry, lastClose)
                let candidates = [
                    (localNextResistance ?? nextResistance)?.value,
                    actionableAbove.dropFirst(2).first?.value,
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: isVeryShortTF ? 1.8 : (useDedicatedLowTFStrategy ? 1.6 : 2.2)),
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: isVeryShortTF ? 2.8 : (useDedicatedLowTFStrategy ? 2.4 : 3.2))
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: defaultHorizon,
                            direction: "Bullish",
                            setup: "Breakout continuation",
                            trigger: kind == .daily
                                ? "Daily close above \(resistance.price) + follow-through"
                                : "Acceptance above \(resistance.price) + follow-through",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: Array(NSOrderedSet(array: [safe(target1), target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: defaultHorizon)
                        ))
                    }
                }
            }
        }

        let longPullbackSetupAllowed = {
            var continuationOkay: Bool
            if isUltraShortTF {
                continuationOkay = priceAboveEMA20
                    && priceAboveEMA50
                    && macdIsBullish
                    && rsiValue >= 42
                    && rsiValue <= 58
                    && !isVeryShortTF
                    && !structureIsBearish
                    && !isBearishTrendRegime
            } else if isLowTF {
                continuationOkay = priceAboveEMA20
                    && priceAboveEMA50
                    && macdIsBullish
                    && rsiValue >= 44
                    && rsiValue <= 60
                    && !structureIsBearish
                    && !(regimeLower.contains("bearish") && dominantBias != "Bullish" && structureLooksRangeLike)
                    && (dominantBias == "Bullish"
                        || isBullishTrendRegime
                        || isBullishPullbackRegime
                        || (isBullishReboundRegime && hasCountertrendTailwind))
            } else {
                continuationOkay = !structureIsBearish
                    && !(isBearishTrendRegime && dominantBias == "Bearish")
                    && !(regimeLower.contains("bearish") && dominantBias != "Bullish" && structureLooksRangeLike)
                    && (dominantBias == "Bullish"
                        || isBullishTrendRegime
                        || isBullishPullbackRegime
                        || strongBullMomentum)

                // Higher intraday timeframes (4h+) behave more like swing trading:
                // avoid repeated dip-buys in broad downtrends unless momentum has clearly flipped.
                if kind == .intraday, minutes >= 240 {
                    continuationOkay = continuationOkay
                        && (priceAboveEMA50 || strongBullMomentum)
                        && (!isBelowEMA200Regime || (strongBullMomentum && rsiValue >= 50))
                }
            }

            return (allowBullishContinuationSetups && continuationOkay)
                || (allowBullishRangeMeanReversion && rangeLongConfirmation)
        }()

        if allowShortTerm,
           volumeOkayForTrend,
           hasPullbackVolumeConfirmation,
           longPullbackSetupAllowed,
           let pullbackSupport = (localSupport ?? support),
           let pullbackResistance = (localResistance ?? resistance),
           isActionable(level: pullbackSupport.value),
           isActionable(level: pullbackResistance.value) {
            let entry = pullbackSupport.value
            let stop = (localNextSupport ?? nextSupport)
                .map { safe(stopBelow($0.value, buffer: shortStop * 0.28)) }
                .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.35))
            if let stop {
                let fallbackAnchor = max(entry, lastClose)
                let candidates = [
                    pullbackResistance.value,
                    (localNextResistance ?? nextResistance)?.value,
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.4),
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.4)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: defaultHorizon,
                            direction: "Bullish",
                            setup: "Pullback buy",
                            trigger: useDedicatedLowTFStrategy
                                ? "Pulls back into \(pullbackSupport.price) in trend and holds"
                                : (isRangeEnvironment
                                    ? "Holds support \(pullbackSupport.price) and rotates higher"
                                    : "Pulls back into \(pullbackSupport.price) and holds"),
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: defaultHorizon) + [
                                useDedicatedLowTFStrategy
                                    ? "Low-TF mode: only trend pullbacks, not broad range mean reversion."
                                    : (isRangeEnvironment ? "Range context: prefer support-led rotation." : "Trend context: buy the pullback, not the chase.")
                            ]
                        ))
                    }
                }
            }
        }

        if allowShortTerm,
           isTrendingEnvironment,
           volumeOkayForTrend,
           allowVeryShortBearishShorts,
           allowLowTFBreakdownAcceptance,
           hasBreakdownVolumeConfirmation,
           dominantBias != "Bullish",
           let breakdownLevel = (localSupport ?? support),
           isActionable(level: breakdownLevel.value) {
            let entry = breakdownLevel.value
            let stop = (localResistance ?? resistance)
                .map { safe(stopAbove($0.value, buffer: shortStop * 0.30)) }
                .flatMap { $0 } ?? safe(entry + shortStop)
            if let stop {
                let fallbackAnchor = min(entry, lastClose)
                let (mult1, mult2) = shortTermMultipliers(for: timeframe)
                let candidates = [
                    (localNextSupport ?? nextSupport)?.value,
                    actionableBelow.dropLast(2).last?.value,
                    below.dropLast(3).last?.value,
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: mult1),
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: mult2)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: defaultHorizon,
                            direction: "Bearish",
                            setup: "Breakdown acceptance",
                            trigger: kind == .daily
                                ? "Daily close below \(breakdownLevel.price)"
                                : "Acceptance below \(breakdownLevel.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: Array(NSOrderedSet(array: [safe(target1), target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: defaultHorizon)
                        ))
                    }
                }
            }
        }

        if experimentalSetupsEnabled,
           allowShortTerm,
           dominantBias == "Bearish",
           pullbackAdxOkay,
           hasPullbackVolumeConfirmation,
           let pullbackResistance = (localResistance ?? resistance),
           let pullbackSupport = (localSupport ?? support),
           isActionable(level: pullbackResistance.value),
           isActionable(level: pullbackSupport.value),
           let last = lastCandle,
           isBearishRejectionCandle(last),
           last.high >= pullbackResistance.value,
           last.close < pullbackResistance.value {
           let entry = pullbackResistance.value
           let stop = safe(stopAbove(entry, buffer: shortStop * 0.55)) ?? safe(entry + shortStop)
            if let stop {
                let fallbackAnchor = min(entry, lastClose)
                let candidates = [
                    pullbackSupport.value,
                    (localNextSupport ?? nextSupport)?.value,
                    below.dropLast(3).last?.value,
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.0)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: defaultHorizon,
                            direction: "Bearish",
                            setup: "Pullback rejection",
                            trigger: "Close below \(pullbackResistance.price) after rejection",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: Array(NSOrderedSet(array: [safe(target1), target2].compactMap { $0 }.prefix(3).map { fmt($0) })).compactMap { $0 as? String },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: defaultHorizon)
                        ))
                    }
                }
            }
        }

        let allowCountertrendBounce = dominantBias != "Bullish"
            && (
                inHardBearishContext
                    ? false
                    : (useDedicatedLowTFStrategy
                        ? false
                        : (isUltraShortTF
                        ? false
                        : strongBullishReversalSignal))
            )

        if enableCountertrendReclaim,
           allowShortTerm,
           allowCountertrendBounce,
           let bounceSupport = (localSupport ?? support),
           let bounceResistance = (localResistance ?? resistance),
           isActionable(level: bounceSupport.value),
           isActionable(level: bounceResistance.value) {
            // Buy at SUPPORT (dip buy), not at resistance (breakout against trend).
            let entry = bounceSupport.value
            let stop = (localNextSupport ?? nextSupport)
                .map { safe(stopBelow($0.value, buffer: shortStop * 0.25)) }
                .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.35))
            if let stop {
                let target1 = bounceResistance.value
                let target2 = (localNextResistance ?? nextResistance)?.value
                if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: defaultHorizon) {
                    setups.append(ChartAnalysisPayload.TradeSetup(
                        horizon: defaultHorizon,
                        direction: "Bullish",
                        setup: isRangeEnvironment ? "Range reclaim bounce" : "Countertrend bounce",
                        trigger: "Acceptance above \(bounceSupport.price)",
                        entry: fmt(entry),
                        stop: fmt(stop),
                        targets: Array(NSOrderedSet(array: [target1, target2].compactMap { $0 }.prefix(2).map { fmt($0) })).compactMap { $0 as? String },
                        rr: rr(entry: entry, stop: stop, target: target1),
                        notes: baseNotes(horizon: defaultHorizon) + [
                            isRangeEnvironment
                                ? "Range context: reclaim bounce is valid while the range holds."
                                : "Countertrend idea: keep size small; invalidation is strict."
                        ]
                    ))
                }
            }
        }

        if allowRangeRotation, useDedicatedLowTFStrategy == false, isRangeEnvironment, let support, let resistance {
            let rangeWidth = max(0, resistance.value - support.value)
            let rangeWidthAtr = atr > 0 ? (rangeWidth / atr) : 0

            // Range rotation should be selective (especially for FX). Avoid "always-on" churn.
            let rangeRotationAdxOkay: Bool = {
                guard useADXFilter else { return true }
                if isYahooFX { return adxValue <= 22 }
                return adxValue <= 26
            }()
            let rangeWidthOkay: Bool = {
                guard atr > 0 else { return true }
                // Too narrow = noisy; too wide = likely a trend/impulse leg.
                if isYahooFX { return rangeWidthAtr >= 1.4 && rangeWidthAtr <= 8.0 }
                return rangeWidthAtr >= 1.2 && rangeWidthAtr <= 10.0
            }()

            if rangeRotationAdxOkay, rangeWidthOkay {
                // Better edge: enter near range extremes, not at the middle.
                let lowerThird = support.value + rangeWidth * 0.35
                let upperThird = resistance.value - rangeWidth * 0.35
                let nearSupport = lastClose <= lowerThird
                let nearResistance = lastClose >= upperThird

                let stopBuffer = atr * (isYahooFX ? 0.35 : 0.20)

                if nearSupport, allowBullishRangeMeanReversion, (dominantBias != "Bearish" || isOversold || rangeLongConfirmation) {
                    let entry = support.value
                    if let stop = safe(stopBelow(support.value, buffer: stopBuffer)) ?? safe(entry - shortStop) {
                        // Prefer closer TP1s (EMA/AVWAP/BB mid) before “other side of range” targets.
                        let meanTargets = [
                            ema20,
                            ema50,
                            avwapVwap,
                            bollingerMiddle
                        ]
                        .compactMap { $0 }
                        .filter { $0.isFinite && $0 > entry && $0 < resistance.value }

                        let candidates = meanTargets + [
                            resistance.value,
                            nextResistance?.value
                        ].compactMap { $0 }

                        if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                            let target1 = picked.t1
                            let target2 = picked.t2
                            let rrV = rrValue(entry: entry, stop: stop, target: target1) ?? 0
                            if rrV >= minRR(for: defaultHorizon) {
                            setups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bullish",
                                setup: "Range rotation",
                                trigger: "Acceptance above \(support.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [safe(target1), target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon)
                            ))
                            }
                        }
                    }
                }

                if nearResistance, (dominantBias != "Bullish" || strongBearMomentum || rsiValue >= 58) {
                    let entry = resistance.value
                    if let stop = safe(stopAbove(resistance.value, buffer: stopBuffer)) ?? safe(entry + shortStop) {
                        let meanTargets = [
                            ema20,
                            ema50,
                            avwapVwap,
                            bollingerMiddle
                        ]
                        .compactMap { $0 }
                        .filter { $0.isFinite && $0 < entry && $0 > support.value }

                        let candidates = meanTargets + [
                            support.value,
                            nextSupport?.value
                        ].compactMap { $0 }

                        if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: defaultHorizon) {
                            let target1 = picked.t1
                            let target2 = picked.t2
                            let rrV = rrValue(entry: entry, stop: stop, target: target1) ?? 0
                            if rrV >= minRR(for: defaultHorizon) {
                            setups.append(ChartAnalysisPayload.TradeSetup(
                                horizon: defaultHorizon,
                                direction: "Bearish",
                                setup: "Range rotation",
                                trigger: "Acceptance below \(resistance.price)",
                                entry: fmt(entry),
                                stop: fmt(stop),
                                targets: [safe(target1), target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                                rr: rr(entry: entry, stop: stop, target: target1),
                                notes: baseNotes(horizon: defaultHorizon)
                            ))
                            }
                        }
                    }
                }
            }
        }

        let swingHorizon: String = (kind == .weekly || kind == .monthly) ? "Position" : "Swing"
        let closeWording: String = (kind == .weekly || kind == .monthly) ? "Weekly close" : "Acceptance"

        if allowSwing,
           (allowBullishContinuationSetups || isBullishReboundRegime || isBullishPullbackRegime),
           !structureIsBearish,
           (dominantBias == "Bullish" || isBullishTrendRegime || isBullishPullbackRegime || (isBullishReboundRegime && hasCountertrendTailwind)),
           let swingResistance = (localResistance ?? resistance),
           isActionable(level: swingResistance.value) {
            let entry = swingResistance.value
            let supportAnchor = (localSupport ?? support)?.value
            let fallbackStop = entry - swingStop
            if let stop = cappedLongStop(entry: entry, anchor: supportAnchor, fallback: fallbackStop) {
                let fallbackAnchor = max(entry, lastClose)
                let candidates = [
                    (localNextResistance ?? nextResistance)?.value,
                    above.dropFirst(2).first?.value,
                    above.dropFirst(3).first?.value,
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.0),
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 4.2)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: swingHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: swingHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: swingHorizon,
                            direction: "Bullish",
                            setup: "Continuation (wider stop)",
                            trigger: "\(closeWording) above \(swingResistance.price) + momentum follow-through",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: swingHorizon)
                        ))
                    }
                }
            }
        }

        if allowSwing, dominantBias != "Bullish", let swingSupport = (localSupport ?? support), isActionable(level: swingSupport.value) {
            let entry = swingSupport.value
            let resistanceAnchor = (localResistance ?? resistance)?.value
            let stop = cappedShortStop(entry: entry, anchor: resistanceAnchor, fallback: entry + swingStop)
            if let stop {
                let fallbackAnchor = min(entry, lastClose)
                let candidates = [
                    (localNextSupport ?? nextSupport)?.value,
                    below.dropLast(2).last?.value,
                    below.dropLast(3).last?.value,
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.2),
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: 4.4)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: swingHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: swingHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: swingHorizon,
                            direction: "Bearish",
                            setup: "Continuation (wider stop)",
                            trigger: "\(closeWording) below \(swingSupport.price) + continuation toward lower levels",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: swingHorizon)
                        ))
                    }
                }
            }
        }

        if allowSwing, dominantBias == "Bearish", strongBullishReversalSignal, !structureIsBearish,
           let bounceSupport = (localSupport ?? support),
           let bounceResistance = (localResistance ?? resistance),
           isActionable(level: bounceSupport.value),
           isActionable(level: bounceResistance.value) {
            let entry = bounceSupport.value
            let stop = (localNextSupport ?? nextSupport)
                .map { safe(stopBelow($0.value, buffer: swingStop * 0.20)) }
                .flatMap { $0 } ?? safe(entry - swingStop)
            let target1 = bounceResistance.value
            if let stop, let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: swingHorizon) {
                setups.append(ChartAnalysisPayload.TradeSetup(
                    horizon: swingHorizon,
                    direction: "Bullish",
                    setup: "Relief bounce (countertrend)",
                    trigger: "Reclaims \(bounceSupport.price) and holds above it (relief bounce)",
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [fmt(target1)],
                    rr: rr(entry: entry, stop: stop, target: target1),
                    notes: baseNotes(horizon: swingHorizon) + [
                        "Countertrend idea: keep size small; invalidation is strict."
                    ]
                ))
            }
        }

        if allowSwing, kind == .monthly, setups.isEmpty {
            let monthlyBullStructure = (
                dominantBias == "Bullish"
                || isBullishTrendRegime
                || isBullishReboundRegime
                || (priceAboveEMA200 && priceAboveEMA50 && (ema20 ?? lastClose) >= (ema50 ?? lastClose))
                || (priceAboveEMA200 && macdIsBullish && rsiValue >= 48)
            )
            let monthlyBearStructure = (
                dominantBias == "Bearish"
                || isBearishTrendRegime
                || isBearishPullbackRegime
                || (isBelowEMA200Regime && !priceAboveEMA50 && (ema20 ?? lastClose) <= (ema50 ?? lastClose))
                || (isBelowEMA200Regime && macdIsBearish && rsiValue <= 52)
            )

            if monthlyBullStructure,
               let entry = safe(lastClose),
               let stop = cappedLongStop(
                    entry: entry,
                    anchor: ema20 ?? ema50 ?? (localSupport ?? support)?.value,
                    fallback: entry - swingStop
               ) {
                let fallbackAnchor = max(entry, lastClose)
                let candidates = [
                    (localResistance ?? resistance)?.value,
                    (localNextResistance ?? nextResistance)?.value,
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 3.0),
                    fallbackTargetAbove(from: fallbackAnchor, multiplier: 4.4)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: swingHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: swingHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: swingHorizon,
                            direction: "Bullish",
                            setup: "Monthly trend continuation",
                            trigger: "Position with the monthly trend from current structure",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: swingHorizon) + [
                                "Monthly fallback: levels are sparse, so the engine uses current trend structure."
                            ]
                        ))
                    }
                }
            } else if monthlyBearStructure,
                      let entry = safe(lastClose),
                      let stop = cappedShortStop(
                        entry: entry,
                        anchor: ema20 ?? ema50 ?? (localResistance ?? resistance)?.value,
                        fallback: entry + swingStop
                      ) {
                let fallbackAnchor = min(entry, lastClose)
                let candidates = [
                    (localSupport ?? support)?.value,
                    (localNextSupport ?? nextSupport)?.value,
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: 3.2),
                    fallbackTargetBelow(from: fallbackAnchor, multiplier: 4.6)
                ].compactMap { $0 }
                if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: swingHorizon) {
                    let target1 = picked.t1
                    let target2 = picked.t2
                    if let rrV = rrValue(entry: entry, stop: stop, target: target1), rrV >= minRR(for: swingHorizon) {
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: swingHorizon,
                            direction: "Bearish",
                            setup: "Monthly trend continuation",
                            trigger: "Position with the monthly downtrend from current structure",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: swingHorizon) + [
                                "Monthly fallback: levels are sparse, so the engine uses current trend structure."
                            ]
                        ))
                    }
                }
            } else if let entry = safe(lastClose) {
                // Monthly data is sparse and often trends without nearby actionable levels.
                // Fall back to the dominant EMA structure so monthly backtests don't go empty.
                let favorLong = priceAboveEMA200 || (ema20 ?? lastClose) >= (ema50 ?? lastClose)
                if favorLong,
                   let stop = cappedLongStop(
                        entry: entry,
                        anchor: ema50 ?? ema20 ?? (localSupport ?? support)?.value,
                        fallback: entry - swingStop
                   ) {
                    let fallbackAnchor = max(entry, lastClose)
                    let candidates = [
                        (localResistance ?? resistance)?.value,
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 2.8),
                        fallbackTargetAbove(from: fallbackAnchor, multiplier: 4.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: swingHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: swingHorizon,
                            direction: "Bullish",
                            setup: "Monthly structure continuation",
                            trigger: "Monthly structure remains constructive above major trend anchors",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: swingHorizon) + [
                                "Monthly fallback: using broad EMA structure because nearby monthly levels are sparse."
                            ]
                        ))
                    }
                } else if let stop = cappedShortStop(
                    entry: entry,
                    anchor: ema50 ?? ema20 ?? (localResistance ?? resistance)?.value,
                    fallback: entry + swingStop
                ) {
                    let fallbackAnchor = min(entry, lastClose)
                    let candidates = [
                        (localSupport ?? support)?.value,
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 2.8),
                        fallbackTargetBelow(from: fallbackAnchor, multiplier: 4.0)
                    ].compactMap { $0 }
                    if let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: swingHorizon) {
                        let target1 = picked.t1
                        let target2 = picked.t2
                        setups.append(ChartAnalysisPayload.TradeSetup(
                            horizon: swingHorizon,
                            direction: "Bearish",
                            setup: "Monthly structure continuation",
                            trigger: "Monthly structure remains weak below major trend anchors",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [target1, target2].compactMap { $0 }.prefix(3).map { fmt($0) },
                            rr: rr(entry: entry, stop: stop, target: target1),
                            notes: baseNotes(horizon: swingHorizon) + [
                                "Monthly fallback: using broad EMA structure because nearby monthly levels are sparse."
                            ]
                        ))
                    }
                }
            }
        }

        func horizonRank(_ horizon: String) -> Int {
            let cleaned = horizon.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if cleaned.contains("swing") { return 3 }
            if cleaned.contains("short") { return 2 }
            if cleaned.contains("scalp") { return 1 }
            return 0
        }

        func rrScore(_ rr: String?) -> Double {
            guard let rr else { return 0 }
            let cleaned = rr.lowercased().replacingOccurrences(of: " ", with: "")
            let parts = cleaned.split(separator: ":")
            if parts.count == 2, let denom = Double(parts[1]), denom.isFinite {
                return denom
            }
            if let value = Double(cleaned.filter { $0.isNumber || $0 == "." }) {
                return value
            }
            return 0
        }

        func normalizedPriceKey(_ value: String?) -> String {
            guard let value else { return "none" }
            let cleaned = value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: ",", with: "")
            let allowed = cleaned.filter { $0.isNumber || $0 == "." || $0 == "-" }
            return allowed.isEmpty ? "none" : allowed
        }

        func dedupeKey(for setup: ChartAnalysisPayload.TradeSetup) -> String {
            let direction = setup.direction.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let entry = normalizedPriceKey(setup.entry)
            let firstTarget = normalizedPriceKey(setup.targets.first)
            return [direction, entry, firstTarget].joined(separator: "::")
        }

        struct ScoredSetup {
            let key: String
            let index: Int
            let rr: Double
            let horizonRank: Int
            let setup: ChartAnalysisPayload.TradeSetup
        }

        let scored = setups.enumerated().map { (index, setup) in
            ScoredSetup(
                key: dedupeKey(for: setup),
                index: index,
                rr: rrScore(setup.rr),
                horizonRank: horizonRank(setup.horizon),
                setup: setup
            )
        }

        var bestByKey: [String: ScoredSetup] = [:]
        bestByKey.reserveCapacity(scored.count)
        for item in scored {
            if let existing = bestByKey[item.key] {
                if item.horizonRank > existing.horizonRank {
                    bestByKey[item.key] = item
                } else if item.horizonRank == existing.horizonRank, item.rr > existing.rr {
                    bestByKey[item.key] = item
                }
            } else {
                bestByKey[item.key] = item
            }
        }

        let deduped = scored
            .filter { bestByKey[$0.key]?.index == $0.index }
            .sorted { $0.index < $1.index }
            .map(\.setup)

        func requiredMinimumRR(for setup: ChartAnalysisPayload.TradeSetup) -> Double {
            let horizon = setup.horizon.lowercased()
            let text = (setup.setup + " " + setup.trigger).lowercased()
            var floor: Double = 1.10
            if horizon.contains("swing") || horizon.contains("position") {
                floor = 1.25
            } else if horizon.contains("short") {
                floor = 1.15
            } else if horizon.contains("scalp") {
                floor = 0.95
            }
            if text.contains("watch") || text.contains("reclaim") || text.contains("breakdown") {
                floor = max(
                    floor,
                    horizon.contains("swing") || horizon.contains("position") ? 1.35 : 1.15
                )
            }
            if text.contains("countertrend") || text.contains("relief bounce") {
                floor = max(floor, 1.80)
            }
            return floor
        }

        func setupText(_ setup: ChartAnalysisPayload.TradeSetup) -> String {
            (setup.setup + " " + setup.trigger)
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        }

        func parsedPrices(from text: String?) -> [Double] {
            guard let text else { return [] }
            let cleaned = text.replacingOccurrences(of: ",", with: "")
            let tokens = cleaned.split { character in
                !(character.isNumber || character == "." || character == "-")
            }
            return tokens.compactMap { token in
                let value = Double(token)
                return value?.isFinite == true ? value : nil
            }
        }

        func setupReferencePrice(_ setup: ChartAnalysisPayload.TradeSetup) -> Double? {
            if let entry = parsedPrices(from: setup.entry).first {
                return entry
            }
            let triggerPrices = parsedPrices(from: setup.trigger)
            if triggerPrices.isEmpty { return nil }
            return triggerPrices.min { lhs, rhs in
                abs(lhs - lastClose) < abs(rhs - lastClose)
            }
        }

        func headlineDistanceLimits(for setup: ChartAnalysisPayload.TradeSetup) -> (pct: Double, atr: Double) {
            let text = setupText(setup)

            if isYahooFX {
                switch kind {
                case .intraday: return text.contains("range rotation") || text.contains("pullback") ? (0.012, 3.5) : (0.018, 4.2)
                case .daily: return text.contains("range rotation") || text.contains("pullback") ? (0.020, 4.5) : (0.028, 5.5)
                case .weekly, .monthly: return text.contains("range rotation") || text.contains("pullback") ? (0.035, 6.0) : (0.050, 7.0)
                }
            }

            switch kind {
            case .intraday:
                return text.contains("pullback") || text.contains("rotation") ? (0.022, 2.8) : (0.030, 3.4)
            case .daily:
                return text.contains("pullback") || text.contains("rotation") ? (0.035, 3.8) : (0.050, 4.5)
            case .weekly, .monthly:
                return text.contains("pullback") || text.contains("rotation") ? (0.070, 5.0) : (0.100, 6.2)
            }
        }

        func passesHeadlineProximity(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            guard let reference = setupReferencePrice(setup), lastClose > 0 else { return false }
            let limits = headlineDistanceLimits(for: setup)
            let distancePct = abs(reference - lastClose) / lastClose
            let distanceAtr = atr > 0 ? abs(reference - lastClose) / atr : .greatestFiniteMagnitude
            return distancePct <= limits.pct || distanceAtr <= limits.atr
        }

        func passesHeadlineAlignment(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return true }

            let text = setupText(setup)
            let isBullish = direction.contains("bull")
            let rr = rrScore(setup.rr)
            let contradictionFloor = isRangeEnvironment ? 1.15 : 1.30
            let weakArchetype = text.contains("watch") || text.contains("reclaim") || text.contains("breakdown")

            if !isYahooFX {
                if isBullish && dominantBias == "Bearish" {
                    guard strongBullishReversalSignal, rr >= contradictionFloor, weakArchetype == false else { return false }
                }
                if !isBullish && dominantBias == "Bullish" {
                    guard strongBearishReversalSignal, rr >= contradictionFloor, weakArchetype == false else { return false }
                }
            }

            if isRangeEnvironment == false {
                if isBullish && isBearishTrendRegime && strongBullishReversalSignal == false { return false }
                if !isBullish && isBullishTrendRegime && strongBearishReversalSignal == false { return false }
            }

            return true
        }

        func hasCleanTriggerSpacing(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let text = setupText(setup)
            let triggerDriven = text.contains("reclaim") || text.contains("breakdown") || text.contains("watch")
            if triggerDriven == false { return true }

            guard passesHeadlineProximity(setup) else { return false }
            guard setup.targets.isEmpty == false else { return false }

            let rr = rrScore(setup.rr)
            let requiredRR: Double = {
                if isYahooFX {
                    return kind == .weekly || kind == .monthly ? 1.15 : 1.00
                }
                return kind == .weekly || kind == .monthly ? 1.20 : 1.00
            }()
            guard rr >= requiredRR else { return false }

            if let entry = setupReferencePrice(setup),
               let firstTarget = parsedPrices(from: setup.targets.first).first {
                let distancePct = abs(firstTarget - entry) / max(entry, 0.000001)
                let minimumMovePct: Double = {
                    switch kind {
                    case .intraday: return isYahooFX ? 0.0008 : 0.003
                    case .daily: return isYahooFX ? 0.0015 : 0.006
                    case .weekly, .monthly: return isYahooFX ? 0.0025 : 0.010
                    }
                }()
                return distancePct >= minimumMovePct
            }

            return true
        }

        func maximumRRThreshold(for setup: ChartAnalysisPayload.TradeSetup) -> Double {
            maximumRRThreshold(forHorizon: setup.horizon)
        }

        func maximumRRThreshold(forHorizon rawHorizon: String) -> Double {
            guard isYahooFX == false else {
                switch kind {
                case .intraday: return 8.0
                case .daily: return 6.0
                case .weekly, .monthly: return 5.0
                }
            }

            let horizon = rawHorizon.lowercased()
            if horizon.contains("swing") || horizon.contains("position") {
                return 6.0
            }
            switch kind {
            case .intraday, .daily:
                return 4.94
            case .weekly, .monthly:
                return 6.0
            }
        }

        func meetsMinimumRR(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            if setup.direction.lowercased().contains("neutral") {
                return true
            }
            let value = rrScore(setup.rr)
            return value >= requiredMinimumRR(for: setup) && value <= maximumRRThreshold(for: setup)
        }

        func hasMinimumStopDistance(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return true }

            let horizon = setup.horizon.lowercased()
            guard horizon.contains("swing") || horizon.contains("position") else { return true }
            guard let entry = parsedPrices(from: setup.entry).first,
                  let stop = parsedPrices(from: setup.stop).first,
                  entry > 0 else {
                return false
            }

            let riskPct = abs(entry - stop) / entry
            return riskPct >= 0.0045
        }

        func minimumHeadlineRR(for setup: ChartAnalysisPayload.TradeSetup) -> Double {
            let horizon = setup.horizon.lowercased()
            let text = setupText(setup)

            var floor: Double
            if horizon.contains("swing") || horizon.contains("position") {
                floor = 1.10
            } else if horizon.contains("short") {
                floor = 1.00
            } else if horizon.contains("scalp") {
                floor = 0.85
            } else {
                floor = 1.00
            }

            if isYahooFX == false {
                if horizon.contains("swing") || horizon.contains("position") {
                    floor = max(floor, 1.15)
                } else {
                    floor = max(floor, 0.95)
                }
            }

            if text.contains("reclaim watch") || text.contains("breakdown watch") || text.contains("scenario watch") {
                floor = max(
                    floor,
                    horizon.contains("swing") || horizon.contains("position")
                        ? (isYahooFX ? 1.25 : 1.30)
                        : (isYahooFX ? 1.05 : 1.00)
                )
            } else if text.contains("reclaim") || text.contains("breakdown") || text.contains("watch") {
                floor = max(
                    floor,
                    horizon.contains("swing") || horizon.contains("position")
                        ? (isYahooFX ? 1.20 : 1.25)
                        : (isYahooFX ? 1.00 : 1.00)
                )
            } else if text.contains("pullback") || text.contains("rotation") {
                floor = max(
                    floor,
                    horizon.contains("swing") || horizon.contains("position")
                        ? (isYahooFX ? 1.00 : 1.10)
                        : (isYahooFX ? 0.85 : 0.95)
                )
            }

            return floor
        }

        func passesHeadlineQuality(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") {
                return true
            }

            guard setup.targets.isEmpty == false else { return false }
            let rr = rrScore(setup.rr)
            guard rr >= minimumHeadlineRR(for: setup) else { return false }

            let text = setupText(setup)
            if text.contains("scenario watch"), setup.entry == nil && setup.stop == nil {
                return false
            }
            if hasCleanTriggerSpacing(setup) == false {
                return false
            }
            if passesHeadlineProximity(setup) == false {
                return false
            }
            if passesHeadlineAlignment(setup) == false {
                return false
            }

            return true
        }

        func isBullishSetup(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            setup.direction.lowercased().contains("bull")
        }

        func isCountertrendLike(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let text = (setup.setup + " " + setup.trigger).lowercased()
            return text.contains("countertrend")
                || text.contains("relief bounce")
                || text.contains("reclaim")
                || text.contains("pullback buy")
                || text.contains("range reclaim bounce")
        }

        func isReclaimWatch(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let text = (setup.setup + " " + setup.trigger).lowercased()
            return text.contains("reclaim watch") || text.contains("reclaim above")
        }

        func passesDirectionalContext(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return true }

            let isBullish = isBullishSetup(setup)
            let strongContextAgainstBull = (dominantBias == "Bearish" && structureIsBearish)
                || inHardBearishContext
                || (isBearishTrendRegime && structureIsBearish && !isRangeEnvironment)
            let strongContextAgainstBear = (dominantBias == "Bullish" && structureIsBullish)
                || inHardBullishContext
                || (isBullishTrendRegime && structureIsBullish && !isRangeEnvironment)

            if isBullish && strongContextAgainstBull {
                if isCountertrendLike(setup) { return false }
                return strongBullishReversalSignal
            }
            if !isBullish && strongContextAgainstBear {
                if isCountertrendLike(setup) { return false }
                return strongBearishReversalSignal
            }
            if isReclaimWatch(setup) && !isCryptoSymbol {
                if isBullish {
                    let alignedBullBias = dominantBias == "Bullish" || (isBullishTrendRegime && !structureIsBearish)
                    if !alignedBullBias { return false }
                } else {
                    let alignedBearBias = dominantBias == "Bearish" || (isBearishTrendRegime && !structureIsBullish)
                    if !alignedBearBias { return false }
                }
            }
            return true
        }

        func finalPrimaryFloor(for setup: ChartAnalysisPayload.TradeSetup) -> Double {
            let horizon = setup.horizon.lowercased()
            let text = setupText(setup)

            if isYahooFX {
                if horizon.contains("swing") || horizon.contains("position") { return isAggressiveRisk ? 1.05 : 1.15 }
                return isAggressiveRisk ? 0.85 : 0.95
            }

            var floor: Double
            if horizon.contains("swing") || horizon.contains("position") {
                floor = isAggressiveRisk ? 1.05 : 1.15
            } else {
                floor = isAggressiveRisk ? 0.85 : 0.95
            }

            if text.contains("reclaim") || text.contains("breakdown") || text.contains("watch") {
                let watchFloor = isAggressiveRisk
                    ? (horizon.contains("swing") || horizon.contains("position") ? 1.10 : 0.95)
                    : (horizon.contains("swing") || horizon.contains("position") ? 1.25 : 1.05)
                floor = max(floor, watchFloor)
            }

            return floor
        }

        func isHighRiskConditionalIdea(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            guard isAggressiveRisk else { return false }
            let text = setupText(setup)
            return text.contains("watch")
                || text.contains("conditional")
                || text.contains("speculative")
                || text.contains("aggressive")
                || text.contains("reclaim")
                || text.contains("breakdown")
                || text.contains("liquidity sweep")
                || text.contains("sweep")
                || text.contains("divergence")
                || text.contains("early reversal")
                || text.contains("breakout anticipation")
                || text.contains("countertrend")
        }

        func hasBiasContradiction(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return false }

            let isBullish = direction.contains("bull")
            if isBullish {
                if dominantBias == "Bearish" { return isHighRiskConditionalIdea(setup) == false }
                if isBearishTrendRegime && strongBullishReversalSignal == false { return isHighRiskConditionalIdea(setup) == false }
                if structureIsBearish && isRangeEnvironment == false { return isHighRiskConditionalIdea(setup) == false }
            } else {
                if dominantBias == "Bullish" { return isHighRiskConditionalIdea(setup) == false }
                if isBullishTrendRegime && strongBearishReversalSignal == false { return isHighRiskConditionalIdea(setup) == false }
                if structureIsBullish && isRangeEnvironment == false { return isHighRiskConditionalIdea(setup) == false }
            }
            return false
        }

        func indicatorStackPoints() -> (bullish: Int, bearish: Int) {
            var bullish = 0
            var bearish = 0

            if dominantBias == "Bullish" { bullish += 3 }
            if dominantBias == "Bearish" { bearish += 3 }

            if structureIsBullish { bullish += 2 }
            if structureIsBearish { bearish += 2 }

            if isBullishTrendRegime || isBullishReboundRegime || isBullishPullbackRegime {
                bullish += 1
            }
            if isBearishTrendRegime || isBearishReboundRegime || isBearishPullbackRegime {
                bearish += 1
            }

            if let ema20, let ema50 {
                if ema20 > ema50 { bullish += 1 }
                if ema20 < ema50 { bearish += 1 }
            }
            if ema200 != nil {
                if priceAboveEMA200 { bullish += 1 }
                else { bearish += 1 }
            }

            if rsiValue >= 55 { bullish += 1 }
            if rsiValue <= 45 { bearish += 1 }

            if useMACDFilter {
                if macdHistValue > 0 { bullish += 1 }
                if macdHistValue < 0 { bearish += 1 }
            }

            if let plus = adx.plusDI, let minus = adx.minusDI {
                if plus > minus { bullish += 1 }
                if minus > plus { bearish += 1 }
            }

            return (bullish, bearish)
        }

        func hasIndicatorStackContradiction(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return false }

            let points = indicatorStackPoints()
            let directionalScore = direction.contains("bull")
                ? points.bullish - points.bearish
                : points.bearish - points.bullish

            guard directionalScore <= -3 else { return false }
            if isHighRiskConditionalIdea(setup), directionalScore > -5 {
                return false
            }

            let text = setupText(setup)
            if text.contains("range rotation") && isRangeEnvironment && directionalScore > -5 {
                return false
            }
            if text.contains("watch") || text.contains("reclaim") || text.contains("breakdown") {
                return directionalScore <= -4
            }
            return true
        }

        func confluenceConflictProfile(_ setup: ChartAnalysisPayload.TradeSetup) -> (support: Int, against: Int, severeAgainst: Int) {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return (0, 0, 0) }

            let wantsBullish = direction.contains("bull")
            let text = setupText(setup)
            let isDirectionalContinuation = text.contains("continuation")
                || text.contains("pullback")
                || text.contains("breakout")
                || text.contains("breakdown")
                || text.contains("trend")
            var support = 0
            var against = 0
            var severeAgainst = 0

            func addDirectional(_ bullishCondition: Bool, weight: Int = 1, severe: Bool = false) {
                if wantsBullish {
                    if bullishCondition {
                        support += weight
                    } else {
                        against += weight
                        if severe { severeAgainst += 1 }
                    }
                } else {
                    if bullishCondition {
                        against += weight
                        if severe { severeAgainst += 1 }
                    } else {
                        support += weight
                    }
                }
            }

            if useRSIFilter {
                if rsiValue >= 55 {
                    addDirectional(true)
                } else if rsiValue <= 45 {
                    addDirectional(false, weight: 2, severe: true)
                } else if rsiValue < 50 {
                    addDirectional(false)
                } else {
                    addDirectional(true)
                }
            }
            if useMACDFilter {
                addDirectional(macdHistValue >= 0, severe: true)
            }
            if let k = stochK, let d = stochD {
                if k < d {
                    addDirectional(false)
                } else if k > d {
                    addDirectional(true)
                }
                if k >= 85 && k <= d {
                    addDirectional(false, severe: true)
                }
                if k <= 15 && k >= d {
                    addDirectional(true, severe: true)
                }
            }
            if let plus = adx.plusDI, let minus = adx.minusDI, plus != minus {
                addDirectional(plus > minus)
            }
            if obvIsFalling {
                addDirectional(false, severe: isDirectionalContinuation && volRatio > 0.85)
            } else if obvIsRising {
                addDirectional(true, severe: isDirectionalContinuation && volRatio > 0.85)
            }
            if rocIsFalling {
                addDirectional(false, severe: isDirectionalContinuation)
            } else if rocIsRising {
                addDirectional(true, severe: isDirectionalContinuation)
            }
            if regressionIsFalling {
                addDirectional(false, weight: isDirectionalContinuation ? 2 : 1, severe: true)
            } else if regressionIsRising {
                addDirectional(true, weight: isDirectionalContinuation ? 2 : 1, severe: true)
            }
            if bearishPatternHasContext {
                addDirectional(false, weight: 2, severe: true)
            } else if hasBearishPattern {
                addDirectional(false)
            }
            if bullishPatternHasContext {
                addDirectional(true, weight: 2, severe: true)
            } else if hasBullishPattern {
                addDirectional(true)
            }
            if hasBearishDivergence {
                addDirectional(false, weight: 2, severe: true)
            }
            if hasBullishDivergence {
                addDirectional(true, weight: 2, severe: true)
            }
            if wantsBullish {
                if isBullishExhausted && (stochIsRollingDown || macdHistValue < 0 || obvIsFalling || bearishPatternHasContext || hasBearishDivergence) {
                    against += 2
                    severeAgainst += 1
                }
                if trendStrengthValue < -0.08 {
                    against += 1
                }
                if isDirectionalContinuation && useVolumeFilter && isLowVolume && volRatio < 0.85 {
                    against += 1
                }
            } else {
                if isBearishExhausted && (stochIsRollingUp || macdHistValue > 0 || obvIsRising || bullishPatternHasContext || hasBullishDivergence) {
                    against += 2
                    severeAgainst += 1
                }
                if trendStrengthValue > 0.08 {
                    against += 1
                }
                if isDirectionalContinuation && useVolumeFilter && isLowVolume && volRatio < 0.85 {
                    against += 1
                }
            }

            return (support, against, severeAgainst)
        }

        func isMediumConditionalIdea(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            guard isBalancedRisk else { return false }
            let text = setupText(setup)
            let isConditional = text.contains("watch")
                || text.contains("conditional")
                || text.contains("confirmation")
                || text.contains("reclaim")
                || text.contains("breakdown")
                || text.contains("range rotation")
                || text.contains("support-hold")
                || text.contains("resistance fade")
            guard isConditional else { return false }
            guard rrScore(setup.rr) >= 1.25 else { return false }
            let profile = confluenceConflictProfile(setup)
            guard profile.severeAgainst == 0, profile.against <= 2 else { return false }
            guard hasLateTrendExhaustionCluster(setup) == false else { return false }
            return true
        }

        func isRelaxedRiskConditionalIdea(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            isHighRiskConditionalIdea(setup) || isMediumConditionalIdea(setup)
        }

        func hasRawIndicatorContradiction(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return false }

            let wantsBullish = direction.contains("bull")
            var support = 0
            var against = 0

            func addBullish(_ condition: Bool) {
                if wantsBullish {
                    if condition { support += 1 } else { against += 1 }
                } else {
                    if condition { against += 1 } else { support += 1 }
                }
            }

            if let ema20, let ema50 {
                addBullish(ema20 >= ema50)
            }
            if ema200 != nil {
                addBullish(priceAboveEMA200)
            }
            if useRSIFilter {
                if rsiValue >= 55 {
                    addBullish(true)
                } else if rsiValue <= 45 {
                    addBullish(false)
                }
            }
            if useMACDFilter {
                addBullish(macdHistValue >= 0)
            }
            if let plus = adx.plusDI, let minus = adx.minusDI, plus != minus {
                addBullish(plus > minus)
            }
            if structureIsBullish {
                addBullish(true)
            } else if structureIsBearish {
                addBullish(false)
            }

            let text = setupText(setup)
            let strictContradiction = against >= 4 && (against - support) >= 2
            if strictContradiction { return true }

            let directionalSetup = text.contains("continuation")
                || text.contains("pullback")
                || text.contains("reclaim")
                || text.contains("breakdown")
            return directionalSetup && against >= 3 && support == 0
        }

        func hasConfirmationQualityFailure(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return false }

            let wantsBullish = direction.contains("bull")
            let text = setupText(setup)
            let isDirectionalIdea = text.contains("continuation")
                || text.contains("pullback")
                || text.contains("reclaim")
                || text.contains("breakdown")
                || text.contains("trend")
            let isWatchIdea = text.contains("watch") || text.contains("reclaim") || text.contains("breakdown")

            if wantsBullish && bearishPatternHasContext {
                return true
            }
            if !wantsBullish && bullishPatternHasContext {
                return true
            }

            let profile = confluenceConflictProfile(setup)
            let support = profile.support
            let against = profile.against
            let severeAgainst = profile.severeAgainst

            let hardAgainst = isAggressiveRisk ? 5 : (isBalancedRisk ? 4 : 3)
            if against >= hardAgainst {
                return true
            }
            if severeAgainst >= 2 && against >= (isAggressiveRisk ? 5 : 4) {
                return true
            }
            if isDirectionalIdea && severeAgainst >= 1 && against >= (isAggressiveRisk ? 4 : 3) && support <= 1 {
                return true
            }
            if isDirectionalIdea && against >= (isAggressiveRisk ? 4 : 3) && (against - support) >= (isAggressiveRisk ? 4 : 3) {
                return true
            }
            if isDirectionalIdea && against >= 5 && (against - support) >= 2 {
                return true
            }
            if isDirectionalIdea && against >= 4 && support <= 1 {
                return true
            }
            if isWatchIdea && against >= 6 && (against - support) >= 3 {
                return true
            }

            return false
        }

        func hasRegimeLayerFailure(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return false }

            let text = setupText(setup)
            let wantsBullish = direction.contains("bull")
            let isRangeIdea = text.contains("range")
                || text.contains("rotation")
                || text.contains("mean")
                || text.contains("reversion")
            let isContinuationIdea = text.contains("continuation")
                || text.contains("pullback")
                || text.contains("breakout")
                || text.contains("breakdown")
            let isWatchIdea = text.contains("watch") || text.contains("reclaim") || text.contains("breakdown")
            let cleanTrigger = hasCleanTriggerSpacing(setup)
            let rr = rrScore(setup.rr)

            if regimeLabelLooksRangeLike && isContinuationIdea && !isRangeIdea {
                if isWatchIdea {
                    let floor = isAggressiveRisk ? (isYahooFX ? 1.05 : 0.95) : (isYahooFX ? 1.20 : 1.10)
                    return rr < floor || (cleanTrigger == false && isHighRiskConditionalIdea(setup) == false)
                }
                return isHighRiskConditionalIdea(setup) == false
            }

            switch regimeLayer {
            case .ranging:
                if isContinuationIdea && !isRangeIdea {
                    if isWatchIdea {
                        let floor = isAggressiveRisk ? (isYahooFX ? 1.05 : 0.95) : (isYahooFX ? 1.20 : 1.10)
                        return rr < floor || (cleanTrigger == false && isHighRiskConditionalIdea(setup) == false)
                    }
                    return isHighRiskConditionalIdea(setup) == false
                }
            case .compression:
                if isContinuationIdea && !isWatchIdea && isHighRiskConditionalIdea(setup) == false {
                    return true
                }
                if isWatchIdea {
                    let floor = isAggressiveRisk ? (isYahooFX ? 1.05 : 0.95) : (isYahooFX ? 1.25 : 1.15)
                    return rr < floor || (cleanTrigger == false && isHighRiskConditionalIdea(setup) == false)
                }
            case .volatileExpansion:
                if isRangeIdea && adxValue >= 24 {
                    return true
                }
                if isContinuationIdea && !isWatchIdea && rr < 1.15 {
                    return true
                }
            case .reversalEnvironment:
                if wantsBullish && hasBearishReversalPressure { return true }
                if !wantsBullish && hasBullishReversalPressure { return true }
                if isContinuationIdea && !isWatchIdea && isHighRiskConditionalIdea(setup) == false {
                    return true
                }
            case .trending:
                if isRangeIdea && !isWatchIdea {
                    return true
                }
            }

            return false
        }

        func passesFinalPrimaryValidation(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let direction = setup.direction.lowercased()
            if direction.contains("neutral") { return false }
            guard matchesStyle(setup) else { return false }
            guard meetsMinimumRR(setup) else { return false }
            guard hasMinimumStopDistance(setup) else { return false }
            guard passesDirectionalContext(setup) else { return false }
            guard passesHeadlineQuality(setup) else { return false }

            let text = setupText(setup)
            let rr = rrScore(setup.rr)
            guard rr >= finalPrimaryFloor(for: setup) else { return false }

            if !isYahooFX && (text.contains("reclaim") || text.contains("breakdown")) {
                guard hasCleanTriggerSpacing(setup) else { return false }
                let strictFloor = kind == .weekly || kind == .monthly ? 1.25 : 1.05
                guard rr >= strictFloor else { return false }
            }

            if !isYahooFX && hasBiasContradiction(setup) {
                return false
            }
            if hasIndicatorStackContradiction(setup) && isHighRiskConditionalIdea(setup) == false {
                return false
            }
            if hasRawIndicatorContradiction(setup) && isRelaxedRiskConditionalIdea(setup) == false {
                return false
            }
            if hasConfirmationQualityFailure(setup) && isRelaxedRiskConditionalIdea(setup) == false {
                return false
            }
            if hasRegimeLayerFailure(setup) && isRelaxedRiskConditionalIdea(setup) == false {
                return false
            }
            if hasLateTrendExhaustionCluster(setup) && rr < (isAggressiveRisk ? 1.25 : 1.80) {
                return false
            }
            if hasChopContinuationCluster(setup) && rr < (isAggressiveRisk ? 1.10 : 1.50) {
                return false
            }

            return true
        }

        func matchesStyle(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            let horizon = setup.horizon.lowercased()
            let text = ([setup.horizon, setup.setup, setup.trigger] + setup.notes + setup.rationale)
                .joined(separator: " ")
                .lowercased()
            let isLowTFSetup = text.contains("low-tf")
                || text.contains("low‑tf")
                || text.contains("scalp")
            switch kind {
            case .intraday:
                if minutes <= 30 {
                    return horizon.contains("scalp") || horizon.contains("short")
                }
                if minutes < 240 {
                    return horizon.contains("short")
                        && !horizon.contains("scalp")
                        && !isLowTFSetup
                }
                return (horizon.contains("swing") || horizon.contains("position"))
                    && !isLowTFSetup
            case .daily:
                return (horizon.contains("swing") || horizon.contains("position"))
                    && !isLowTFSetup
            case .weekly, .monthly:
                return horizon.contains("position") || horizon.contains("swing")
            }
        }

        // Keep setups that match the timeframe horizon and minimum R:R.
        let filtered = deduped.filter { setup in
            matchesStyle(setup)
                && meetsMinimumRR(setup)
                && hasMinimumStopDistance(setup)
                && passesDirectionalContext(setup)
                && passesHeadlineQuality(setup)
                && (hasRawIndicatorContradiction(setup) == false || isRelaxedRiskConditionalIdea(setup))
                && (hasConfirmationQualityFailure(setup) == false || isRelaxedRiskConditionalIdea(setup))
                && (hasRegimeLayerFailure(setup) == false || isRelaxedRiskConditionalIdea(setup))
        }

        let base = filtered

        func isBearish(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
            setup.direction.lowercased().contains("bear")
        }

        func directionAlignmentScore(_ setup: ChartAnalysisPayload.TradeSetup) -> Int {
            let dir = setup.direction.lowercased()
            switch dominantBias.lowercased() {
            case _ where dominantBias.lowercased().contains("bull"):
                return dir.contains("bull") ? 1 : 0
            case _ where dominantBias.lowercased().contains("bear"):
                return dir.contains("bear") ? 1 : 0
            default:
                return 1
            }
        }

        func regimeSuitabilityScore(_ setup: ChartAnalysisPayload.TradeSetup) -> Int {
            let text = (setup.setup + " " + setup.trigger).lowercased()
            let isRangeIdea = text.contains("range") || text.contains("rotation") || text.contains("mean") || text.contains("reversion")
            let isContinuationIdea = text.contains("continuation") || text.contains("pullback") || text.contains("breakout") || text.contains("breakdown")
            let isWatchIdea = text.contains("watch") || text.contains("reclaim") || text.contains("breakdown")

            if regimeLabelLooksRangeLike {
                if isRangeIdea { return 4 }
                if isWatchIdea { return 1 }
                if isContinuationIdea { return 0 }
            }

            switch regimeLayer {
            case .ranging:
                return isRangeIdea ? 4 : (isWatchIdea ? 1 : 0)
            case .compression:
                return isWatchIdea ? 3 : (isContinuationIdea ? 0 : 1)
            case .volatileExpansion:
                if isWatchIdea { return 3 }
                if isContinuationIdea { return 2 }
                return isRangeIdea ? 0 : 1
            case .reversalEnvironment:
                return isWatchIdea ? 3 : (isContinuationIdea ? 0 : 1)
            case .trending:
                if isContinuationIdea { return 4 }
                return isRangeIdea ? 0 : 1
            }
        }

        func setupArchetypeScore(_ setup: ChartAnalysisPayload.TradeSetup) -> Int {
            let text = setupText(setup)
            let rr = rrScore(setup.rr)
            let cleanTrigger = hasCleanTriggerSpacing(setup)

            if regimeLayer == .ranging {
                if text.contains("range rotation") || text.contains("range reclaim bounce") { return 4 }
                if text.contains("pullback") || text.contains("continuation") { return 1 }
                if text.contains("reclaim") || text.contains("breakdown") {
                    if isYahooFX {
                        return rr >= 1.25 && cleanTrigger ? 1 : 0
                    }
                    return cleanTrigger ? 1 : 0
                }
                return 1
            }

            if regimeLayer == .compression {
                if text.contains("watch") || text.contains("reclaim") || text.contains("breakdown") {
                    return cleanTrigger ? 3 : 1
                }
                return text.contains("continuation") || text.contains("pullback") ? 0 : 1
            }

            if regimeLayer == .reversalEnvironment {
                if text.contains("watch") || text.contains("reclaim") || text.contains("breakdown") { return 3 }
                if text.contains("range rotation") { return 2 }
                if text.contains("continuation") || text.contains("pullback") { return 0 }
                return 1
            }

            if regimeLayer == .volatileExpansion {
                if text.contains("watch") || text.contains("breakout") || text.contains("breakdown") { return cleanTrigger ? 3 : 1 }
                if text.contains("pullback") || text.contains("continuation") { return 2 }
                if text.contains("range rotation") { return 0 }
                return 1
            }

            if regimeLayer == .trending {
                if text.contains("pullback") || text.contains("rejection") { return 5 }
                if text.contains("continuation") { return 4 }
                if text.contains("range rotation") { return 1 }
                if text.contains("reclaim") || text.contains("breakdown") {
                    if isYahooFX {
                        return rr >= 1.35 && cleanTrigger ? 2 : 0
                    }
                    return cleanTrigger ? 1 : 0
                }
                return 2
            }

            if text.contains("pullback") || text.contains("rejection") { return 3 }
            if text.contains("continuation") { return 2 }
            if text.contains("reclaim") || text.contains("breakdown") {
                if isYahooFX {
                    return rr >= 1.20 && cleanTrigger ? 1 : 0
                }
                return cleanTrigger ? 1 : 0
            }
            return 1
        }
        
        func setupConflictPenalty(_ setup: ChartAnalysisPayload.TradeSetup) -> Int {
            let text = setupText(setup)
            let bearish = isBearish(setup)
            var penalty = 0
            let profile = confluenceConflictProfile(setup)

            if bearish == false {
                if macdIsBullish == false { penalty += 1 }
                if rsiValue < 48 { penalty += 1 }
                if regressionIsFalling { penalty += 2 }
                if obvIsFalling && text.contains("continuation") { penalty += 1 }
                if text.contains("pullback buy") || text.contains("continuation") {
                    if isTrendingEnvironment == false { penalty += 1 }
                }
            } else {
                if macdIsBullish == true { penalty += 1 }
                if rsiValue > 52 { penalty += 1 }
                if regressionIsRising { penalty += 2 }
                if obvIsRising && text.contains("continuation") { penalty += 1 }
                if text.contains("pullback rejection") || text.contains("continuation") {
                    if isTrendingEnvironment == false { penalty += 1 }
                }
            }

            if profile.against >= 1 { penalty += profile.against }
            if profile.severeAgainst >= 1 { penalty += profile.severeAgainst }
            if hasLateTrendExhaustionCluster(setup) {
                penalty += 3
            }
            if hasChopContinuationCluster(setup) {
                penalty += 3
            }

            if isRangeEnvironment {
                if text.contains("pullback buy") || text.contains("pullback rejection") || text.contains("continuation") {
                    penalty += 1
                }
            }

            switch regimeLayer {
            case .ranging:
                if text.contains("continuation") || text.contains("breakout") || text.contains("breakdown") || text.contains("pullback") {
                    penalty += 2
                }
                if text.contains("range") || text.contains("rotation") || text.contains("mean") || text.contains("reversion") {
                    penalty = max(0, penalty - 1)
                }
            case .compression:
                if text.contains("continuation") || text.contains("pullback") {
                    penalty += 2
                }
                if text.contains("watch") || text.contains("reclaim") || text.contains("breakdown") {
                    penalty = max(0, penalty - 1)
                }
            case .volatileExpansion:
                if text.contains("range rotation") {
                    penalty += 2
                }
                if rrScore(setup.rr) < 1.15 {
                    penalty += 1
                }
            case .reversalEnvironment:
                if text.contains("continuation") || text.contains("pullback") {
                    penalty += 3
                }
                if text.contains("watch") || text.contains("reclaim") || text.contains("breakdown") {
                    penalty = max(0, penalty - 1)
                }
            case .trending:
                if text.contains("range rotation") || text.contains("mean reversion") {
                    penalty += 2
                }
            }

            if bearish, rsiValue <= 35 { penalty += 1 }
            if bearish == false, rsiValue >= 65 { penalty += 1 }

            return penalty
        }

        func setupConfidenceBucket(_ setup: ChartAnalysisPayload.TradeSetup) -> Int {
            let rr = rrScore(setup.rr)
            let penalty = setupConflictPenalty(setup)
            let conflicts = confluenceConflictProfile(setup).against
            if conflicts >= 3 { return 0 }
            if conflicts == 2 { return rr >= 1.8 ? 1 : 0 }
            if conflicts == 1 { return rr >= 1.4 ? 2 : 1 }
            if rr >= 2.0 && penalty == 0 { return 3 }
            if rr >= 1.25 && penalty <= 1 { return 2 }
            if rr >= 1.0 && penalty <= 2 { return 1 }
            return 0
        }

        func setupScore(_ setup: ChartAnalysisPayload.TradeSetup) -> (Int, Int, Int, Int, Double, Int) {
            let align = directionAlignmentScore(setup)
            let regimeScore = regimeSuitabilityScore(setup)
            let archetypeScore = setupArchetypeScore(setup)
            let confidenceBucket = setupConfidenceBucket(setup)
            let rrV = rrScore(setup.rr) - Double(setupConflictPenalty(setup)) * 0.45
            let h = horizonRank(setup.horizon)
            return (align, regimeScore, archetypeScore, confidenceBucket, rrV, h)
        }

        let sorted = base.sorted { lhs, rhs in
            let a = setupScore(lhs)
            let b = setupScore(rhs)
            if a.0 != b.0 { return a.0 > b.0 }
            if a.1 != b.1 { return a.1 > b.1 }
            if a.2 != b.2 { return a.2 > b.2 }
            if a.3 != b.3 { return a.3 > b.3 }
            if a.4 != b.4 { return a.4 > b.4 }
            return a.5 > b.5
        }

        let maxCount: Int = {
            switch kind {
            case .intraday: return 2
            case .daily:    return 2
            case .weekly, .monthly: return 1
            }
        }()
        var picked: [ChartAnalysisPayload.TradeSetup] = []
        picked.reserveCapacity(maxCount)
        let allowBoth = isRangeEnvironment || dominantBias == "Neutral"
        let preferLongInRange = isRangeEnvironment && macdIsBullish && (rsiValue >= 48)
        let preferShortInRange = isRangeEnvironment && (!macdIsBullish || rsiValue >= 52)
        // Both escape hatches or neither: a long could stay on the table against
        // a bearish bias, a short could not against a bullish one.
        let wantLong = dominantBias != "Bearish" || preferLongInRange || hasCountertrendTailwind
        let wantShort = dominantBias != "Bullish" || preferShortInRange || hasCountertrendHeadwind
        if wantLong,
           let bestLong = sorted.first(where: { isBearish($0) == false && !$0.direction.lowercased().contains("neutral") }) {
            picked.append(bestLong)
        }
        if (allowBoth || picked.isEmpty), wantShort, picked.count < maxCount,
           let bestShort = sorted.first(where: { isBearish($0) == true && !$0.direction.lowercased().contains("neutral") }) {
            picked.append(bestShort)
        }
        if picked.isEmpty, base.isEmpty == false, isCryptoSymbol {
            picked = Array(sorted.prefix(maxCount))
        }

        picked = picked.filter { passesFinalPrimaryValidation($0) }

        if picked.isEmpty {
            let finalSorted = sorted.filter { passesFinalPrimaryValidation($0) }
            if wantLong,
               let bestLong = finalSorted.first(where: { isBearish($0) == false }) {
                picked.append(bestLong)
            }
            if (allowBoth || picked.isEmpty), wantShort, picked.count < maxCount,
               let bestShort = finalSorted.first(where: { isBearish($0) == true }) {
                picked.append(bestShort)
            }
            if picked.isEmpty, isCryptoSymbol {
                picked = Array(finalSorted.prefix(maxCount))
            }
        }

        func directionalFallbackSetups() -> [ChartAnalysisPayload.TradeSetup] {
            let primarySupport = localSupport ?? support
            let primaryResistance = localResistance ?? resistance
            guard let primarySupport, let primaryResistance else { return [] }

            let fallbackHorizon = allowShortTerm ? defaultHorizon : swingHorizon

            func fallbackBullish() -> ChartAnalysisPayload.TradeSetup? {
                let entry = primarySupport.value
                let stop = (localNextSupport ?? nextSupport)
                    .map { safe(stopBelow($0.value, buffer: shortStop * 0.22)) }
                    .flatMap { $0 } ?? safe(stopBelow(entry, buffer: shortStop * 0.30))
                guard let stop else { return nil }

                let setupName: String
                let trigger: String
                if isRangeEnvironment {
                    setupName = "Range rotation"
                    trigger = "Support \(primarySupport.price) holds and rotates higher"
                } else if isTrendingEnvironment, macdIsBullish, rsiValue >= 50 {                    setupName = "Pullback buy"
                    trigger = "Pullback into \(primarySupport.price) holds and trend resumes"
                } else {
                    setupName = "Support-hold long"
                    trigger = "Acceptance above \(primarySupport.price) confirms a bullish response"
                }

                let candidates = [
                    primaryResistance.value,
                    (localNextResistance ?? nextResistance)?.value,
                    fallbackTargetAbove(from: max(entry, lastClose), multiplier: 2.4),
                    fallbackTargetAbove(from: max(entry, lastClose), multiplier: 3.2)
                ].compactMap { $0 }

                guard let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: fallbackHorizon) else {
                    return nil
                }

                return ChartAnalysisPayload.TradeSetup(
                    horizon: fallbackHorizon,
                    direction: "Bullish",
                    setup: setupName,
                    trigger: trigger,
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                    rr: rr(entry: entry, stop: stop, target: picked.t1),
                    notes: baseNotes(horizon: fallbackHorizon)
                )
            }

            func fallbackBearish() -> ChartAnalysisPayload.TradeSetup? {
                let entry = primaryResistance.value
                let stop = (localNextResistance ?? nextResistance)
                    .map { safe(stopAbove($0.value, buffer: shortStop * 0.22)) }
                    .flatMap { $0 } ?? safe(stopAbove(entry, buffer: shortStop * 0.30))
                guard let stop else { return nil }

                let setupName: String
                let trigger: String
                if isRangeEnvironment {
                    setupName = "Range rotation"
                    trigger = "Resistance \(primaryResistance.price) rejects and rotates lower"
                } else if isTrendingEnvironment, !macdIsBullish, rsiValue <= 50 {                    setupName = "Pullback rejection"
                    trigger = "Rejection from \(primaryResistance.price) resumes lower"
                } else {
                    setupName = "Resistance fade"
                    trigger = "Acceptance below \(primaryResistance.price) confirms bearish pressure"
                }

                let candidates = [
                    primarySupport.value,
                    (localNextSupport ?? nextSupport)?.value,
                    fallbackTargetBelow(from: min(entry, lastClose), multiplier: 2.4),
                    fallbackTargetBelow(from: min(entry, lastClose), multiplier: 3.2)
                ].compactMap { $0 }

                guard let picked = selectTargets(entry: entry, stop: stop, candidates: candidates, horizon: fallbackHorizon) else {
                    return nil
                }

                return ChartAnalysisPayload.TradeSetup(
                    horizon: fallbackHorizon,
                    direction: "Bearish",
                    setup: setupName,
                    trigger: trigger,
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [picked.t1, picked.t2].compactMap { $0 }.map { fmt($0) },
                    rr: rr(entry: entry, stop: stop, target: picked.t1),
                    notes: baseNotes(horizon: fallbackHorizon)
                )
            }

            var fallbacks: [ChartAnalysisPayload.TradeSetup] = []
            let prefersBull = dominantBias == "Bullish"
                || isBullishTrendRegime
                || isBullishReboundRegime
                || (isRangeEnvironment && dominantBias != "Bearish")
            let prefersBear = dominantBias == "Bearish"
                || isBearishTrendRegime
                || isBearishPullbackRegime
                || (isRangeEnvironment && dominantBias != "Bullish")

            if prefersBull, let setup = fallbackBullish(), passesFinalPrimaryValidation(setup) {
                fallbacks.append(setup)
            }
            if (prefersBear || fallbacks.isEmpty), let setup = fallbackBearish(), passesFinalPrimaryValidation(setup) {
                fallbacks.append(setup)
            }
            if isRangeEnvironment,
               fallbacks.count < 2,
               let setup = fallbackBullish(),
               passesFinalPrimaryValidation(setup),
               fallbacks.contains(where: { $0.direction == setup.direction }) == false {
                fallbacks.append(setup)
            }

            return fallbacks
        }

        if picked.isEmpty {
            let fallbackDirectional = directionalFallbackSetups()
            if fallbackDirectional.isEmpty == false {
                picked = Array(fallbackDirectional.prefix(maxCount))
            }
        }

        picked = picked.filter { passesFinalPrimaryValidation($0) }

        if picked.isEmpty,
           let neutral = deduped.first(where: { $0.direction.lowercased().contains("neutral") }) {
            return [neutral]
        }

        // Aggressive mode relaxed fallback — when bias + regime are strongly aligned but
        // primary R:R floors rejected everything. Generate a directional setup from
        // nearby levels with a wider stop so it still has a reasonable R:R.
        func relaxedAggressiveDirectionalSetups() -> [ChartAnalysisPayload.TradeSetup] {
            guard isAggressiveRisk else { return [] }

            let primarySupport = localSupport ?? support
            let primaryResistance = localResistance ?? resistance
            guard let primarySupport, let primaryResistance else { return [] }

            let horizon = allowShortTerm ? defaultHorizon : swingHorizon
            let atrValue = atr14 ?? (lastClose * 0.02)
            let wideStopBuffer = max(atrValue * 1.5, lastClose * 0.015)

            let regimeIsBull = isBullishTrendRegime || isBullishReboundRegime || isBullishReversalRegime || dominantBias == "Bullish"
            let regimeIsBear = isBearishTrendRegime || isBearishPullbackRegime || isBearishReversalRegime || dominantBias == "Bearish"
            let strongBull = regimeIsBull && dominantBias != "Bearish"
            let strongBear = regimeIsBear && dominantBias != "Bullish"

            var relaxed: [ChartAnalysisPayload.TradeSetup] = []

            // Generate a bullish setup if regime/bias lean bull
            if strongBull {
                let entry = primarySupport.value
                let stop = entry - wideStopBuffer
                let tp1 = primaryResistance.value
                let rawRR = rrValue(entry: entry, stop: stop, target: tp1) ?? 0
                if rawRR >= 0.8 {
                    var setup = ChartAnalysisPayload.TradeSetup(
                        horizon: horizon,
                        direction: "Bullish",
                        setup: isRangeEnvironment ? "Speculative range long" : (hasBullishReversalPressure ? "Early reversal long" : "Aggressive long watch"),
                        trigger: isRangeEnvironment
                            ? "Support \(primarySupport.price) holds and rotates higher"
                            : "Pullback into \(primarySupport.price) holds and trend resumes",
                        entry: fmt(entry),
                        stop: fmt(stop),
                        targets: [fmt(tp1)],
                        rr: rr(entry: entry, stop: stop, target: tp1),
                        notes: baseNotes(horizon: horizon) + [
                            "High risk mode: speculative/conditional setup, not a clean low-risk entry.",
                            "Wider stop than normal — position size accordingly."
                        ]
                    )
                    setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                    if passesFinalPrimaryValidation(setup) {
                        relaxed.append(setup)
                    }
                }
            }

            // Generate a bearish setup if regime/bias lean bear
            if strongBear {
                let entry = primaryResistance.value
                let stop = entry + wideStopBuffer
                let tp1 = primarySupport.value
                let rawRR = rrValue(entry: entry, stop: stop, target: tp1) ?? 0
                if rawRR >= 0.8 {
                    var setup = ChartAnalysisPayload.TradeSetup(
                        horizon: horizon,
                        direction: "Bearish",
                        setup: isRangeEnvironment ? "Speculative range short" : (hasBearishReversalPressure ? "Early reversal short" : "Aggressive short watch"),
                        trigger: isRangeEnvironment
                            ? "Resistance \(primaryResistance.price) rejects and rotates lower"
                            : "Rejection from \(primaryResistance.price) resumes lower",
                        entry: fmt(entry),
                        stop: fmt(stop),
                        targets: [fmt(tp1)],
                        rr: rr(entry: entry, stop: stop, target: tp1),
                        notes: baseNotes(horizon: horizon) + [
                            "High risk mode: speculative/conditional setup, not a clean low-risk entry.",
                            "Wider stop than normal — position size accordingly."
                        ]
                    )
                    setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                    if passesFinalPrimaryValidation(setup) {
                        relaxed.append(setup)
                    }
                }
            }

            // If neither regime is strong, pick the one matching dominant bias
            if relaxed.isEmpty {
                if dominantBias == "Bullish" {
                    let entry = primarySupport.value
                    let stop = entry - wideStopBuffer
                    let tp1 = primaryResistance.value
                    let rawRR = rrValue(entry: entry, stop: stop, target: tp1) ?? 0
                    if rawRR >= 0.8 {
                        var setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bullish",
                            setup: hasBullishReversalPressure ? "Speculative reversal long" : "Aggressive support-hold long",
                            trigger: "Acceptance above \(primarySupport.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [fmt(tp1)],
                            rr: rr(entry: entry, stop: stop, target: tp1),
                            notes: baseNotes(horizon: horizon) + [
                                "High risk mode: speculative/conditional setup, not a clean low-risk entry.",
                                "Wider stop than normal — position size accordingly."
                            ]
                        )
                        setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                        if passesFinalPrimaryValidation(setup) {
                            relaxed.append(setup)
                        }
                    }
                } else if dominantBias == "Bearish" {
                    let entry = primaryResistance.value
                    let stop = entry + wideStopBuffer
                    let tp1 = primarySupport.value
                    let rawRR = rrValue(entry: entry, stop: stop, target: tp1) ?? 0
                    if rawRR >= 0.8 {
                        var setup = ChartAnalysisPayload.TradeSetup(
                            horizon: horizon,
                            direction: "Bearish",
                            setup: hasBearishReversalPressure ? "Speculative reversal short" : "Aggressive resistance fade short",
                            trigger: "Acceptance below \(primaryResistance.price)",
                            entry: fmt(entry),
                            stop: fmt(stop),
                            targets: [fmt(tp1)],
                            rr: rr(entry: entry, stop: stop, target: tp1),
                            notes: baseNotes(horizon: horizon) + [
                                "High risk mode: speculative/conditional setup, not a clean low-risk entry.",
                                "Wider stop than normal — position size accordingly."
                            ]
                        )
                        setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                        if passesFinalPrimaryValidation(setup) {
                            relaxed.append(setup)
                        }
                    }
                }
            }

            return relaxed
        }

        if let relaxed = relaxedAggressiveDirectionalSetups().first {
            return [relaxed]
        }

        if picked.isEmpty,
           isYahooFX,
           let fallbackSupport = localSupport ?? support,
           let fallbackResistance = localResistance ?? resistance {
           let regimeIsBull = isBullishTrendRegime || isBullishReboundRegime || isBullishReversalRegime || dominantBias == "Bullish"
           let regimeIsBear = isBearishTrendRegime || isBearishPullbackRegime || isBearishReversalRegime || dominantBias == "Bearish"
            let fxBullWatchAllowed = regimeIsBull
                && hasBearishPattern == false
                && hasBearishDivergence == false
                && !(useRSIFilter && rsiValue < 50 && useMACDFilter && macdHistValue < 0)
                && !(obvIsFalling && regressionIsFalling)
            let fxBearWatchAllowed = regimeIsBear
                && hasBullishPattern == false
                && hasBullishDivergence == false
                && !(useRSIFilter && rsiValue > 50 && useMACDFilter && macdHistValue > 0)
                && !(obvIsRising && regressionIsRising)
            let fxSetupName: String
            let fxTrigger: String
            let fxRationale: [String]
            if fxBullWatchAllowed {
                fxSetupName = "FX breakout watch"
                fxTrigger = "Watch for hold above \(fallbackResistance.price)"
                fxRationale = [
                    "Bullish FX context is leaning into nearby resistance without a clean entry yet.",
                    "A confirmed hold above \(fallbackResistance.price) is the cleaner continuation trigger.",
                    "Loss of \(fallbackSupport.price) weakens the immediate bullish structure."
                ]
            } else if fxBearWatchAllowed {
                fxSetupName = "FX breakdown watch"
                fxTrigger = "Watch for break below \(fallbackSupport.price)"
                fxRationale = [
                    "Bearish FX context is leaning into nearby support without a clean entry yet.",
                    "A confirmed break below \(fallbackSupport.price) is the cleaner continuation trigger.",
                    "Reclaim above \(fallbackResistance.price) weakens the immediate bearish structure."
                ]
            } else {
                fxSetupName = "FX decision watch"
                fxTrigger = "Wait for reclaim above \(fallbackResistance.price) or breakdown below \(fallbackSupport.price)"
                fxRationale = [
                    "FX price is still between nearby decision levels.",
                    "Break and hold above \(fallbackResistance.price) improves the bullish path.",
                    "Break below \(fallbackSupport.price) improves the bearish path."
                ]
            }
            return [
                ChartAnalysisPayload.TradeSetup(
                    horizon: defaultHorizon,
                    direction: fxBullWatchAllowed ? "Bullish" : (fxBearWatchAllowed ? "Bearish" : "Neutral"),
                    setup: fxSetupName,
                    trigger: fxTrigger,
                    entry: nil,
                    stop: nil,
                    targets: [],
                    rr: nil,
                    notes: [
                        "FX dedicated fallback: confirmation-first watch setup."
                    ],
                    rationale: fxRationale
                )
            ]
        }

        if picked.isEmpty,
           isAggressiveRisk,
           let fallbackSupport = localSupport ?? support,
           let fallbackResistance = localResistance ?? resistance {
            let horizon = allowShortTerm ? defaultHorizon : swingHorizon
            let atrValue = atr14 ?? (lastClose * 0.02)
            let wantsBull = dominantBias != "Bearish" || hasBullishReversalPressure || structureLayer.hasBullishSweep || structureLayer.hasBullishReclaim
            let wantsBear = dominantBias != "Bullish" || hasBearishReversalPressure || structureLayer.hasBearishSweep || structureLayer.hasBearishReclaim
            let minTargetPct = horizon.lowercased().contains("swing") || horizon.lowercased().contains("position") ? 0.0095 : 0.0038
            let minRewardMultiple = 1.25
            if wantsBull {
                let entry = fallbackSupport.value
                let stop = max(entry - max(atrValue * 1.35, lastClose * 0.012), lastClose * 0.000001)
                let riskDistance = max(entry - stop, lastClose * 0.000001)
                let minimumTarget = entry + max(riskDistance * minRewardMultiple, entry * minTargetPct)
                let target = max(fallbackResistance.value, minimumTarget)
                var setup = ChartAnalysisPayload.TradeSetup(
                    horizon: horizon,
                    direction: "Bullish",
                    setup: hasBullishReversalPressure ? "Speculative reversal long" : "Aggressive reclaim attempt",
                    trigger: "Conditional: \(fallbackSupport.price) holds, then reclaim/acceptance confirms upside",
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [fmt(target)],
                    rr: rr(entry: entry, stop: stop, target: target),
                    notes: baseNotes(horizon: horizon) + [
                        "High risk mode: conditional watch surfaced instead of hiding the opportunity.",
                        "Speculative setup — wait for trigger confirmation and size smaller."
                    ]
                )
                setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                return [setup]
            }
            if wantsBear {
                let entry = fallbackResistance.value
                let stop = entry + max(atrValue * 1.35, lastClose * 0.012)
                let riskDistance = max(stop - entry, lastClose * 0.000001)
                let minimumTarget = entry - max(riskDistance * minRewardMultiple, entry * minTargetPct)
                let target = min(fallbackSupport.value, minimumTarget)
                var setup = ChartAnalysisPayload.TradeSetup(
                    horizon: horizon,
                    direction: "Bearish",
                    setup: hasBearishReversalPressure ? "Speculative reversal short" : "Aggressive breakdown attempt",
                    trigger: "Conditional: \(fallbackResistance.price) rejects, then breakdown/acceptance confirms downside",
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [fmt(target)],
                    rr: rr(entry: entry, stop: stop, target: target),
                    notes: baseNotes(horizon: horizon) + [
                        "High risk mode: conditional watch surfaced instead of hiding the opportunity.",
                        "Speculative setup — wait for trigger confirmation and size smaller."
                    ]
                )
                setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                return [setup]
            }
        }

        func bestAvailableSetupFallback() -> [ChartAnalysisPayload.TradeSetup] {
            guard let fallbackSupport = localSupport ?? support,
                  let fallbackResistance = localResistance ?? resistance else {
                return []
            }

            let horizon = allowShortTerm ? defaultHorizon : swingHorizon
            let atrValue = atr14 ?? max(lastClose * 0.02, lastClose * 0.000001)
            let minRR: Double = {
                if isAggressiveRisk { return 0.95 }
                if isBalancedRisk { return 1.25 }
                return 1.55
            }()
            let buffer = max(atrValue * (isAggressiveRisk ? 0.75 : 0.95), lastClose * (isAggressiveRisk ? 0.006 : 0.009))

            func chooseTarget(entry: Double, stop: Double, bullish: Bool) -> Double? {
                let anchor = bullish ? max(entry, lastClose) : min(entry, lastClose)
                let candidates: [Double] = bullish
                    ? [
                        (localNextResistance ?? nextResistance)?.value,
                        actionableAbove.dropFirst().first?.value,
                        above.dropFirst().first?.value,
                        fallbackTargetAbove(from: anchor, multiplier: isAggressiveRisk ? 2.2 : 2.8),
                        fallbackTargetAbove(from: anchor, multiplier: isAggressiveRisk ? 3.6 : 4.4)
                    ].compactMap { $0 }
                    : [
                        (localNextSupport ?? nextSupport)?.value,
                        actionableBelow.dropLast().last?.value,
                        below.dropLast().last?.value,
                        fallbackTargetBelow(from: anchor, multiplier: isAggressiveRisk ? 2.2 : 2.8),
                        fallbackTargetBelow(from: anchor, multiplier: isAggressiveRisk ? 3.6 : 4.4)
                    ].compactMap { $0 }

                // The primary path rejects implausible payoffs via `meetsMinimumRR`.
                // This fallback bypassed that filter entirely and could print
                // 1:12 on a "watch" idea, which no one should size a trade on.
                let ceiling = maximumRRThreshold(forHorizon: horizon)
                return candidates.first { candidate in
                    guard bullish ? candidate > entry : candidate < entry else { return false }
                    let value = rrValue(entry: entry, stop: stop, target: candidate) ?? 0
                    return value >= minRR && value <= ceiling
                }
            }

            func makeSetup(bullish: Bool, setupName: String, trigger: String) -> ChartAnalysisPayload.TradeSetup? {
                let entry = bullish
                    ? (setupName.lowercased().contains("breakout") || setupName.lowercased().contains("reclaim") ? fallbackResistance.value : fallbackSupport.value)
                    : (setupName.lowercased().contains("breakdown") ? fallbackSupport.value : fallbackResistance.value)
                let stop = bullish
                    ? max(entry - buffer, lastClose * 0.000001)
                    : entry + buffer
                guard let target = chooseTarget(entry: entry, stop: stop, bullish: bullish) else { return nil }

                var setup = ChartAnalysisPayload.TradeSetup(
                    horizon: horizon,
                    direction: bullish ? "Bullish" : "Bearish",
                    setup: setupName,
                    trigger: trigger,
                    entry: fmt(entry),
                    stop: fmt(stop),
                    targets: [fmt(target)],
                    rr: rr(entry: entry, stop: stop, target: target),
                    notes: baseNotes(horizon: horizon) + [
                        "Best available setup: not a clean low-risk signal, but the clearest actionable path on this chart.",
                        "Conditional setup: wait for the trigger to confirm before acting."
                    ]
                )
                setup.rationale = buildRationale(direction: setup.direction, entry: entry, stop: stop, horizon: setup.horizon, setupType: setup.setup)
                return setup
            }

            let preferBull = dominantBias != "Bearish" || hasBullishReversalPressure || structureLayer.hasBullishSweep || structureLayer.hasBullishReclaim
            let preferBear = dominantBias != "Bullish" || hasBearishReversalPressure || structureLayer.hasBearishSweep || structureLayer.hasBearishReclaim
            let isRange = isRangeEnvironment || regimeLayer == .ranging
            let isCompression = regimeLayer == .compression || regimeLabel.lowercased().contains("compression")
            let isReversal = regimeLayer == .reversalEnvironment || hasBullishReversalPressure || hasBearishReversalPressure

            var candidates: [ChartAnalysisPayload.TradeSetup] = []
            if isRange {
                if preferBull, let setup = makeSetup(
                    bullish: true,
                    setupName: isAggressiveRisk ? "Speculative range rotation long" : "Range rotation watch",
                    trigger: "Acceptance above \(fallbackSupport.price)"
                ) { candidates.append(setup) }
                if preferBear, let setup = makeSetup(
                    bullish: false,
                    setupName: isAggressiveRisk ? "Speculative range rotation short" : "Range rotation watch",
                    trigger: "Acceptance below \(fallbackResistance.price)"
                ) { candidates.append(setup) }
            } else if isCompression {
                if preferBull, let setup = makeSetup(
                    bullish: true,
                    setupName: isAggressiveRisk ? "Breakout anticipation long" : "Conditional breakout watch",
                    trigger: "Acceptance above \(fallbackResistance.price)"
                ) { candidates.append(setup) }
                if preferBear, let setup = makeSetup(
                    bullish: false,
                    setupName: isAggressiveRisk ? "Breakdown anticipation short" : "Conditional breakdown watch",
                    trigger: "Acceptance below \(fallbackSupport.price)"
                ) { candidates.append(setup) }
            } else if isReversal {
                if preferBull, let setup = makeSetup(
                    bullish: true,
                    setupName: isAggressiveRisk ? "Speculative reversal long" : "Conditional reversal watch",
                    trigger: "Hold above \(fallbackSupport.price) plus reclaim confirms reversal attempt"
                ) { candidates.append(setup) }
                if preferBear, let setup = makeSetup(
                    bullish: false,
                    setupName: isAggressiveRisk ? "Speculative reversal short" : "Conditional reversal watch",
                    trigger: "Reject below \(fallbackResistance.price) plus breakdown confirms reversal attempt"
                ) { candidates.append(setup) }
            } else {
                if preferBull, let setup = makeSetup(
                    bullish: true,
                    setupName: isAggressiveRisk ? "Aggressive pullback long" : "Pullback continuation watch",
                    trigger: "Acceptance above \(fallbackSupport.price)"
                ) { candidates.append(setup) }
                if preferBear, let setup = makeSetup(
                    bullish: false,
                    setupName: isAggressiveRisk ? "Aggressive pullback short" : "Pullback rejection watch",
                    trigger: "Acceptance below \(fallbackResistance.price)"
                ) { candidates.append(setup) }
            }

            guard candidates.isEmpty == false else { return [] }

            // Balanced and conservative modes keep one candidate, and the bullish
            // one was always appended first, so whenever both sides qualified the
            // long won on source order alone. In a downtrend that handed the user
            // a counter-trend long, which measured flat to negative in replay.
            // Order by the side the market actually favours; when it favours
            // neither, order by payoff, which is direction-blind.
            func isBullishCandidate(_ setup: ChartAnalysisPayload.TradeSetup) -> Bool {
                setup.direction.lowercased().contains("bull")
            }
            func advertisedReward(_ setup: ChartAnalysisPayload.TradeSetup) -> Double {
                guard let text = setup.rr?.split(separator: ":").last else { return 0 }
                return Double(text.trimmingCharacters(in: .whitespaces)) ?? 0
            }
            switch dominantBias {
            case "Bullish":
                candidates = candidates.filter(isBullishCandidate)
                    + candidates.filter { isBullishCandidate($0) == false }
            case "Bearish":
                candidates = candidates.filter { isBullishCandidate($0) == false }
                    + candidates.filter(isBullishCandidate)
            default:
                candidates = candidates.enumerated()
                    .sorted { lhs, rhs in
                        let lhsReward = advertisedReward(lhs.element)
                        let rhsReward = advertisedReward(rhs.element)
                        if lhsReward != rhsReward { return lhsReward > rhsReward }
                        return lhs.offset < rhs.offset
                    }
                    .map(\.element)
            }

            return Array(candidates.prefix(isAggressiveRisk ? 2 : 1))
        }

        if picked.isEmpty {
            let bestAvailable = bestAvailableSetupFallback()
            if bestAvailable.isEmpty == false {
                return bestAvailable
            }
        }

        // When no directional setups survive filtering, return a neutral watch setup
        // so the UI doesn't show a blank setup section. Applies to all non-FX symbols,
        // and to FX only when the dedicated confirmation watch cannot be formed.
        if picked.isEmpty {
            return [
                ChartAnalysisPayload.TradeSetup(
                    horizon: allowShortTerm ? defaultHorizon : swingHorizon,
                    direction: "Neutral",
                    setup: "Watch setup",
                    trigger: "Wait for a cleaner directional break or a stronger pullback confirmation",
                    entry: nil,
                    stop: nil,
                    targets: [],
                    rr: nil,
                    notes: [
                        "Best available setup: no clean entry/stop/target passed the safety filters.",
                        "Use this as a watch state until price confirms a cleaner level break, pullback hold, or momentum shift."
                    ]
                )
            ]
        }

        // Enrich all picked setups with rationale explaining WHY each setup was chosen.
        let enriched = picked.map { setup -> ChartAnalysisPayload.TradeSetup in
            let profile = confluenceConflictProfile(setup)
            let entryValue = setup.entry.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
            let stopValue = setup.stop.flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? lastClose
            var enrichedSetup = setup
            if enrichedSetup.rationale.isEmpty {
                enrichedSetup.rationale = buildRationale(
                    direction: setup.direction,
                    entry: entryValue,
                    stop: stopValue,
                    horizon: setup.horizon,
                    setupType: setup.setup
                )
            }
            if profile.against > 0, enrichedSetup.notes.contains(where: { $0.lowercased().hasPrefix("confidence cap:") }) == false {
                let cap: Int = {
                    if isAggressiveRisk {
                        return profile.against >= 3 ? 70 : (profile.against == 2 ? 80 : 88)
                    }
                    if isBalancedRisk {
                        return profile.against >= 3 ? 55 : (profile.against == 2 ? 74 : 84)
                    }
                    return profile.against >= 3 ? 39 : (profile.against == 2 ? 60 : 75)
                }()
                enrichedSetup.notes.append("Confidence cap: \(cap)% due to \(profile.against) conflicting confluence signal\(profile.against == 1 ? "" : "s").")
            }
            if hasLateTrendExhaustionCluster(enrichedSetup) {
                let cap = isAggressiveRisk ? 80 : (isBalancedRisk ? 72 : 65)
                enrichedSetup.notes.append("Confidence cap: \(cap)% due to late-trend exhaustion near a key level.")
                enrichedSetup.notes.append("Extended continuation risk: RSI/Stoch are stretched and pullback risk is elevated.")
            }
            if hasChopContinuationCluster(enrichedSetup) {
                let cap = isAggressiveRisk ? 78 : (isBalancedRisk ? 70 : 60)
                enrichedSetup.notes.append("Confidence cap: \(cap)% due to range/compression chop with weak volume.")
                enrichedSetup.notes.append("No-edge warning: continuation needs a clean break and volume expansion.")
            }
            if profile.against >= 2, enrichedSetup.notes.contains(where: { $0.lowercased().hasPrefix("conviction:") || $0.lowercased().hasPrefix("confidence:") }) == false {
                enrichedSetup.notes.append("Conviction: Developing")
            }
            return enrichedSetup
        }

        return enriched
    }

    private static func ema(values: [Double], period: Int) -> [Double] {
        guard period > 1, values.count >= period else { return [] }
        let k = 2.0 / Double(period + 1)
        var result: [Double] = []
        result.reserveCapacity(values.count - period + 1)

        let start = values.prefix(period).reduce(0, +) / Double(period)
        var prev = start
        result.append(prev)

        for value in values.dropFirst(period) {
            prev = (value - prev) * k + prev
            result.append(prev)
        }
        return result
    }

    private static func rsi(closes: [Double], period: Int) -> [Double] {
        guard period > 1, closes.count >= period + 1 else { return [] }
        var gains: Double = 0
        var losses: Double = 0

        for i in 1...period {
            let delta = closes[i] - closes[i - 1]
            if delta >= 0 {
                gains += delta
            } else {
                losses += -delta
            }
        }

        var avgGain = gains / Double(period)
        var avgLoss = losses / Double(period)

        func rsiValue(avgGain: Double, avgLoss: Double) -> Double {
            if avgLoss == 0 {
                // No losses *and* no gains means the market has not moved: that is
                // neutral, not maximum overbought. Stablecoin pairs, halted tickers
                // and illiquid alts really do print runs of identical closes, and
                // those were reading as RSI 100 "overbought".
                return avgGain == 0 ? 50 : 100
            }
            let rs = avgGain / avgLoss
            return 100 - (100 / (1 + rs))
        }

        var result: [Double] = []
        result.reserveCapacity(closes.count - period)
        result.append(rsiValue(avgGain: avgGain, avgLoss: avgLoss))

        if closes.count <= period + 1 { return result }

        for i in (period + 1)..<closes.count {
            let delta = closes[i] - closes[i - 1]
            let gain = max(delta, 0)
            let loss = max(-delta, 0)
            avgGain = (avgGain * Double(period - 1) + gain) / Double(period)
            avgLoss = (avgLoss * Double(period - 1) + loss) / Double(period)
            result.append(rsiValue(avgGain: avgGain, avgLoss: avgLoss))
        }

        return result
    }

    private static func atr(candles: [Candle], period: Int) -> [Double] {
        guard period > 1, candles.count >= period + 1 else { return [] }

        var trueRanges: [Double] = []
        trueRanges.reserveCapacity(candles.count - 1)

        for i in 1..<candles.count {
            let high = candles[i].high
            let low = candles[i].low
            let prevClose = candles[i - 1].close
            let tr = max(high - low, abs(high - prevClose), abs(low - prevClose))
            trueRanges.append(tr)
        }

        guard trueRanges.count >= period else { return [] }

        var result: [Double] = []
        result.reserveCapacity(trueRanges.count - period + 1)
        var prevAtr = trueRanges.prefix(period).reduce(0, +) / Double(period)
        result.append(prevAtr)

        if trueRanges.count == period { return result }

        for tr in trueRanges.dropFirst(period) {
            prevAtr = (prevAtr * Double(period - 1) + tr) / Double(period)
            result.append(prevAtr)
        }
        return result
    }

    private static func macd(closes: [Double]) -> (macd: [Double], signal: [Double], histogram: [Double]) {
        guard closes.count >= 35 else { return ([], [], []) }
        let ema12 = ema(values: closes, period: 12)
        let ema26 = ema(values: closes, period: 26)
        guard !ema12.isEmpty, !ema26.isEmpty else { return ([], [], []) }

        let count = min(ema12.count, ema26.count)
        guard count > 0 else { return ([], [], []) }

        let tail12 = Array(ema12.suffix(count))
        let tail26 = Array(ema26.suffix(count))
        let macdLine = zip(tail12, tail26).map { $0 - $1 }
        let signalLine = ema(values: macdLine, period: 9)
        if signalLine.isEmpty { return (macdLine, [], []) }

        let histCount = min(macdLine.count, signalLine.count)
        let macdTail = Array(macdLine.suffix(histCount))
        let signalTail = Array(signalLine.suffix(histCount))
        let histogram = zip(macdTail, signalTail).map { $0 - $1 }
        return (macdTail, signalTail, histogram)
    }

    private struct BollingerPack: Hashable, Sendable {
        let middle: Double?
        let upper: Double?
        let lower: Double?
        let widthPct: Double?
    }

    private static func bollingerBands(closes: [Double], period: Int, stdevMultiplier: Double) -> BollingerPack {
        guard period > 1, closes.count >= period else {
            return BollingerPack(middle: nil, upper: nil, lower: nil, widthPct: nil)
        }

        let window = closes.suffix(period)
        let mean = window.reduce(0, +) / Double(period)
        guard mean.isFinite, mean != 0 else {
            return BollingerPack(middle: nil, upper: nil, lower: nil, widthPct: nil)
        }

        let variance = window.reduce(0) { partial, value in
            let diff = value - mean
            return partial + diff * diff
        } / Double(period)
        let stdev = sqrt(max(0, variance))

        let upper = mean + stdevMultiplier * stdev
        let lower = mean - stdevMultiplier * stdev
        let widthPct = (upper - lower) / abs(mean) * 100.0
        return BollingerPack(middle: mean, upper: upper, lower: lower, widthPct: widthPct)
    }

    private struct StochasticPack: Hashable, Sendable {
        let k: Double?
        let d: Double?
    }

    private static func stochasticOscillator(candles: [Candle], period: Int, smoothing: Int) -> StochasticPack {
        guard period > 1, smoothing > 0, candles.count >= period else {
            return StochasticPack(k: nil, d: nil)
        }

        let lastIndex = candles.count - 1
        var kValues: [Double] = []
        kValues.reserveCapacity(smoothing)

        for offset in 0..<smoothing {
            let index = lastIndex - offset
            let start = index - (period - 1)
            if start < 0 { break }
            let window = candles[start...index]
            guard let high = window.map(\.high).max(), let low = window.map(\.low).min() else { continue }
            // With no range there is no position inside it: that is the middle of
            // the band, not the bottom. Dividing by an epsilon printed %K = 0,
            // i.e. "maximally oversold", for a market that had not moved at all.
            let range = high - low
            let k = range > 0 ? (candles[index].close - low) / range * 100.0 : 50.0
            kValues.append(k)
        }

        let k = kValues.first
        let d = kValues.isEmpty ? nil : (kValues.reduce(0, +) / Double(kValues.count))
        return StochasticPack(k: k, d: d)
    }

    private struct ADXPack: Hashable, Sendable {
        let adx: Double?
        let plusDI: Double?
        let minusDI: Double?
    }

    private static func adx(candles: [Candle], period: Int) -> ADXPack {
        guard period > 1, candles.count >= (period * 2 + 1) else {
            return ADXPack(adx: nil, plusDI: nil, minusDI: nil)
        }

        var trs: [Double] = []
        var plusDM: [Double] = []
        var minusDM: [Double] = []
        trs.reserveCapacity(candles.count - 1)
        plusDM.reserveCapacity(candles.count - 1)
        minusDM.reserveCapacity(candles.count - 1)

        for i in 1..<candles.count {
            let high = candles[i].high
            let low = candles[i].low
            let prevHigh = candles[i - 1].high
            let prevLow = candles[i - 1].low
            let prevClose = candles[i - 1].close

            let upMove = high - prevHigh
            let downMove = prevLow - low
            let pdm = (upMove > downMove && upMove > 0) ? upMove : 0
            let mdm = (downMove > upMove && downMove > 0) ? downMove : 0

            let tr = max(high - low, abs(high - prevClose), abs(low - prevClose))
            trs.append(tr)
            plusDM.append(pdm)
            minusDM.append(mdm)
        }

        func di(dm: Double, tr: Double) -> Double {
            guard tr > 0 else { return 0 }
            return (dm / tr) * 100.0
        }

        var trSmooth = trs.prefix(period).reduce(0, +)
        var plusSmooth = plusDM.prefix(period).reduce(0, +)
        var minusSmooth = minusDM.prefix(period).reduce(0, +)

        var plusDI = di(dm: plusSmooth, tr: trSmooth)
        var minusDI = di(dm: minusSmooth, tr: trSmooth)

        func dx(plus: Double, minus: Double) -> Double {
            let denom = plus + minus
            guard denom > 0 else { return 0 }
            return abs(plus - minus) / denom * 100.0
        }

        var dxValues: [Double] = []
        dxValues.reserveCapacity(trs.count)
        dxValues.append(dx(plus: plusDI, minus: minusDI))

        if trs.count > period {
            for i in period..<trs.count {
                trSmooth = trSmooth - (trSmooth / Double(period)) + trs[i]
                plusSmooth = plusSmooth - (plusSmooth / Double(period)) + plusDM[i]
                minusSmooth = minusSmooth - (minusSmooth / Double(period)) + minusDM[i]

                plusDI = di(dm: plusSmooth, tr: trSmooth)
                minusDI = di(dm: minusSmooth, tr: trSmooth)
                dxValues.append(dx(plus: plusDI, minus: minusDI))
            }
        }

        guard dxValues.count >= period else {
            return ADXPack(adx: nil, plusDI: plusDI, minusDI: minusDI)
        }

        var adx = dxValues.prefix(period).reduce(0, +) / Double(period)
        if dxValues.count > period {
            for value in dxValues.dropFirst(period) {
                adx = (adx * Double(period - 1) + value) / Double(period)
            }
        }

        return ADXPack(adx: adx, plusDI: plusDI, minusDI: minusDI)
    }

    private struct OBVPack: Hashable, Sendable {
        let obv: Double?
        let delta: Double?
    }

    private struct VolatilityRegime: Hashable, Sendable {
        let label: String
        let percentile: Int?
    }

    private static func atrPctSeries(candles: [Candle], period: Int) -> [Double] {
        guard let atrSeries = atr(candles: candles, period: period) as [Double]?, !atrSeries.isEmpty else { return [] }
        // ATR returns one value per candle after warmup; align to close tail.
        let closes = candles.map(\.close)
        let count = min(atrSeries.count, closes.count)
        let atrTail = Array(atrSeries.suffix(count))
        let closeTail = Array(closes.suffix(count))
        return zip(atrTail, closeTail).compactMap { atrValue, close in
            guard close > 0 else { return nil }
            return atrValue / close * 100.0
        }
    }

    private static func volatilityRegimeLabel(currentATRpct: Double?, history: [Double]) -> VolatilityRegime? {
        guard let current = currentATRpct, current.isFinite, current > 0, history.count >= 40 else { return nil }
        let sorted = history.filter { $0.isFinite && $0 > 0 }.sorted()
        guard sorted.count >= 2 else { return nil }

        let rank = sorted.reduce(0) { partial, value in
            partial + (value <= current ? 1 : 0)
        }
        let percentile = Int((Double(rank) / Double(Swift.max(sorted.count, 1)) * 100.0).rounded())

        let label: String
        if percentile >= 80 { label = "High" }
        else if percentile <= 30 { label = "Low" }
        else { label = "Normal" }
        return VolatilityRegime(label: label, percentile: percentile)
    }

    private static func roc(values: [Double], period: Int) -> [Double] {
        guard period > 1, values.count > period else { return [] }
        var result: [Double] = []
        result.reserveCapacity(values.count - period)
        for i in period..<values.count {
            let prev = values[i - period]
            if prev == 0 { continue }
            result.append((values[i] - prev) / prev * 100.0)
        }
        return result
    }

    private enum SwingPointKind: Hashable, Sendable { case high, low }

    private struct SwingPoint: Hashable, Sendable {
        let index: Int
        let kind: SwingPointKind
        let price: Double
    }

    private static func swingPoints(candles: [Candle], timeframeKind: TimeframeKind) -> [SwingPoint] {
        let radius: Int = {
            switch timeframeKind {
            case .intraday: return 2
            case .daily: return 3
            case .weekly, .monthly: return 4
            }
        }()
        guard candles.count > radius * 2 + 10 else { return [] }

        var points: [SwingPoint] = []
        points.reserveCapacity(24)
        for i in radius..<(candles.count - radius) {
            let high = candles[i].high
            let low = candles[i].low
            var isHigh = true
            var isLow = true
            for j in (i - radius)...(i + radius) where j != i {
                if candles[j].high > high { isHigh = false }
                if candles[j].low < low { isLow = false }
                if !isHigh && !isLow { break }
            }
            if isHigh { points.append(SwingPoint(index: i, kind: .high, price: high)) }
            if isLow { points.append(SwingPoint(index: i, kind: .low, price: low)) }
        }

        // Keep the most recent swings.
        return Array(points.suffix(24))
    }

    private static func marketStructureLayer(
        candles: [Candle],
        swingPoints: [SwingPoint],
        levels: [ChartAnalysisPayload.KeyLevel],
        atr14: Double?,
        timeframeKind: TimeframeKind
    ) -> MarketStructureLayer {
        guard candles.count >= 12, let last = candles.last else { return .empty }

        let swingHighs = swingPoints.filter { $0.kind == .high }
        let swingLows = swingPoints.filter { $0.kind == .low }
        let recentHighs = Array(swingHighs.suffix(3))
        let recentLows = Array(swingLows.suffix(3))
        let lastClose = last.close
        let atr = atr14 ?? max(lastClose * 0.006, 0.0000001)
        let tolerance = max(atr * 0.12, lastClose * 0.0004)

        let hh = recentHighs.count >= 2 && recentHighs.last!.price > recentHighs[recentHighs.count - 2].price + tolerance
        let lh = recentHighs.count >= 2 && recentHighs.last!.price < recentHighs[recentHighs.count - 2].price - tolerance
        let hl = recentLows.count >= 2 && recentLows.last!.price > recentLows[recentLows.count - 2].price + tolerance
        let ll = recentLows.count >= 2 && recentLows.last!.price < recentLows[recentLows.count - 2].price - tolerance

        let swingLabel: String = {
            switch (hh, hl, lh, ll) {
            case (true, true, _, _): return "Structure layer: HH/HL"
            case (_, _, true, true): return "Structure layer: LH/LL"
            case (true, _, _, true): return "Structure layer: expansion / transition"
            case (_, true, true, _): return "Structure layer: compression / triangle"
            default: return "Structure layer: mixed swings"
            }
        }()

        let previousSwingHigh = swingHighs.last(where: { $0.index < candles.count - 1 })
        let previousSwingLow = swingLows.last(where: { $0.index < candles.count - 1 })
        let bullishBOS = previousSwingHigh.map { lastClose > $0.price + tolerance } ?? false
        let bearishBOS = previousSwingLow.map { lastClose < $0.price - tolerance } ?? false
        let priorBearishStructure = lh || ll
        let priorBullishStructure = hh || hl
        let bullishCHoCH = bullishBOS && priorBearishStructure
        let bearishCHoCH = bearishBOS && priorBullishStructure

        let bearishSweep = previousSwingHigh.map { last.high > $0.price + tolerance && last.close < $0.price } ?? false
        let bullishSweep = previousSwingLow.map { last.low < $0.price - tolerance && last.close > $0.price } ?? false
        let failedBreakout = bearishSweep
        let failedBreakdown = bullishSweep

        let previousClose = candles.dropLast().last?.close
        let numericLevels = levels.compactMap { level -> (value: Double, kind: String, price: String)? in
            guard let value = Double(level.price), value.isFinite, value > 0 else { return nil }
            return (value, level.kind.lowercased(), level.price)
        }
        let supportLevels = numericLevels.filter { $0.kind.contains("support") }.sorted { $0.value < $1.value }
        let resistanceLevels = numericLevels.filter { $0.kind.contains("resistance") }.sorted { $0.value < $1.value }

        let nearestSupport = supportLevels.min { abs($0.value - lastClose) < abs($1.value - lastClose) }
        let nearestResistance = resistanceLevels.min { abs($0.value - lastClose) < abs($1.value - lastClose) }

        let bullishReclaim = nearestSupport.map { level in
            guard let previousClose else { return false }
            return previousClose < level.value - tolerance && lastClose > level.value + tolerance
        } ?? false
        let bearishReclaim = nearestResistance.map { level in
            guard let previousClose else { return false }
            return previousClose > level.value + tolerance && lastClose < level.value - tolerance
        } ?? false

        let bullishReaction = nearestSupport.map { level in
            last.low <= level.value + tolerance && lastClose > level.value + tolerance
        } ?? false
        let bearishReaction = nearestResistance.map { level in
            last.high >= level.value - tolerance && lastClose < level.value - tolerance
        } ?? false

        var events: [String] = []
        events.append(swingLabel)
        if bullishBOS { events.append("BOS bullish above \(previousSwingHigh.map { formatCompact($0.price) } ?? "swing high")") }
        if bearishBOS { events.append("BOS bearish below \(previousSwingLow.map { formatCompact($0.price) } ?? "swing low")") }
        if bullishCHoCH { events.append("CHoCH bullish") }
        if bearishCHoCH { events.append("CHoCH bearish") }
        if bullishSweep { events.append("Liquidity sweep: sell-side sweep") }
        if bearishSweep { events.append("Liquidity sweep: buy-side sweep") }
        if failedBreakdown { events.append("Failed breakdown") }
        if failedBreakout { events.append("Failed breakout") }
        if bullishReclaim { events.append("Reclaim above support \(nearestSupport?.price ?? "")") }
        if bearishReclaim { events.append("Reclaim below resistance \(nearestResistance?.price ?? "")") }
        if bullishReaction { events.append("Key level reaction: support held \(nearestSupport?.price ?? "")") }
        if bearishReaction { events.append("Key level reaction: resistance rejected \(nearestResistance?.price ?? "")") }

        let bias: StructureBias = {
            var bull = 0
            var bear = 0
            if hh { bull += 1 }
            if hl { bull += 1 }
            if lh { bear += 1 }
            if ll { bear += 1 }
            if bullishBOS { bull += 2 }
            if bearishBOS { bear += 2 }
            if bullishCHoCH || bullishSweep || bullishReclaim || bullishReaction { bull += 2 }
            if bearishCHoCH || bearishSweep || bearishReclaim || bearishReaction { bear += 2 }
            if bull >= bear + 2 { return .bullish }
            if bear >= bull + 2 { return .bearish }
            return .mixed
        }()

        let isRangeLike = {
            if bullishBOS || bearishBOS || bullishCHoCH || bearishCHoCH { return false }
            if case .intraday = timeframeKind {
                return (hh && ll) || (hl && lh) || (!hh && !hl && !lh && !ll)
            }
            return (hh && ll) || (hl && lh)
        }()

        var confluenceItems: [String] = []
        confluenceItems.append(contentsOf: events.prefix(8))
        if bias != .mixed {
            confluenceItems.append("Structure bias: \(bias.rawValue)")
        }

        var riskNotes: [String] = []
        if bullishSweep || bearishSweep {
            riskNotes.append("Liquidity sweep detected: wait for acceptance; trap risk is elevated until the reclaim holds.")
        }
        if failedBreakout || failedBreakdown {
            riskNotes.append("Failed break detected: continuation setups need confirmation; failed moves often rotate back through the range.")
        }
        if isRangeLike {
            riskNotes.append("Structure layer is range-like: prefer confirmed rotations/reclaims over blind continuation.")
        }

        return MarketStructureLayer(
            swingLabel: swingLabel,
            bias: bias,
            events: events,
            confluenceItems: confluenceItems,
            riskNotes: riskNotes,
            hasBullishBOS: bullishBOS,
            hasBearishBOS: bearishBOS,
            hasBullishCHoCH: bullishCHoCH,
            hasBearishCHoCH: bearishCHoCH,
            hasBullishSweep: bullishSweep,
            hasBearishSweep: bearishSweep,
            hasBullishReclaim: bullishReclaim,
            hasBearishReclaim: bearishReclaim,
            hasBullishReaction: bullishReaction,
            hasBearishReaction: bearishReaction,
            isRangeLike: isRangeLike
        )
    }

    private static func applyMarketStructureLayer(
        setups: [ChartAnalysisPayload.TradeSetup],
        structureLayer: MarketStructureLayer,
        regimeLabel: String,
        structure: String
    ) -> [ChartAnalysisPayload.TradeSetup] {
        guard setups.isEmpty == false else { return setups }
        let trendText = "\(regimeLabel) \(structure)".lowercased()
        let isTrendingContext = trendText.contains("bullish trend")
            || trendText.contains("bearish trend")
            || trendText.contains("higher highs")
            || trendText.contains("lower highs")

        return setups.compactMap { setup in
            let directionText = setup.direction.lowercased()
            let text = "\(setup.setup) \(setup.trigger)".lowercased()
            let isBullish = directionText.contains("bull")
            let isBearish = directionText.contains("bear")
            let isRangeRotation = text.contains("range rotation")
            let isMeanReversionFade = isRangeRotation
                || text.contains("resistance fade")
                || text.contains("support bounce")
            let isWatch = text.contains("watch") || text.contains("reclaim") || text.contains("breakdown")
            let bullishStructureSupport = structureLayer.bias == .bullish
                || structureLayer.hasBullishBOS
                || structureLayer.hasBullishCHoCH
                || structureLayer.hasBullishSweep
                || structureLayer.hasBullishReclaim
                || structureLayer.hasBullishReaction
            let bearishStructureSupport = structureLayer.bias == .bearish
                || structureLayer.hasBearishBOS
                || structureLayer.hasBearishCHoCH
                || structureLayer.hasBearishSweep
                || structureLayer.hasBearishReclaim
                || structureLayer.hasBearishReaction

            if isMeanReversionFade, isTrendingContext, structureLayer.isRangeLike == false {
                return nil
            }

            var updated = setup
            // The first event is the swing label, which already says "Structure
            // layer:". Prefixing again printed it twice.
            let eventLine = structureLayer.events.prefix(5).joined(separator: " • ")
            if updated.rationale.contains(eventLine) == false {
                updated.rationale.append(eventLine)
            }

            if isBullish && !bullishStructureSupport && structureLayer.bias == .bearish {
                let note = isWatch
                    ? "Structure conflict: bearish structure; bullish idea stays conditional. Confidence cap: 60 until BOS/CHoCH or reclaim confirms."
                    : "Structure conflict: bearish structure against this long. Confidence cap: 60."
                if updated.notes.contains(note) == false { updated.notes.append(note) }
            } else if isBearish && !bearishStructureSupport && structureLayer.bias == .bullish {
                let note = isWatch
                    ? "Structure conflict: bullish structure; bearish idea stays conditional. Confidence cap: 60 until BOS/CHoCH or breakdown confirms."
                    : "Structure conflict: bullish structure against this short. Confidence cap: 60."
                if updated.notes.contains(note) == false { updated.notes.append(note) }
            } else if structureLayer.isRangeLike && !isRangeRotation && text.contains("continuation") && !isWatch {
                let note = "Structure layer is range-like; continuation requires acceptance. Confidence cap: 75."
                if updated.notes.contains(note) == false { updated.notes.append(note) }
            }

            if (structureLayer.hasBullishSweep && isBullish) || (structureLayer.hasBearishSweep && isBearish) {
                let note = "Liquidity sweep supports this direction only after acceptance; trap risk remains elevated."
                if updated.notes.contains(note) == false { updated.notes.append(note) }
            }
            return updated
        }
    }

    private struct AVWAPPack: Hashable, Sendable {
        let vwap: Double?
        let upper1: Double?
        let lower1: Double?
        let anchorLabel: String
    }

    private static func anchoredVWAPPack(
        candles: [Candle],
        volumes: [Double],
        currentPrice: Double,
        regimeLabel: String,
        structure: String,
        swingPoints: [SwingPoint]
    ) -> AVWAPPack? {
        guard candles.count >= 50, volumes.count == candles.count else { return nil }
        let lowerRegime = regimeLabel.lowercased()
        let lowerStructure = structure.lowercased()
        let preferHigh = lowerRegime.contains("bear") || lowerStructure.contains("lower highs")

        let candidate = swingPoints.reversed().first(where: { preferHigh ? ($0.kind == .high) : ($0.kind == .low) })
        let anchorIndex = candidate?.index ?? max(0, candles.count - 60)

        let slice = anchorIndex..<candles.count
        var sumPV: Double = 0
        var sumV: Double = 0
        for i in slice {
            let c = candles[i]
            let typical = (c.high + c.low + c.close) / 3.0
            let v = max(0.0, volumes[i])
            let weight = v > 0 ? v : 1.0
            sumPV += typical * weight
            sumV += weight
        }
        guard sumV > 0 else { return nil }
        let vwap = sumPV / sumV

        let closes = candles[slice].map(\.close)
        let diffs = closes.map { $0 - vwap }
        let variance = diffs.reduce(0) { $0 + $1 * $1 } / Double(max(diffs.count, 1))
        let stdev = sqrt(max(variance, 0))
        let upper1 = vwap + stdev
        let lower1 = max(0.0000001, vwap - stdev)

        let anchorPrice = candidate?.price ?? currentPrice
        let label = (preferHigh ? "anchor: swing high" : "anchor: swing low") + " @ " + formatCompact(anchorPrice)
        return AVWAPPack(vwap: vwap, upper1: upper1, lower1: lower1, anchorLabel: label)
    }

    private struct RegressionChannelPack: Hashable, Sendable {
        let mid: Double
        let upper: Double
        let lower: Double
        let positionLabel: String
        let slopePctPerBar: Double?
    }

    private static func regressionChannelPack(closes: [Double], currentPrice: Double, timeframeKind: TimeframeKind) -> RegressionChannelPack? {
        let lookback: Int = {
            switch timeframeKind {
            case .intraday: return 160
            case .daily: return 220
            case .weekly: return 180
            case .monthly: return 160
            }
        }()
        let recent = Array(closes.suffix(min(lookback, closes.count))).filter { $0.isFinite && $0 > 0 }
        guard recent.count >= 80 else { return nil }

        let y = recent.map { log($0) }
        guard let (a, b) = linearRegression(values: y) else { return nil }

        let n = y.count
        let lastX = Double(n - 1)
        let midLog = a + b * lastX
        let residuals = y.enumerated().map { idx, value in
            let x = Double(idx)
            return value - (a + b * x)
        }
        let meanResidual = residuals.reduce(0, +) / Double(residuals.count)
        let variance = residuals.reduce(0) { partial, value in
            let diff = value - meanResidual
            return partial + diff * diff
        } / Double(residuals.count)
        let stdev = sqrt(max(variance, 0))

        let k: Double = 1.6
        let upper = exp(midLog + k * stdev)
        let lower = exp(midLog - k * stdev)
        let mid = exp(midLog)

        let positionLabel: String
        if currentPrice >= upper { positionLabel = "Above regression upper channel" }
        else if currentPrice <= lower { positionLabel = "Below regression lower channel" }
        else if currentPrice >= mid { positionLabel = "Above regression midline" }
        else { positionLabel = "Below regression midline" }

        let slopePctPerBar = (exp(b) - 1.0) * 100.0
        return RegressionChannelPack(mid: mid, upper: upper, lower: lower, positionLabel: positionLabel, slopePctPerBar: slopePctPerBar)
    }

    private static func divergenceSignals(candles: [Candle], rsiSeries: [Double], swingPoints: [SwingPoint]) -> [String] {
        guard candles.count >= 80, rsiSeries.count >= 20 else { return [] }
        let lastIndex = candles.count - 1

        let lows = swingPoints.filter { $0.kind == .low }.suffix(6).map { $0 }
        let highs = swingPoints.filter { $0.kind == .high }.suffix(6).map { $0 }

        func rsiAt(_ candleIndex: Int) -> Double? {
            // RSI series is shorter; align to candle index by taking the tail mapping.
            let offset = candles.count - rsiSeries.count
            let idx = candleIndex - offset
            guard idx >= 0, idx < rsiSeries.count else { return nil }
            return rsiSeries[idx]
        }

        var signals: [String] = []

        if lows.count >= 2,
           let a = lows.dropLast().last,
           let b = lows.last,
           a.index < lastIndex, b.index < lastIndex,
           let rsiA = rsiAt(a.index),
           let rsiB = rsiAt(b.index) {
            if b.price < a.price && rsiB > rsiA + 2.5 {
                signals.append("Bullish RSI divergence")
            }
        }

        if highs.count >= 2,
           let a = highs.dropLast().last,
           let b = highs.last,
           a.index < lastIndex, b.index < lastIndex,
           let rsiA = rsiAt(a.index),
           let rsiB = rsiAt(b.index) {
            if b.price > a.price && rsiB < rsiA - 2.5 {
                signals.append("Bearish RSI divergence")
            }
        }

        return signals
    }

    private static func linearRegression(values: [Double]) -> (a: Double, b: Double)? {
        let n = values.count
        guard n >= 2 else { return nil }

        let xMean = Double(n - 1) / 2.0
        let yMean = values.reduce(0, +) / Double(n)

        var num: Double = 0
        var den: Double = 0
        for (i, y) in values.enumerated() {
            let x = Double(i)
            num += (x - xMean) * (y - yMean)
            den += (x - xMean) * (x - xMean)
        }
        guard den != 0 else { return nil }
        let b = num / den
        let a = yMean - b * xMean
        return (a, b)
    }

    private static func obv(candles: [Candle], lookback: Int) -> OBVPack {
        guard candles.count >= 2 else {
            return OBVPack(obv: nil, delta: nil)
        }

        var series: [Double] = []
        series.reserveCapacity(candles.count)
        var value: Double = 0
        series.append(value)

        for i in 1..<candles.count {
            let prevClose = candles[i - 1].close
            let close = candles[i].close
            if close > prevClose { value += candles[i].volume }
            else if close < prevClose { value -= candles[i].volume }
            series.append(value)
        }

        let last = series.last
        let index = max(0, series.count - 1 - max(0, lookback))
        let delta = (last ?? 0) - series[index]
        return OBVPack(obv: last, delta: delta)
    }

    private static func deriveSupportResistance(
        highs: [Double],
        lows: [Double],
        currentPrice: Double,
        timeframeKind: TimeframeKind
    ) -> [ChartAnalysisPayload.KeyLevel] {
        let swingRadius: Int = {
            switch timeframeKind {
            case .intraday: return 2
            case .daily: return 3
            case .weekly, .monthly: return 4
            }
        }()
        guard highs.count == lows.count, highs.count > swingRadius * 2 else { return [] }

        var swingHighs: [Double] = []
        var swingLows: [Double] = []

        for i in swingRadius..<(highs.count - swingRadius) {
            let high = highs[i]
            let low = lows[i]

            var isHigh = true
            var isLow = true
            for j in (i - swingRadius)...(i + swingRadius) where j != i {
                if highs[j] > high { isHigh = false }
                if lows[j] < low { isLow = false }
                if !isHigh && !isLow { break }
            }

            if isHigh { swingHighs.append(high) }
            if isLow { swingLows.append(low) }
        }

        let recentCount: Int = {
            switch timeframeKind {
            case .intraday: return 30
            case .daily: return 50
            case .weekly: return 80
            case .monthly: return 100
            }
        }()
        let recentHighs = Array(swingHighs.suffix(recentCount))
        let recentLows = Array(swingLows.suffix(recentCount))

        let clusteredHighs = clusterLevels(recentHighs, tolerancePct: 0.006, rounding: roundingStep(for: currentPrice))
        let clusteredLows = clusterLevels(recentLows, tolerancePct: 0.006, rounding: roundingStep(for: currentPrice))

        var levels: [ChartAnalysisPayload.KeyLevel] = []
        levels.reserveCapacity(clusteredHighs.count + clusteredLows.count)

        for price in clusteredLows {
            let kind: String
            let note: String
            if price <= currentPrice {
                kind = "support"
                note = "swing low cluster"
            } else {
                kind = "resistance"
                note = "prior swing low (overhead)"
            }
            levels.append(ChartAnalysisPayload.KeyLevel(
                price: formatPrice(price),
                kind: kind,
                note: note
            ))
        }
        for price in clusteredHighs {
            let kind: String
            let note: String
            if price >= currentPrice {
                kind = "resistance"
                note = "swing high cluster"
            } else {
                kind = "support"
                note = "prior swing high (below)"
            }
            levels.append(ChartAnalysisPayload.KeyLevel(
                price: formatPrice(price),
                kind: kind,
                note: note
            ))
        }

        let sorted = levels
            .compactMap { level -> (value: Double, level: ChartAnalysisPayload.KeyLevel)? in
                guard let v = Double(level.price) else { return nil }
                return (v, level)
            }
            .sorted { $0.value < $1.value }
            .map(\.level)

        return compactLevelSet(Array(sorted.suffix(12)), currentPrice: currentPrice, maxCount: 10)
    }

    private static func deriveMicroLevels(
        candles: [Candle],
        currentPrice: Double,
        timeframeKind: TimeframeKind
    ) -> [ChartAnalysisPayload.KeyLevel] {
        guard candles.count >= 20 else { return [] }

        let lookback: Int = {
            switch timeframeKind {
            case .intraday: return 40
            case .daily: return 30
            case .weekly: return 24
            case .monthly: return 18
            }
        }()

        let recent = candles.suffix(min(lookback, candles.count))
        let rounding = roundingStep(for: currentPrice)

        let recentHigh = recent.map(\.high).max()
        let recentLow = recent.map(\.low).min()

        var levels: [ChartAnalysisPayload.KeyLevel] = []
        levels.reserveCapacity(6)

        if let recentLow {
            let price = roundToStep(recentLow, step: rounding)
            if price > 0 {
                let isSupport = price <= currentPrice
                levels.append(ChartAnalysisPayload.KeyLevel(
                    price: formatPrice(price),
                    kind: isSupport ? "support" : "resistance",
                    note: isSupport ? "recent \(recent.count)-bar low" : "recent \(recent.count)-bar low (overhead)"
                ))
            }
        }

        if let recentHigh {
            let price = roundToStep(recentHigh, step: rounding)
            if price > 0 {
                let isResistance = price >= currentPrice
                levels.append(ChartAnalysisPayload.KeyLevel(
                    price: formatPrice(price),
                    kind: isResistance ? "resistance" : "support",
                    note: isResistance ? "recent \(recent.count)-bar high" : "recent \(recent.count)-bar high (below)"
                ))
            }
        }

        // Add close/open based levels. These often matter on scanned chart screenshots because
        // users visually anchor to bodies, not only wicks.
        let recentCandles = Array(recent)
        let bodyLevels = recentCandles.suffix(min(18, recentCandles.count)).flatMap { candle in
            [candle.open, candle.close]
        }
        let clusteredBodies = clusterLevels(bodyLevels, tolerancePct: 0.0035, rounding: rounding)
            .filter { price in
                guard currentPrice > 0 else { return false }
                return abs(price - currentPrice) / currentPrice <= 0.055
            }
        for price in clusteredBodies.prefix(4) where price > 0 {
            levels.append(ChartAnalysisPayload.KeyLevel(
                price: formatPrice(price),
                kind: price <= currentPrice ? "support" : "resistance",
                note: "recent body cluster"
            ))
        }

        return compactLevelSet(levels, currentPrice: currentPrice, maxCount: 8)
    }

    private static func pivotLevels(candles: [Candle], currentPrice: Double) -> [ChartAnalysisPayload.KeyLevel] {
        guard candles.count >= 3 else { return [] }
        let rounding = roundingStep(for: currentPrice)

        // Use the last completed candle as the pivot basis.
        let prev = candles[candles.count - 2]
        let high = prev.high
        let low = prev.low
        let close = prev.close
        guard high.isFinite, low.isFinite, close.isFinite, high > low, low > 0 else { return [] }

        let p = (high + low + close) / 3.0
        let r1 = 2.0 * p - low
        let s1 = 2.0 * p - high
        let r2 = p + (high - low)
        let s2 = p - (high - low)

        let raw: [(name: String, value: Double)] = [
            ("Pivot", p),
            ("Pivot R1", r1),
            ("Pivot S1", s1),
            ("Pivot R2", r2),
            ("Pivot S2", s2)
        ]

        var levels: [ChartAnalysisPayload.KeyLevel] = []
        levels.reserveCapacity(raw.count)
        for item in raw {
            let price = roundToStep(item.value, step: rounding)
            guard price.isFinite, price > 0 else { continue }
            let kind = (price <= currentPrice) ? "support" : "resistance"
            levels.append(ChartAnalysisPayload.KeyLevel(
                price: formatPrice(price),
                kind: kind,
                note: item.name
            ))
        }
        return levels
    }

    /// Level rounding, roughly four significant digits at any price.
    ///
    /// The ladder used to stop at 0.0001, which meant every level on a sub-cent
    /// instrument rounded to zero and was then dropped as non-positive. Result:
    /// PEPEUSDT and anything priced like it produced no key levels at all, and
    /// therefore no setups, on every timeframe and in every market shape. The
    /// tail below continues the same proportion instead of bottoming out.
    private static func roundingStep(for price: Double) -> Double {
        let p = abs(price)
        if p >= 50000 { return 100 }
        if p >= 10000 { return 50 }
        if p >= 1000 { return 10 }
        if p >= 100 { return 1 }
        if p >= 1 { return 0.01 }
        if p >= 0.1 { return 0.001 }
        if p >= 0.01 { return 0.0001 }
        if p >= 0.001 { return 0.00001 }
        if p >= 0.0001 { return 0.000001 }
        if p >= 0.00001 { return 0.0000001 }
        if p >= 0.000001 { return 0.00000001 }
        return 0.000000001
    }

    private static func clusterLevels(_ values: [Double], tolerancePct: Double, rounding: Double) -> [Double] {
        let filtered = values.filter { $0.isFinite && $0 > 0 }
        if filtered.isEmpty { return [] }

        let sorted = filtered.sorted()
        var clusters: [[Double]] = []
        var current: [Double] = [sorted[0]]

        for value in sorted.dropFirst() {
            let mean = current.reduce(0, +) / Double(current.count)
            let pct = abs(value - mean) / mean
            if pct <= tolerancePct {
                current.append(value)
            } else {
                clusters.append(current)
                current = [value]
            }
        }
        clusters.append(current)

        let representatives = clusters.map { cluster -> Double in
            let mean = cluster.reduce(0, +) / Double(cluster.count)
            return roundToStep(mean, step: rounding)
        }

        var unique: [Double] = []
        var seen: Set<Double> = []
        for value in representatives.reversed() {
            if seen.insert(value).inserted {
                unique.append(value)
            }
        }
        return unique.reversed()
    }

    private static func roundToStep(_ value: Double, step: Double) -> Double {
        guard step > 0 else { return value }
        return (value / step).rounded() * step
    }

    private static func formatPrice(_ value: Double) -> String {
        if value >= 1000 { return String(format: "%.0f", value) }
        if value >= 10 { return String(format: "%.2f", value) }
        if value >= 1 { return String(format: "%.4f", value) }
        if value >= 0.1 { return String(format: "%.5f", value) }
        if value >= 0.01 { return String(format: "%.6f", value) }
        return String(format: "%.8f", value)
    }

    private static func calculateTrendStrength(closes: [Double], ema20: Double?, ema50: Double?) -> Double? {
        guard closes.count >= 60 else { return nil }

        let lookback = min(120, max(60, closes.count))
        let recent = Array(closes.suffix(lookback)).filter { $0.isFinite && $0 > 0 }
        guard recent.count >= 50 else { return nil }

        let logValues = recent.map { log($0) }
        guard let slope = linearRegressionSlope(values: logValues) else { return nil }

        let slopeStrength = min(abs(slope) * 200.0, 1.0)
        let alignment: Double
        if let ema20, let ema50 {
            alignment = ema20 >= ema50 ? 1.0 : -1.0
        } else {
            alignment = slope >= 0 ? 1.0 : -1.0
        }
        return alignment * slopeStrength
    }

    private static func linearRegressionSlope(values: [Double]) -> Double? {
        let n = values.count
        guard n >= 3 else { return nil }

        let xMean = Double(n - 1) / 2.0
        let yMean = values.reduce(0, +) / Double(n)

        var numerator: Double = 0
        var denominator: Double = 0
        for (i, y) in values.enumerated() {
            let x = Double(i)
            let dx = x - xMean
            numerator += dx * (y - yMean)
            denominator += dx * dx
        }
        guard denominator > 0 else { return nil }
        return numerator / denominator
    }

    private static func inferMarketRegime(
        lastClose: Double,
        ema20: Double?,
        ema50: Double?,
        ema200: Double?,
        structure: String,
        trendStrength: Double?,
        volatilityPct: Double?,
        rsi14: Double?,
        macdHistogram: Double?,
        adxValue: Double?,
        plusDI: Double?,
        minusDI: Double?,
        roc14: Double?
    ) -> (label: String, confidence: Int?) {
        let strength = trendStrength ?? 0
        let structureLower = structure.lowercased()
        let structureIsBullish = structureLower.contains("higher highs and higher lows")
        let structureIsBearish = structureLower.contains("lower highs and lower lows")
        let structureIsMixed = structureLower.contains("mixed") || structureLower.contains("transition")

        let priceVs200: String?
        if let ema200, lastClose > 0 {
            priceVs200 = lastClose >= ema200 ? "above EMA200" : "below EMA200"
        } else {
            priceVs200 = nil
        }

        let emaSeparationPct: Double? = {
            guard let ema20, let ema50 else { return nil }
            return abs((ema20 - ema50) / max(abs(ema50), 0.000001))
        }()

        let emaIsCompressed = (emaSeparationPct ?? 1) < 0.0035
        let adxIsLow = (adxValue ?? 99) < 16
        let adxIsDirectional = (adxValue ?? 0) >= 22
        let highVolatility = (volatilityPct ?? 0) >= 3.0
        let lowVolatility = (volatilityPct ?? 999) <= 0.45
        let diSpread = abs((plusDI ?? 0) - (minusDI ?? 0))
        let trendDirection: String = {
            if let ema20, let ema50 {
                return ema20 >= ema50 ? "bull" : "bear"
            }
            return strength >= 0 ? "bull" : "bear"
        }()

        var bullishVotes: Double = 0
        var bearishVotes: Double = 0

        if let rsi14 {
            if rsi14 >= 55 { bullishVotes += 1.0 }
            else if rsi14 <= 45 { bearishVotes += 1.0 }
            if rsi14 >= 65 { bullishVotes += 0.5 }
            else if rsi14 <= 35 { bearishVotes += 0.5 }
        }
        if let macdHistogram {
            if macdHistogram > 0 { bullishVotes += 1.0 }
            else if macdHistogram < 0 { bearishVotes += 1.0 }
        }
        if let plusDI, let minusDI {
            if plusDI > minusDI + 0.5 { bullishVotes += 1.0 }
            else if minusDI > plusDI + 0.5 { bearishVotes += 1.0 }
            if let adxValue, adxValue >= 20 {
                if plusDI > minusDI + 0.5 { bullishVotes += 0.5 }
                else if minusDI > plusDI + 0.5 { bearishVotes += 0.5 }
            }
        }
        if let roc14 {
            if roc14 > 0.3 { bullishVotes += 1.0 }
            else if roc14 < -0.3 { bearishVotes += 1.0 }
        }

        let strongBullishOpposition = bullishVotes >= bearishVotes + 1.5
        let strongBearishOpposition = bearishVotes >= bullishVotes + 1.5
        let rangeEvidenceCount = [
            emaIsCompressed,
            adxIsLow,
            structureIsMixed,
            abs(strength) < 0.06,
            abs(bullishVotes - bearishVotes) < 1.0
        ].filter { $0 }.count
        let isRange = rangeEvidenceCount >= 3
        let isCompression = isRange && lowVolatility && adxIsLow && abs(strength) < 0.05
        let trendHasConfirmation = adxIsDirectional
            || abs(strength) >= 0.10
            || structureIsBullish
            || structureIsBearish
            || abs(bullishVotes - bearishVotes) >= 1.5

        let coreLabel: String
        if isCompression {
            coreLabel = "Compression / range"
        } else if isRange {
            coreLabel = "Range / consolidation"
        } else if trendDirection == "bull" && trendHasConfirmation {
            if structureIsBearish {
                // EMAs still bullish but price structure has flipped to lower highs/lows.
                // "Bullish pullback" is misleading here — structure is already bearish.
                if let ema200, lastClose < ema200 {
                    coreLabel = "Bullish rebound (below EMA200)"
                } else if let priceVs200 {
                    coreLabel = "Bearish reversal (\(priceVs200))"
                } else {
                    coreLabel = "Bearish reversal"
                }
            } else if structureIsMixed, strongBearishOpposition {
                if let priceVs200 {
                    coreLabel = "Bearish reversal (\(priceVs200))"
                } else {
                    coreLabel = "Bearish reversal"
                }
            } else if let ema200, lastClose < ema200 {
                coreLabel = "Bullish rebound (below EMA200)"
            } else if let priceVs200 {
                coreLabel = "Bullish trend (\(priceVs200))"
            } else {
                coreLabel = "Bullish trend"
            }
        } else if trendDirection == "bear" && trendHasConfirmation {
            if structureIsBullish {
                // EMAs still bearish but price structure has flipped to higher highs/lows.
                // "Bearish rebound" is misleading — structure is already bullish.
                if let ema200, lastClose > ema200 {
                    coreLabel = "Bearish pullback (above EMA200)"
                } else if let priceVs200 {
                    coreLabel = "Bullish reversal (\(priceVs200))"
                } else {
                    coreLabel = "Bullish reversal"
                }
            } else if structureIsMixed, strongBullishOpposition {
                if let priceVs200 {
                    coreLabel = "Bullish reversal (\(priceVs200))"
                } else {
                    coreLabel = "Bullish reversal"
                }
            } else if let ema200, lastClose > ema200 {
                coreLabel = "Bearish pullback (above EMA200)"
            } else if let priceVs200 {
                coreLabel = "Bearish trend (\(priceVs200))"
            } else {
                coreLabel = "Bearish trend"
            }
        } else {
            coreLabel = structureIsMixed ? "Range / consolidation" : "Transition / unclear"
        }

        var label = coreLabel
        let directionalExpansion = highVolatility
            && adxIsDirectional
            && diSpread >= 4
            && (structureIsBullish || structureIsBearish)
        if directionalExpansion {
            label += " expansion"
        } else if highVolatility {
            label += " (high volatility)"
        }

        let confidence: Int? = {
            var score: Double = 0
            score += min(max(abs(strength) * 100.0, 0), 35)
            if let sep = emaSeparationPct {
                score += min(sep * 5000.0, 45)
            }
            let voteSpread = abs(bullishVotes - bearishVotes)
            score += min(voteSpread * 8.0, 22)
            if structureIsBullish || structureIsBearish {
                score += structureIsMixed ? 0 : 8
            }
            if let adxValue {
                if adxValue >= 25 { score += 8 }
                else if adxValue < 15 { score -= 8 }
            }
            if priceVs200 != nil { score += trendHasConfirmation ? 5 : 2 }
            if isCompression {
                score = min(max(score + 18, 45), 78)
            } else if isRange {
                score = min(max(score + 8, 35), 70)
            }
            if directionalExpansion {
                score += 10
            }
            if score <= 0 { return nil }
            return Int(min(max(score, 10), 95).rounded())
        }()

        return (label, confidence)
    }

    private static func inferMarketStructure(highs: [Double], lows: [Double], timeframeKind: TimeframeKind) -> String {
        let swingRadius: Int = {
            switch timeframeKind {
            case .intraday: return 2
            case .daily: return 3
            case .weekly, .monthly: return 4
            }
        }()
        guard highs.count == lows.count, highs.count > swingRadius * 2 else {
            return "Structure unclear"
        }

        var swingHighs: [Double] = []
        var swingLows: [Double] = []
        for i in swingRadius..<(highs.count - swingRadius) {
            let high = highs[i]
            let low = lows[i]

            var isHigh = true
            var isLow = true
            for j in (i - swingRadius)...(i + swingRadius) where j != i {
                if highs[j] > high { isHigh = false }
                if lows[j] < low { isLow = false }
                if !isHigh && !isLow { break }
            }
            if isHigh { swingHighs.append(high) }
            if isLow { swingLows.append(low) }
        }

        let lastHighs = Array(swingHighs.suffix(3))
        let lastLows = Array(swingLows.suffix(3))
        if lastHighs.count >= 2, lastLows.count >= 2 {
            let highsDown = lastHighs[lastHighs.count - 1] < lastHighs[lastHighs.count - 2]
            let lowsDown = lastLows[lastLows.count - 1] < lastLows[lastLows.count - 2]
            let highsUp = lastHighs[lastHighs.count - 1] > lastHighs[lastHighs.count - 2]
            let lowsUp = lastLows[lastLows.count - 1] > lastLows[lastLows.count - 2]

            if highsDown && lowsDown { return "Lower highs and lower lows" }
            if highsUp && lowsUp { return "Higher highs and higher lows" }
        }

        return "Mixed structure (range / transition)"
    }

    private static func fibonacciPackage(
        candles: [Candle],
        currentPrice: Double,
        timeframeKind: TimeframeKind
    ) -> (labels: [String], keyLevels: [ChartAnalysisPayload.KeyLevel], extensionLevels: [ChartAnalysisPayload.KeyLevel], confluence: [String]) {
        guard candles.count >= 60 else { return ([], [], [], []) }
        let lookback: Int = {
            switch timeframeKind {
            case .intraday: return 80
            case .daily: return 120
            case .weekly: return 160
            case .monthly: return 200
            }
        }()
        let recent = candles.suffix(min(lookback, candles.count))
        let swingHigh = recent.map(\.high).max() ?? currentPrice
        let swingLow = recent.map(\.low).min() ?? currentPrice
        let range = swingHigh - swingLow
        guard range > 0 else { return ([], [], [], []) }

        let retracements: [(name: String, factor: Double)] = [
            ("23.6%", 0.236),
            ("38.2%", 0.382),
            ("50.0%", 0.500),
            ("61.8%", 0.618),
            ("78.6%", 0.786)
        ]

        let retracementPrices = retracements.map { item in
            (item.name, swingHigh - range * item.factor)
        }

        var labels: [String] = []
        labels.reserveCapacity(retracementPrices.count)
        var keyLevels: [ChartAnalysisPayload.KeyLevel] = []
        keyLevels.reserveCapacity(retracementPrices.count)

        let rounding = roundingStep(for: currentPrice)
        for (name, raw) in retracementPrices {
            let price = roundToStep(raw, step: rounding)
            if price <= 0 { continue }
            labels.append("Fib \(name): \(formatPrice(price))")
            keyLevels.append(ChartAnalysisPayload.KeyLevel(
                price: formatPrice(price),
                kind: price <= currentPrice ? "support" : "resistance",
                note: "Fib retracement \(name)"
            ))
        }

        var confluence: [String] = []
        let tolerance = 0.008
        for (name, raw) in retracementPrices {
            let diff = abs(currentPrice - raw) / max(currentPrice, 0.000001)
            if diff <= tolerance {
                confluence.append("Near Fib \(name) (\(formatPrice(roundToStep(raw, step: rounding))))")
                break
            }
        }

        let extensions: [(name: String, factor: Double)] = [
            ("127.2%", 0.272),
            ("138.2%", 0.382),
            ("161.8%", 0.618),
            ("200.0%", 1.000),
            ("261.8%", 1.618)
        ]

        let midpoint = (swingHigh + swingLow) / 2.0
        let isBullish = currentPrice > midpoint
        let base = isBullish ? swingHigh : swingLow
        let extensionRaw: [(String, Double)] = extensions.map { item in
            let value = isBullish ? (base + range * item.factor) : (base - range * item.factor)
            return (item.name, value)
        }

        var extensionKeyLevels: [ChartAnalysisPayload.KeyLevel] = []
        extensionKeyLevels.reserveCapacity(extensionRaw.count)
        for (name, raw) in extensionRaw {
            let price = roundToStep(raw, step: rounding)
            // Crypto/FX spot cannot go below zero; negative extension levels are not actionable.
            if price <= 0 { continue }
            extensionKeyLevels.append(ChartAnalysisPayload.KeyLevel(
                price: formatPrice(price),
                kind: isBullish ? "resistance" : "support",
                note: "Fib extension \(name)"
            ))
        }

        return (labels, keyLevels, extensionKeyLevels, confluence)
    }

    private static func mergeKeyLevels(
        baseLevels: [ChartAnalysisPayload.KeyLevel],
        extraLevels: [ChartAnalysisPayload.KeyLevel],
        currentPrice: Double
    ) -> [ChartAnalysisPayload.KeyLevel] {
        let all = (baseLevels + extraLevels).compactMap { level -> (Double, ChartAnalysisPayload.KeyLevel)? in
            guard let v = Double(level.price) else { return nil }
            guard v > 0 else { return nil }
            return (v, level)
        }.sorted { $0.0 < $1.0 }.map(\.1)

        var result = compactLevelSet(all, currentPrice: currentPrice, maxCount: 10)

        // Fill large gaps near the current price with extra levels so that scenarios
        // and trade setups have actionable intermediate targets instead of huge voids.
        let parsed = result.compactMap { level -> Double? in Double(level.price) }
        let epsilon = currentPrice * 0.0002
        let nearestAbove = parsed.first(where: { $0 > currentPrice + epsilon })
        let nearestBelow = parsed.last(where: { $0 < currentPrice - epsilon })
        let gapAbove = nearestAbove.map { ($0 - currentPrice) / currentPrice } ?? 1.0
        let gapBelow = nearestBelow.map { (currentPrice - $0) / currentPrice } ?? 1.0
        let gapThreshold = 0.08 // 8% gap considered too large

        if gapAbove > gapThreshold || gapBelow > gapThreshold {
            // Re-introduce extra levels that fall inside the gap(s) and weren't in the compacted set.
            // Relative, not a fixed 1e-4 grid: on a sub-cent instrument every
            // level collapsed onto the same bucket and the gap fill did nothing.
            let dedupeStep = roundingStep(for: currentPrice)
            let existingValues = Set(parsed.map { roundToStep($0, step: dedupeStep) })
            let gapFillers = extraLevels.compactMap { level -> (Double, ChartAnalysisPayload.KeyLevel)? in
                guard let v = Double(level.price), v > 0, v.isFinite else { return nil }
                let rounded = roundToStep(v, step: dedupeStep)
                if existingValues.contains(rounded) { return nil }
                let inUpperGap = gapAbove > gapThreshold && v > currentPrice + epsilon && (nearestAbove == nil || v < nearestAbove!)
                let inLowerGap = gapBelow > gapThreshold && v < currentPrice - epsilon && (nearestBelow == nil || v > nearestBelow!)
                if !inUpperGap && !inLowerGap { return nil }
                return (v, level)
            }.sorted { abs($0.0 - currentPrice) < abs($1.0 - currentPrice) }

            for (_, filler) in gapFillers.prefix(3) {
                result.append(filler)
            }
            result = compactLevelSet(result, currentPrice: currentPrice, maxCount: 10)
        }

        return result
    }

    private static func buildScenariosAndTargets(
        levels: [ChartAnalysisPayload.KeyLevel],
        lastPrice: Double,
        symbol: String,
        timeframe: String
    ) -> ([ChartAnalysisPayload.Scenario], ChartAnalysisPayload.TimeHorizonTargets) {
        let symbolUpper = symbol.uppercased()
        let isYahooFX = symbolUpper.hasSuffix("=X")
        let timeframeLower = timeframe.lowercased()
        let numeric = levels.compactMap { level -> (Double, String)? in
            guard let v = Double(level.price) else { return nil }
            guard v > 0 else { return nil }
            return (v, level.price)
        }.sorted { $0.0 < $1.0 }

        let below = numeric.filter { $0.0 < lastPrice }
        let above = numeric.filter { $0.0 > lastPrice }

        let isJPYPair = symbolUpper.contains("JPY")
        let roundingStep = isJPYPair ? 0.01 : 0.0005
        let displayDecimals = isJPYPair ? 3 : 4
        enum ScenarioDirection {
            case bullish
            case bearish
            case range
            case other
        }

        func roundFX(_ value: Double) -> Double {
            (value / roundingStep).rounded() * roundingStep
        }

        func formatFX(_ value: Double) -> String {
            String(format: "%.\(displayDecimals)f", roundFX(value))
        }

        func syntheticFXOffset() -> Double {
            let pct: Double
            switch timeframeLower {
            // "1m" is one minute, not one month: grouping it with "1mo" put the
            // synthetic level 7% away from price on a one-minute FX chart, which
            // is several hundred pips.
            case "1m": pct = 0.0004
            case "5m": pct = 0.0006
            case "15m": pct = 0.0008
            case "30m": pct = 0.0010
            case "1h": pct = 0.0012
            case "2h": pct = 0.0016
            case "4h": pct = 0.0022
            case "1d": pct = 0.012
            case "1w": pct = 0.035
            case "1mo": pct = 0.070
            default: pct = 0.0020
            }
            return max(lastPrice * pct, roundingStep * 2.0)
        }

        let syntheticOffset = syntheticFXOffset()
        let support = below.last?.1 ?? (isYahooFX ? formatFX(lastPrice - syntheticOffset) : nil)
        let resistance = above.first?.1 ?? (isYahooFX ? formatFX(lastPrice + syntheticOffset) : nil)
        let explicitNextAbove = cleanLevelText(above.dropFirst().first?.1)
        let explicitNextBelow = cleanLevelText(below.dropLast().last?.1)
        let explicitHigherAbove = cleanLevelText(above.dropFirst(2).first?.1)
        let explicitDeeperBelow = cleanLevelText(below.dropLast(2).last?.1)

        let nextAbove = explicitNextAbove ?? (isYahooFX ? formatFX(lastPrice + syntheticOffset * 2.0) : nil)
        let nextBelow = explicitNextBelow ?? (isYahooFX ? formatFX(lastPrice - syntheticOffset * 2.0) : nil)

        // Ensure we always have both support and resistance for targets/scenarios.
        // Fallback: compute synthetic nearest levels as a percentage of price when
        // the derived levels don't contain any levels above/below current price.
        let pct: Double = {
            switch timeframeLower {
            case "1m": return 0.001
            case "5m": return 0.002
            case "15m": return 0.003
            case "30m": return 0.005
            case "1h": return 0.008
            case "2h": return 0.012
            case "4h": return 0.018
            case "6h", "8h": return 0.025
            case "1d": return 0.040
            case "1w": return 0.060
            default: return 0.010
            }
        }()
        func syntheticLevel(price: Double, pct: Double, decimals: Int) -> String {
            String(format: "%.\(decimals)f", price * (1.0 + pct))
        }
        func syntheticLevelDown(price: Double, pct: Double, decimals: Int) -> String {
            String(format: "%.\(decimals)f", price * (1.0 - pct))
        }
        func cleanLevelText(_ value: String?) -> String? {
            guard let value else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        let nearestExplicitResistance = cleanLevelText(above.first?.1)
        let nearestExplicitSupport = cleanLevelText(below.last?.1)
        let effectiveResistance = cleanLevelText(resistance)
            ?? nearestExplicitResistance
            ?? syntheticLevel(price: lastPrice, pct: pct, decimals: displayDecimals)
        let effectiveSupport = cleanLevelText(support)
            ?? nearestExplicitSupport
            ?? syntheticLevelDown(price: lastPrice, pct: pct, decimals: displayDecimals)
        let effectiveNextAbove = cleanLevelText(nextAbove)
            ?? cleanLevelText(above.dropFirst().first?.1)
            ?? syntheticLevel(price: lastPrice, pct: pct * 2.5, decimals: displayDecimals)
        let effectiveNextBelow = cleanLevelText(nextBelow)
            ?? cleanLevelText(below.dropLast().last?.1)
            ?? syntheticLevelDown(price: lastPrice, pct: pct * 2.5, decimals: displayDecimals)

        let nearestAboveDistancePct = above.first.map { ($0.0 - lastPrice) / max(lastPrice, 0.000001) }
        let nearestBelowDistancePct = below.last.map { (lastPrice - $0.0) / max(lastPrice, 0.000001) }

        func maxExplicitScenarioMovePct() -> Double {
            switch timeframeLower {
            case "15m": return 0.012
            case "30m": return 0.018
            case "1h": return 0.025
            case "2h": return 0.040
            case "4h": return 0.065
            case "6h", "8h": return 0.090
            case "1d": return 0.140
            case "1w": return 0.220
            default: return isYahooFX ? 0.020 : 0.080
            }
        }

        func shouldKeepExplicitTarget(_ display: String?, direction: ScenarioDirection) -> Bool {
            guard let display, let value = Double(display), value.isFinite, lastPrice > 0 else { return false }
            let distancePct = abs(value - lastPrice) / lastPrice
            let nearestPct: Double = {
                switch direction {
                case .bullish:
                    return nearestAboveDistancePct ?? 0
                case .bearish:
                    return nearestBelowDistancePct ?? 0
                case .range, .other:
                    return 0
                }
            }()
            let adaptiveCap = max(maxExplicitScenarioMovePct(), nearestPct * 4.0)
            return distancePct <= adaptiveCap
        }

        func followThroughPath(_ values: [String?], fallback: String, prefix: String? = nil) -> String {
            var seen: Set<String> = []
            let clean = values
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .filter { seen.insert($0).inserted }
            if clean.isEmpty { return fallback }
            let joined = clean.joined(separator: ", ")
            if let prefix, prefix.isEmpty == false {
                return "\(prefix) \(joined)"
            }
            return "Potential follow-through toward \(joined)"
        }

        func directionalPath(_ direction: ScenarioDirection, values: [String?], fallback: String, prefix: String? = nil) -> String {
            let filtered = values.filter { shouldKeepExplicitTarget($0, direction: direction) }
            return followThroughPath(filtered, fallback: fallback, prefix: prefix)
        }

        let bullish: ChartAnalysisPayload.Scenario
        let bearish: ChartAnalysisPayload.Scenario
        let range: ChartAnalysisPayload.Scenario

        if isYahooFX {
            let bullishFXTargets = [explicitNextAbove, explicitHigherAbove]
            let bearishFXTargets = [explicitNextBelow, explicitDeeperBelow]
            let bullishFXFallback = bullishFXTargets.compactMap { $0 }.isEmpty
                ? "FX continuation toward higher areas if momentum expands"
                : "FX continuation toward higher levels"
            let bearishFXFallback = bearishFXTargets.compactMap { $0 }.isEmpty
                ? "FX breakdown toward lower areas if pressure expands"
                : "FX breakdown toward lower levels"

            bullish = ChartAnalysisPayload.Scenario(
                name: "Bullish",
                trigger: "Break and hold above \(effectiveResistance)",
                path: directionalPath(.bullish, values: bullishFXTargets, fallback: bullishFXFallback, prefix: bullishFXTargets.compactMap { $0 }.isEmpty ? nil : "FX continuation toward"),
                invalidation: "Back below \(effectiveSupport)",
                probability: nil
            )

            bearish = ChartAnalysisPayload.Scenario(
                name: "Bearish",
                trigger: "Break and hold below \(effectiveSupport)",
                path: directionalPath(.bearish, values: bearishFXTargets, fallback: bearishFXFallback, prefix: bearishFXTargets.compactMap { $0 }.isEmpty ? nil : "FX breakdown toward"),
                invalidation: "Back above \(effectiveResistance)",
                probability: nil
            )

            range = ChartAnalysisPayload.Scenario(
                name: "Range",
                trigger: "Range holds between \(effectiveSupport) and \(effectiveResistance)",
                path: "FX range rotation remains active between \(effectiveSupport) and \(effectiveResistance)",
                invalidation: "A decisive close above \(effectiveResistance) or below \(effectiveSupport) ends the range state",
                probability: nil
            )
        } else {
            let bullishExplicitTargets = [explicitNextAbove, explicitHigherAbove]
            let bearishExplicitTargets = [explicitNextBelow, explicitDeeperBelow]
            let bullishFallback = bullishExplicitTargets.compactMap { $0 }.isEmpty
                ? "Continuation toward the next overhead area if momentum confirms"
                : "Continuation toward the next overhead levels"
            let bearishFallback = bearishExplicitTargets.compactMap { $0 }.isEmpty
                ? "Continuation toward lower support areas if breakdown confirms"
                : "Continuation toward lower supports"

            bullish = ChartAnalysisPayload.Scenario(
                name: "Bullish",
                trigger: "Acceptance above \(effectiveResistance)",
                path: directionalPath(.bullish, values: bullishExplicitTargets, fallback: bullishFallback),
                invalidation: "Back below \(effectiveSupport)",
                probability: nil
            )

            bearish = ChartAnalysisPayload.Scenario(
                name: "Bearish",
                trigger: "Acceptance below \(effectiveSupport)",
                path: directionalPath(.bearish, values: bearishExplicitTargets, fallback: bearishFallback),
                invalidation: "Back above \(effectiveResistance)",
                probability: nil
            )

            range = ChartAnalysisPayload.Scenario(
                name: "Range",
                trigger: "Holds between \(effectiveSupport) and \(effectiveResistance)",
                path: "Mean reversion between \(effectiveSupport) ↔ \(effectiveResistance)",
                invalidation: "Break and hold above \(effectiveResistance) (bullish) or below \(effectiveSupport) (bearish)",
                probability: nil
            )
        }

        func arrowUp(_ p: String) -> String { "↑ \(p)" }
        func arrowDown(_ p: String) -> String { "↓ \(p)" }
        func directionalTarget(_ item: (Double, String)) -> String? {
            let epsilon = max(lastPrice * 0.0001, 0.0000001)
            if item.0 > lastPrice + epsilon { return arrowUp(item.1) }
            if item.0 < lastPrice - epsilon { return arrowDown(item.1) }
            return nil
        }
        func uniqueTargets(_ items: [String]) -> [String] {
            var seen: Set<String> = []
            var result: [String] = []
            result.reserveCapacity(items.count)
            for item in items where seen.insert(item).inserted {
                result.append(item)
            }
            return result
        }

        let targets = ChartAnalysisPayload.TimeHorizonTargets(
            shortTerm: ["↑ \(effectiveResistance)", "↓ \(effectiveSupport)"],
            mediumTerm: ["↑ \(effectiveNextAbove)", "↓ \(effectiveNextBelow)"],
            longTerm: uniqueTargets((Array(above.suffix(2)) + Array(below.prefix(2))).compactMap(directionalTarget))
        )

        return ([bullish, bearish, range], targets)
    }

    private static func buildSignals(
        regimeLabel: String,
        ema20: Double?,
        ema50: Double?,
        ema200: Double?,
        rsi14: Double?,
        stochK: Double?,
        stochD: Double?,
        atr14: Double?,
        volatilityPct: Double?,
        volatilityRegime: VolatilityRegime?,
        trendStrength: Double?,
        structure: String,
        candles: [Candle],
        levels: [ChartAnalysisPayload.KeyLevel],
        fibConfluence: [String],
        bollinger: BollingerPack,
        adx: ADXPack,
        obv: OBVPack,
        avwap: AVWAPPack?,
        roc14: Double?,
        regressionChannel: RegressionChannelPack?,
        divergenceSignals: [String],
        structureLayer: MarketStructureLayer,
        swingPoints: [SwingPoint],
        macd: Double?,
        macdSignal: Double?,
        macdHist: Double?,
        indicatorSelection: IndicatorSelection
    ) -> (confluence: [String], indicators: [String], bias: ChartAnalysisPayload.Bias?, riskNotes: [String]) {
        var confluence: [String] = []
        var indicators: [String] = []
        var riskNotes: [String] = []

        if indicatorSelection.emaTrend, let ema20, let ema50 {
            let trend = ema20 >= ema50 ? "EMA20 above EMA50" : "EMA20 below EMA50"
            confluence.append(trend)
            indicators.append("EMA20: \(formatCompact(ema20)) • EMA50: \(formatCompact(ema50))")
        }

        if indicatorSelection.emaTrend, let ema200, let last = candles.last?.close {
            let above = last >= ema200
            confluence.append(above ? "Price above EMA200" : "Price below EMA200")
            indicators.append("EMA200: \(formatCompact(ema200))")
        }

        if indicatorSelection.rsi, let rsi14 {
            let state: String
            if rsi14 >= 68 { state = "overbought" }
            else if rsi14 <= 32 { state = "oversold" }
            else if rsi14 > 55 { state = "bullish" }
            else if rsi14 < 45 { state = "bearish" }
            else { state = "neutral" }
            if state != "neutral" {
                confluence.append("RSI(14) \(state)")
            }
            indicators.append("RSI(14): \(String(format: "%.0f", rsi14))")

            let regimeLower = regimeLabel.lowercased()
            if regimeLower.contains("bearish"), rsi14 <= 35 {
                riskNotes.append("Oversold in a bearish tape: expect bounces, fake reversals, and chop before continuation.")
            } else if regimeLower.contains("bullish"), rsi14 >= 65 {
                riskNotes.append("Overbought in a bullish tape: expect pauses or shakeouts before continuation.")
            }
        }

        if let stochK, let stochD {
            let state: String
            if stochK >= 80 { state = "overbought" }
            else if stochK <= 20 { state = "oversold" }
            else { state = "neutral" }
            if state != "neutral" {
                confluence.append("Stoch(14) \(state)")
            }
            indicators.append("Stoch(14): %K \(String(format: "%.0f", stochK)) • %D \(String(format: "%.0f", stochD))")
        }

        if indicatorSelection.macd, let macd, let macdSignal, let macdHist {
            let state = macdHist >= 0 ? "bullish" : "bearish"
            let lastPrice = candles.last?.close ?? 0
            let histPctOfPrice = abs(macdHist) / max(lastPrice, 0.0000001) * 100.0
            let histRelToSignal = abs(macdHist) / max(abs(macdSignal), 0.0000001)
            let isMeaningful = histPctOfPrice >= 0.02 || histRelToSignal >= 0.10
            if isMeaningful {
                confluence.append("MACD \(state)")
            }
            indicators.append("MACD: \(String(format: "%+.4f", macd)) • Signal: \(String(format: "%+.4f", macdSignal)) • Hist: \(String(format: "%+.4f", macdHist))")
        }

        if indicatorSelection.adx, let adxValue = adx.adx, let plus = adx.plusDI, let minus = adx.minusDI {
            let strength: String
            if adxValue >= 25 { strength = "strong" }
            else if adxValue <= 15 { strength = "weak" }
            else { strength = "moderate" }
            let direction = plus >= minus ? "DI+ > DI-" : "DI- > DI+"
            if strength != "moderate" {
                confluence.append("ADX(14) \(strength) trend")
            }
            let diSpread = abs(plus - minus)
            if diSpread >= 4.0 {
                confluence.append(direction)
            }
            indicators.append("ADX(14): \(String(format: "%.0f", adxValue)) • +DI \(String(format: "%.0f", plus)) • -DI \(String(format: "%.0f", minus))")
        }

        if indicatorSelection.bollingerBands,
           let lastClose = candles.last?.close,
           let middle = bollinger.middle,
           let upper = bollinger.upper,
           let lower = bollinger.lower {
            indicators.append("BB(20,2): \(formatCompact(middle)) • U \(formatCompact(upper)) • L \(formatCompact(lower))")
            if let widthPct = bollinger.widthPct {
                indicators.append("BB width: \(String(format: "%.2f", widthPct))%")
                if widthPct >= 6.0 {
                    riskNotes.append("Wide Bollinger Bands: volatility expanded.")
                }
            }

            if lastClose >= upper {
                confluence.append("Above Bollinger upper band")
            } else if lastClose <= lower {
                confluence.append("Below Bollinger lower band")
            } else {
                let halfWidth = max((upper - lower) / 2.0, 0.0000001)
                let z = abs(lastClose - middle) / halfWidth
                if z >= 0.35 {
                    confluence.append(lastClose >= middle ? "Above BB midline" : "Below BB midline")
                }
            }
        }

        if let obvValue = obv.obv, let delta = obv.delta {
            let state = delta >= 0 ? "rising" : "falling"
            indicators.append("OBV(Δ20): \(state) (\(String(format: "%+.0f", delta)))")
            if abs(delta) == 0, obvValue != 0 {
                indicators.append("OBV: \(String(format: "%.0f", obvValue))")
            }

            let recent = candles.suffix(20).map(\.volume)
            let avgVol20 = recent.isEmpty ? 0 : (recent.reduce(0, +) / Double(recent.count))
            if avgVol20 > 0, abs(delta) >= avgVol20 * 6.0 {
                confluence.append("OBV \(state)")
            }
        }

        if let atr14 {
            indicators.append("ATR(14): \(formatCompact(atr14))")
        }

        if let volatilityPct {
            indicators.append("ATR(14) as %: \(String(format: "%.2f", volatilityPct))%")
            if volatilityPct >= 3.0 {
                riskNotes.append("High volatility: ATR is \(String(format: "%.2f", volatilityPct))% of price.")
            }
        }

        if let volatilityRegime {
            if let percentile = volatilityRegime.percentile {
                indicators.append("Volatility regime: \(volatilityRegime.label) (p\(percentile))")
            } else {
                indicators.append("Volatility regime: \(volatilityRegime.label)")
            }
            let lowerLabel = volatilityRegime.label.lowercased()
            if lowerLabel.contains("high") {
                riskNotes.append("Volatility regime is high; expect wider swings and more whipsaw.")
            } else if lowerLabel.contains("low") {
                // ATR can be "high" in absolute terms while still being low vs its own historical distribution.
                // Avoid presenting contradictory notes (e.g., "High volatility" + "Volatility regime is low").
                if let volatilityPct, volatilityPct >= 3.0 {
                    if let percentile = volatilityRegime.percentile {
                        riskNotes.append("Volatility is low vs recent history (p\(percentile)), but ATR is still \(String(format: "%.2f", volatilityPct))% — manage position sizing and stop distance.")
                    }
                } else {
                    riskNotes.append("Volatility regime is low; breakouts may need confirmation to avoid false moves.")
                }
            }
        }

        if let trendStrength {
            let trendState: String = {
                let absStrength = abs(trendStrength)
                let adxValue = adx.adx ?? 0
                let exhaustedUp = trendStrength > 0 && ((rsi14 ?? 50) >= 70 || (stochK ?? 50) >= 85)
                let exhaustedDown = trendStrength < 0 && ((rsi14 ?? 50) <= 30 || (stochK ?? 50) <= 15)
                if exhaustedUp || exhaustedDown { return "Exhausted trend" }
                if absStrength < 0.04 || adxValue < 16 { return "Transitioning trend" }
                if absStrength >= 0.20 || adxValue >= 32 { return "Strong trend" }
                if absStrength >= 0.10 || adxValue >= 22 { return "Healthy trend" }
                return "Weak trend"
            }()
            indicators.append("Trend strength: \(String(format: "%+.0f", trendStrength * 100.0)) (\(trendState))")
        }

        if structureLayer.events.isEmpty == false {
            indicators.append(contentsOf: structureLayer.events.prefix(8).map { event in
                // Same reason: the swing label is already labelled.
                event.hasPrefix("Structure") ? event : "Structure: \(event)"
            })
        }
        for item in structureLayer.confluenceItems where confluence.contains(item) == false {
            confluence.append(item)
        }
        for note in structureLayer.riskNotes where riskNotes.contains(note) == false {
            riskNotes.append(note)
        }

        if let roc14 {
            let state: String
            if roc14 >= 1.5 { state = "strong up" }
            else if roc14 <= -1.5 { state = "strong down" }
            else if roc14 > 0.3 { state = "up" }
            else if roc14 < -0.3 { state = "down" }
            else { state = "flat" }
            if state != "flat" {
                confluence.append("ROC(14) \(state)")
            }
            indicators.append("ROC(14): \(String(format: "%+.2f", roc14))%")
        }

        if let avwap,
           let vwap = avwap.vwap,
           let last = candles.last?.close {
            indicators.append("AVWAP: \(formatCompact(vwap)) (\(avwap.anchorLabel))")
            if let upper = avwap.upper1, let lower = avwap.lower1 {
                indicators.append("AVWAP band: U \(formatCompact(upper)) • L \(formatCompact(lower))")
                if last >= upper {
                    confluence.append("Above AVWAP upper band")
                } else if last <= lower {
                    confluence.append("Below AVWAP lower band")
                }
            }
            if let atr14, atr14 > 0, abs(last - vwap) >= atr14 * 0.25 {
                confluence.append(last >= vwap ? "Above AVWAP" : "Below AVWAP")
            }
        }

        if let regressionChannel {
            indicators.append("Regression: mid \(formatCompact(regressionChannel.mid)) • U \(formatCompact(regressionChannel.upper)) • L \(formatCompact(regressionChannel.lower))")
            let halfWidth = max((regressionChannel.upper - regressionChannel.lower) / 2.0, 0.0000001)
            let z = abs((candles.last?.close ?? regressionChannel.mid) - regressionChannel.mid) / halfWidth
            if z >= 0.35 {
                confluence.append(regressionChannel.positionLabel)
            }
            if let slopePct = regressionChannel.slopePctPerBar {
                indicators.append("Regression slope: \(String(format: "%+.2f", slopePct))%/bar")
            }
        }

        if indicatorSelection.fibonacci {
            confluence.append(contentsOf: fibConfluence)
        }
        for signal in divergenceSignals {
            if confluence.contains(signal) == false {
                confluence.append(signal)
            }
        }

        let detectedPatterns = detectDeterministicPatterns(candles: candles, swingPoints: swingPoints)
        let bearishPatterns: Set<String> = ["Descending triangle", "Head and shoulders", "Double top", "Bearish engulfing", "Evening star", "Shooting-star-like rejection candle"]
        let bullishPatterns: Set<String> = ["Ascending triangle", "Inverse head and shoulders", "Double bottom", "Bullish engulfing", "Morning star", "Hammer-like rejection candle"]
        let detectedBullishPatterns = detectedPatterns.filter { bullishPatterns.contains($0) }
        let detectedBearishPatterns = detectedPatterns.filter { bearishPatterns.contains($0) }
        let hasPatternConflict = detectedBullishPatterns.isEmpty == false && detectedBearishPatterns.isEmpty == false

        if detectedPatterns.isEmpty {
            indicators.append("Pattern: none clear")
        } else if hasPatternConflict {
            indicators.append("Pattern: conflict / none clear")
            riskNotes.append("Pattern conflict: bullish and bearish formations are both present — reduce conviction and rely more on live confirmation.")
        } else {
            for pattern in detectedPatterns.prefix(6) {
                indicators.append("Pattern: \(pattern)")
            }

            // Cross-check: flag when detected pattern contradicts the regime direction.
            let regimeLower = regimeLabel.lowercased()
            let regimeIsBullish = regimeLower.contains("bullish")
            let regimeIsBearish = regimeLower.contains("bearish")
            for pattern in detectedPatterns.prefix(6) {
                if regimeIsBullish && bearishPatterns.contains(pattern) {
                    riskNotes.append("Pattern conflict: \(pattern) is typically bearish but regime reads bullish — watch for trend reversal.")
                } else if regimeIsBearish && bullishPatterns.contains(pattern) {
                    riskNotes.append("Pattern conflict: \(pattern) is typically bullish but regime reads bearish — watch for trend reversal.")
                }
            }
        }

        if let last = candles.last {
            let rangePct = (last.high - last.low) / max(last.close, 0.000001) * 100.0
            indicators.append("Last candle range: \(String(format: "%.2f", rangePct))%")
        }

        _ = levels

        let bias: ChartAnalysisPayload.Bias? = {
            var bullPoints = 0.0
            var bearPoints = 0.0
            var bullishVotes = 0
            var bearishVotes = 0

            func addBull(_ points: Double, vote: Bool = true) {
                bullPoints += points
                if vote { bullishVotes += 1 }
            }

            func addBear(_ points: Double, vote: Bool = true) {
                bearPoints += points
                if vote { bearishVotes += 1 }
            }

            if indicatorSelection.emaTrend, let ema20, let ema50 {
                if ema20 >= ema50 { addBull(2.0) } else { addBear(2.0) }
            }
            if indicatorSelection.emaTrend, let ema200, let last = candles.last?.close {
                if last >= ema200 { addBull(2.0) } else { addBear(2.0) }
            }
            if indicatorSelection.macd, let macdHist {
                if macdHist >= 0 { addBull(1.2) } else { addBear(1.2) }
            }
            if indicatorSelection.rsi, let rsi14 {
                if rsi14 >= 68 { addBear(0.8) }
                else if rsi14 <= 32 { addBull(0.8) }
                else if rsi14 > 55 { addBull(1.0) }
                else if rsi14 < 45 { addBear(1.0) }
            }
            if let stochK {
                if stochK >= 85 { addBear(0.7) }
                else if stochK <= 15 { addBull(0.7) }
            }
            if indicatorSelection.adx, let adxValue = adx.adx, let plus = adx.plusDI, let minus = adx.minusDI {
                if adxValue >= 20 {
                    if plus >= minus { addBull(1.2) } else { addBear(1.2) }
                } else {
                    if plus >= minus + 1.0 { addBull(0.5) }
                    else if minus >= plus + 1.0 { addBear(0.5) }
                }
            }

            if let last = candles.last?.close, let avwap, let vwap = avwap.vwap {
                if last >= vwap { addBull(1.1) } else { addBear(1.1) }
                if let upper = avwap.upper1, last >= upper { addBull(0.4, vote: false) }
                if let lower = avwap.lower1, last <= lower { addBear(0.4, vote: false) }
            }

            if let delta = obv.delta {
                if delta > 0 { addBull(0.8) }
                else if delta < 0 { addBear(0.8) }
            }

            if let roc14 {
                if roc14 > 0.3 { addBull(0.8) }
                else if roc14 < -0.3 { addBear(0.8) }
            }

            let structureLower = structure.lowercased()
            if structureLower.contains("higher highs") {
                addBull(2.0)
            } else if structureLower.contains("lower highs") {
                addBear(2.0)
            }

            switch structureLayer.bias {
            case .bullish:
                addBull(2.0)
            case .bearish:
                addBear(2.0)
            case .mixed:
                addBull(0.4, vote: false)
                addBear(0.4, vote: false)
            }
            if structureLayer.hasBullishBOS || structureLayer.hasBullishCHoCH { addBull(1.2) }
            if structureLayer.hasBearishBOS || structureLayer.hasBearishCHoCH { addBear(1.2) }
            if structureLayer.hasBullishSweep || structureLayer.hasBullishReclaim || structureLayer.hasBullishReaction { addBull(0.9) }
            if structureLayer.hasBearishSweep || structureLayer.hasBearishReclaim || structureLayer.hasBearishReaction { addBear(0.9) }

            let regimeLower = regimeLabel.lowercased()
            if regimeLower.contains("bullish trend") {
                addBull(2.0)
            } else if regimeLower.contains("bearish trend") {
                addBear(2.0)
            } else if regimeLower.contains("bearish reversal") {
                addBear(1.5)
                addBull(0.5, vote: false)
            } else if regimeLower.contains("bullish reversal") {
                addBull(1.5)
                addBear(0.5, vote: false)
            } else if regimeLower.contains("bullish pullback") || regimeLower.contains("bearish rebound") {
                addBull(1.0, vote: false)
                addBear(1.0, vote: false)
            } else if regimeLower.contains("bullish rebound") {
                addBull(1.0, vote: false)
                addBear(1.0, vote: false)
            } else if regimeLower.contains("range") || regimeLower.contains("consolidation") {
                addBull(1.0, vote: false)
                addBear(1.0, vote: false)
            }

            let mixedStructure = structureLower.contains("mixed") || structureLower.contains("transition")
            let rangeLikeRegime = regimeLower.contains("range") || regimeLower.contains("consolidation")
            let reversalLikeRegime = regimeLower.contains("reversal") || regimeLower.contains("rebound") || regimeLower.contains("pullback")
            let hasDivergence = divergenceSignals.isEmpty == false
            let conflictingEvidence = bullishVotes >= 2 && bearishVotes >= 2
            let strongDirectionalDisagreement = abs(bullishVotes - bearishVotes) <= 1 && min(bullishVotes, bearishVotes) >= 2

            let liveTapeBullish = (macdHist ?? 0) >= 0 && (adx.plusDI ?? 0) >= (adx.minusDI ?? 0) && (obv.delta ?? 0) >= 0
            let liveTapeBearish = (macdHist ?? 0) < 0 && (adx.minusDI ?? 0) > (adx.plusDI ?? 0) && (obv.delta ?? 0) < 0
            let regimeVsTapeConflict = (regimeLower.contains("bullish") && liveTapeBearish) || (regimeLower.contains("bearish") && liveTapeBullish)

            if conflictingEvidence {
                bullPoints *= 0.92
                bearPoints *= 0.92
            }
            if regimeVsTapeConflict {
                bullPoints *= 0.90
                bearPoints *= 0.90
            }
            if hasPatternConflict {
                bullPoints *= 0.90
                bearPoints *= 0.90
            }

            let total = max(1.0, bullPoints + bearPoints)
            var bullish = Int((bullPoints / total * 100.0).rounded())
            var bearish = Int((bearPoints / total * 100.0).rounded())
            // Fix rounding: if independent rounding pushes sum past 100, subtract from dominant.
            let rawSum = bullish + bearish
            if rawSum > 100 {
                if bullish >= bearish { bullish -= (rawSum - 100) }
                else { bearish -= (rawSum - 100) }
            }
            var neutral = max(0, 100 - bullish - bearish)

            let diff = abs(bullish - bearish)
            if diff <= 10 {
                neutral = max(neutral, 20)
                let remaining = 100 - neutral
                bullish = remaining / 2
                bearish = remaining - bullish
            } else if diff <= 20 {
                neutral = max(neutral, 10)
                let remaining = 100 - neutral
                if bullish > bearish {
                    bullish = min(bullish, remaining)
                    bearish = remaining - bullish
                } else {
                    bearish = min(bearish, remaining)
                    bullish = remaining - bearish
                }
            }

            let isRangeLikeRegime = rangeLikeRegime
            let isTransitionStructure = mixedStructure
            if isRangeLikeRegime || isTransitionStructure {
                let neutralFloor = diff <= 20 ? 40 : 30
                if neutral < neutralFloor {
                    neutral = neutralFloor
                    let remaining = 100 - neutral
                    let directionalTotal = max(1.0, bullPoints + bearPoints)
                    bullish = Int((bullPoints / directionalTotal * Double(remaining)).rounded())
                    bearish = max(0, remaining - bullish)
                }

                let directionalCap = 45
                if bullish > bearish {
                    bullish = min(bullish, directionalCap)
                    bearish = max(0, 100 - neutral - bullish)
                } else if bearish > bullish {
                    bearish = min(bearish, directionalCap)
                    bullish = max(0, 100 - neutral - bearish)
                }
            }

            if reversalLikeRegime {
                neutral = max(neutral, 20)
                let remaining = 100 - neutral
                let dominantCap = 60
                if bullish > bearish {
                    bullish = min(bullish, dominantCap)
                    bearish = max(0, remaining - bullish)
                } else if bearish > bullish {
                    bearish = min(bearish, dominantCap)
                    bullish = max(0, remaining - bearish)
                } else {
                    bullish = remaining / 2
                    bearish = remaining - bullish
                }
            }

            if conflictingEvidence || strongDirectionalDisagreement || hasDivergence || regimeVsTapeConflict || hasPatternConflict {
                let neutralFloor: Int = {
                    if hasPatternConflict { return 25 }
                    if regimeVsTapeConflict { return 22 }
                    if hasDivergence { return 20 }
                    return 15
                }()
                neutral = max(neutral, neutralFloor)
                let remaining = 100 - neutral
                let directionalTotal = max(1.0, bullPoints + bearPoints)
                bullish = Int((bullPoints / directionalTotal * Double(remaining)).rounded())
                bearish = max(0, remaining - bullish)
            }

            let dominantCap: Int = {
                if rangeLikeRegime || mixedStructure { return 55 }
                if regimeVsTapeConflict || hasPatternConflict { return 60 }
                if reversalLikeRegime || conflictingEvidence || hasDivergence { return 68 }
                return 85
            }()
            if bullish > bearish {
                bullish = min(bullish, dominantCap)
                bearish = max(0, 100 - neutral - bullish)
            } else if bearish > bullish {
                bearish = min(bearish, dominantCap)
                bullish = max(0, 100 - neutral - bearish)
            }

            // Enforce minimum floors — 0% for any bucket implies absolute certainty
            // which is never warranted. Redistribute from the dominant side.
            let minDirectional = 5
            if bullish < minDirectional {
                let deficit = minDirectional - bullish
                bullish = minDirectional
                if bearish > bullish { bearish -= deficit } else { neutral -= deficit }
                neutral = max(0, 100 - bullish - bearish)
            }
            if bearish < minDirectional {
                let deficit = minDirectional - bearish
                bearish = minDirectional
                if bullish > bearish { bullish -= deficit } else { neutral -= deficit }
                neutral = max(0, 100 - bullish - bearish)
            }
            // Also enforce a small neutral floor — there's always some chance of sideways.
            if neutral < minDirectional {
                let deficit = minDirectional - neutral
                neutral = minDirectional
                // Take from the dominant direction
                if bullish >= bearish { bullish -= deficit } else { bearish -= deficit }
                bullish = max(minDirectional, bullish)
                bearish = max(minDirectional, bearish)
                neutral = 100 - bullish - bearish
            }

            return ChartAnalysisPayload.Bias(bullish: bullish, bearish: bearish, neutral: neutral)
        }()

        return (confluence, indicators, bias, riskNotes)
    }

        private static func detectDeterministicPatterns(candles: [Candle], swingPoints: [SwingPoint]) -> [String] {
            guard candles.count >= 4 else { return [] }
            var patterns: [String] = []

        let last = candles[candles.count - 1]
        let prev = candles[candles.count - 2]
        let prev2 = candles.count >= 3 ? candles[candles.count - 3] : prev

        func body(_ c: Candle) -> Double { abs(c.close - c.open) }
        func range(_ c: Candle) -> Double { max(c.high - c.low, 0.0000001) }
        func upperWick(_ c: Candle) -> Double { c.high - max(c.open, c.close) }
        func lowerWick(_ c: Candle) -> Double { min(c.open, c.close) - c.low }
        func isBull(_ c: Candle) -> Bool { c.close > c.open }
        func isBear(_ c: Candle) -> Bool { c.close < c.open }
        func bodyMid(_ c: Candle) -> Double { (c.open + c.close) / 2.0 }

        let recent = Array(candles.suffix(20))
        let avgRange = max(recent.map(range).reduce(0, +) / Double(max(recent.count, 1)), 0.0000001)
        let avgBody = max(recent.map(body).reduce(0, +) / Double(max(recent.count, 1)), 0.0000001)
        let lastClose = max(last.close, 0.0000001)
        let levelTolerance = max(0.0035, min(0.012, (avgRange / lastClose) * 0.75))
        let prominenceReq = max(0.006, min(0.025, (avgRange / lastClose) * 1.1))

        if isBear(prev) && isBull(last) && last.open <= prev.close && last.close >= prev.open && body(last) >= avgBody * 0.8 {
            patterns.append("Bullish engulfing")
        }
        if isBull(prev) && isBear(last) && last.open >= prev.close && last.close <= prev.open && body(last) >= avgBody * 0.8 {
            patterns.append("Bearish engulfing")
        }

        let dojiBodyRatio = body(last) / range(last)
        if dojiBodyRatio <= 0.12 {
            patterns.append("Doji candle")
        }

        if candles.count >= 3 {
            let morningStar =
                isBear(prev2) &&
                body(prev2) >= avgBody * 0.8 &&
                body(prev) <= avgBody * 0.55 &&
                isBull(last) &&
                last.close >= bodyMid(prev2)
            if morningStar { patterns.append("Morning star") }

            let eveningStar =
                isBull(prev2) &&
                body(prev2) >= avgBody * 0.8 &&
                body(prev) <= avgBody * 0.55 &&
                isBear(last) &&
                last.close <= bodyMid(prev2)
            if eveningStar { patterns.append("Evening star") }
        }

        let lastBody = max(body(last), 0.0000001)
        let lastUpper = upperWick(last)
        let lastLower = lowerWick(last)
        if lastLower >= lastBody * 2.0 && lastUpper <= lastBody * 0.8 {
            patterns.append("Hammer-like rejection candle")
        }
            if lastUpper >= lastBody * 2.0 && lastLower <= lastBody * 0.8 {
                patterns.append("Shooting-star-like rejection candle")
            }

            func clampedCandleSlice(from startIndex: Int, to endIndex: Int) -> ArraySlice<Candle>? {
                guard candles.isEmpty == false else { return nil }
                let lo = max(0, min(startIndex, endIndex))
                let hi = min(candles.count - 1, max(startIndex, endIndex))
                guard lo <= hi else { return nil }
                return candles[lo...hi]
            }

            let highs = Array(swingPoints.filter { $0.kind == .high }.suffix(8))
            if highs.count >= 2 {
                let a = highs[highs.count - 2]
                let b = highs[highs.count - 1]
                let avg = max((a.price + b.price) / 2.0, 0.000001)
                let similarity = abs(a.price - b.price) / avg
                if similarity <= levelTolerance {
                    let start = min(a.index, b.index)
                    let end = max(a.index, b.index)
                    let midLow = clampedCandleSlice(from: start, to: end)?.map(\.low).min() ?? avg
                    if (avg - midLow) / avg >= prominenceReq && last.close < midLow * (1.0 - levelTolerance * 0.5) {
                        patterns.append("Double top")
                    }
                }
            }

            let lows = Array(swingPoints.filter { $0.kind == .low }.suffix(8))
            if lows.count >= 2 {
                let a = lows[lows.count - 2]
                let b = lows[lows.count - 1]
                let avg = max((a.price + b.price) / 2.0, 0.000001)
                let similarity = abs(a.price - b.price) / avg
                if similarity <= levelTolerance {
                    let start = min(a.index, b.index)
                    let end = max(a.index, b.index)
                    let midHigh = clampedCandleSlice(from: start, to: end)?.map(\.high).max() ?? avg
                    if (midHigh - avg) / avg >= prominenceReq && last.close > midHigh * (1.0 + levelTolerance * 0.5) {
                        patterns.append("Double bottom")
                    }
                }
            }

            if highs.count >= 3 {
                let recentHighs = Array(highs.suffix(3))
                let a = recentHighs[0]
                let b = recentHighs[1]
                let c = recentHighs[2]
                let shoulderSimilarity = abs(a.price - c.price) / max((a.price + c.price) / 2.0, 0.000001)
                let headProminence = (b.price - max(a.price, c.price)) / max(b.price, 0.000001)
                let start = min(a.index, c.index)
                let end = max(a.index, c.index)
                let neckline = clampedCandleSlice(from: start, to: end)?.map(\.low).min() ?? min(a.price, c.price)
                if b.price > a.price, b.price > c.price, shoulderSimilarity <= max(levelTolerance * 1.8, 0.006), headProminence >= prominenceReq, last.close < neckline * (1.0 - levelTolerance * 0.4) {
                    patterns.append("Head and shoulders")
                }
            }

            if lows.count >= 3 {
                let recentLows = Array(lows.suffix(3))
                let a = recentLows[0]
                let b = recentLows[1]
                let c = recentLows[2]
                let shoulderSimilarity = abs(a.price - c.price) / max((a.price + c.price) / 2.0, 0.000001)
                let headProminence = (min(a.price, c.price) - b.price) / max(min(a.price, c.price), 0.000001)
                let start = min(a.index, c.index)
                let end = max(a.index, c.index)
                let neckline = clampedCandleSlice(from: start, to: end)?.map(\.high).max() ?? max(a.price, c.price)
                if b.price < a.price, b.price < c.price, shoulderSimilarity <= max(levelTolerance * 1.8, 0.006), headProminence >= prominenceReq, last.close > neckline * (1.0 + levelTolerance * 0.4) {
                    patterns.append("Inverse head and shoulders")
                }
            }

        if highs.count >= 3, lows.count >= 3 {
            let recentHighs = Array(highs.suffix(3))
            let recentLows = Array(lows.suffix(3))
            let high0 = recentHighs[0].price
            let high2 = recentHighs[2].price
            let low0 = recentLows[0].price
            let low2 = recentLows[2].price

            let highsFlat = abs(high0 - high2) / max((high0 + high2) / 2.0, 0.000001) <= levelTolerance
            let lowsFlat = abs(low0 - low2) / max((low0 + low2) / 2.0, 0.000001) <= levelTolerance
            let lowsRising = low2 > low0
            let highsFalling = high2 < high0

            if highsFlat && lowsRising && last.close < max(high0, high2) * (1.0 - levelTolerance * 0.3) {
                patterns.append("Ascending triangle")
            }
            if lowsFlat && highsFalling && last.close > min(low0, low2) * (1.0 + levelTolerance * 0.3) {
                patterns.append("Descending triangle")
            }
        }

        return Array(NSOrderedSet(array: patterns).array.compactMap { $0 as? String })
    }

    private static func compactLevelSet(
        _ levels: [ChartAnalysisPayload.KeyLevel],
        currentPrice: Double,
        maxCount: Int
    ) -> [ChartAnalysisPayload.KeyLevel] {
        let maxDistancePct = 0.45
        let parsed = levels.compactMap { level -> (value: Double, level: ChartAnalysisPayload.KeyLevel)? in
            guard let v = Double(level.price), v.isFinite, v > 0 else { return nil }
            if currentPrice > 0, abs(v - currentPrice) / currentPrice > maxDistancePct {
                return nil
            }
            return (v, level)
        }.sorted { $0.value < $1.value }
        guard parsed.isEmpty == false else { return [] }

        let proximityTolerance = max(currentPrice * 0.0012, roundingStep(for: currentPrice) * 1.5)

        var clusters: [[(value: Double, level: ChartAnalysisPayload.KeyLevel)]] = []
        var currentCluster: [(value: Double, level: ChartAnalysisPayload.KeyLevel)] = [parsed[0]]
        for item in parsed.dropFirst() {
            let lastValue = currentCluster.last?.value ?? item.value
            if abs(item.value - lastValue) <= proximityTolerance {
                currentCluster.append(item)
            } else {
                clusters.append(currentCluster)
                currentCluster = [item]
            }
        }
        clusters.append(currentCluster)

        func notePriority(_ note: String?) -> Int {
            let lower = (note ?? "").lowercased()
            if lower.contains("swing") || lower.contains("recent") { return 5 }
            if lower.contains("pivot") { return 4 }
            if lower.contains("fib retracement") { return 3 }
            if lower.contains("fib extension") { return 2 }
            return 1
        }

        let collapsed: [ChartAnalysisPayload.KeyLevel] = clusters.compactMap { cluster in
            let representative = cluster.max { lhs, rhs in
                let lScore = notePriority(lhs.level.note) * 10 - Int(abs(lhs.value - currentPrice))
                let rScore = notePriority(rhs.level.note) * 10 - Int(abs(rhs.value - currentPrice))
                return lScore < rScore
            }?.level

            guard var rep = representative else { return nil }
            if cluster.count > 1 {
                let rawNotes = cluster.compactMap { $0.level.note?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                let fragments = rawNotes.flatMap { note in
                    note
                        .split(separator: "•")
                        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                }

                func normalizeFragment(_ fragment: String, kind: String) -> String {
                    let lower = fragment.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    if kind == "resistance" {
                        if lower == "swing low cluster" { return "prior swing low (overhead)" }
                        if lower.hasPrefix("recent"), lower.contains("-bar low"), lower.contains("overhead") == false {
                            return fragment + " (overhead)"
                        }
                    } else if kind == "support" {
                        if lower == "swing high cluster" { return "prior swing high (below)" }
                        if lower.hasPrefix("recent"), lower.contains("-bar high"), lower.contains("(below)") == false {
                            return fragment + " (below)"
                        }
                    }
                    return fragment
                }

                let normalizedFragments = fragments.map { normalizeFragment($0, kind: rep.kind.lowercased()) }
                var seen: Set<String> = []
                let dedupedNotes = normalizedFragments.filter { note in
                    let key = note.lowercased()
                    if seen.contains(key) { return false }
                    seen.insert(key)
                    return true
                }
                let topNotes = dedupedNotes.filter { note in
                    let lower = note.lowercased()
                    return dedupedNotes.contains(where: { other in
                        other.count > note.count && other.lowercased().contains(lower)
                    }) == false
                }
                if topNotes.isEmpty == false {
                    rep.note = topNotes.prefix(3).joined(separator: " • ")
                }
            }
            return rep
        }

        if collapsed.count <= maxCount { return collapsed.sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) } }

        let sorted = collapsed.sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) }
        let below = sorted.filter { (Double($0.price) ?? 0) <= currentPrice }
        let above = sorted.filter { (Double($0.price) ?? 0) >= currentPrice }
        let pickBelow = Array(below.suffix(maxCount / 2))
        let pickAbove = Array(above.prefix(maxCount - pickBelow.count))
        return (pickBelow + pickAbove).sorted { (Double($0.price) ?? 0) < (Double($1.price) ?? 0) }
    }

    private static func formatCompact(_ value: Double) -> String {
        if value >= 1000 { return String(format: "%.0f", value) }
        if value >= 10 { return String(format: "%.2f", value) }
        if value >= 1 { return String(format: "%.4f", value) }
        if value >= 0.1 { return String(format: "%.5f", value) }
        if value >= 0.01 { return String(format: "%.6f", value) }
        return String(format: "%.8f", value)
    }

    private static func buildSummary(
        symbol: String,
        timeframe: String,
        lastClose: Double,
        changePct: Double?,
        regime: String,
        structure: String,
        levels: [ChartAnalysisPayload.KeyLevel]
    ) -> String {
        let last = formatCompact(lastClose)
        let change: String
        if let changePct {
            change = String(format: "%+.2f%%", changePct)
        } else {
            change = "n/a"
        }

        let nearestBelow = levels
            .compactMap { level -> (Double, String, String?)? in
                guard let v = Double(level.price) else { return nil }
                return (v, level.price, level.note)
            }
            .filter { $0.0 < lastClose }
            .sorted { $0.0 > $1.0 }
            .first

        let nearestAbove = levels
            .compactMap { level -> (Double, String, String?)? in
                guard let v = Double(level.price) else { return nil }
                return (v, level.price, level.note)
            }
            .filter { $0.0 > lastClose }
            .sorted { $0.0 < $1.0 }
            .first

        var parts: [String] = []
        parts.append("\(symbol) \(timeframe) last close \(last) (\(change)).")
        parts.append("\(regime). \(structure).")

        if let nearestBelow, let nearestAbove {
            parts.append("Nearest levels: \(nearestBelow.1) below, \(nearestAbove.1) above.")
        } else if let nearestBelow {
            parts.append("Nearest support: \(nearestBelow.1).")
        } else if let nearestAbove {
            parts.append("Nearest resistance: \(nearestAbove.1).")
        }

        return parts.joined(separator: " ")
    }

#if DEBUG
    /// Test-only helper to exercise setup generation with controlled inputs.
    /// Not used by the app at runtime.
    static func _tradeSetupsForTesting(
        symbol: String,
        timeframe: String,
        lastClose: Double,
        atr14: Double,
        levels: [ChartAnalysisPayload.KeyLevel],
        regimeLabel: String = "Range / consolidation",
        structure: String = "Mixed structure (range / transition)",
        confluence: [String] = [],
        ema20: Double? = nil,
        ema50: Double? = nil,
        ema200: Double? = nil,
        avwapVwap: Double? = nil,
        bollingerMiddle: Double? = nil,
        rsi14: Double? = nil,
        stochK: Double? = nil,
        stochD: Double? = nil,
        macdHist: Double? = nil,
        adx: Double? = nil,
        plusDI: Double? = nil,
        minusDI: Double? = nil,
        useEMAFilter: Bool = false,
        useRSIFilter: Bool = false,
        useMACDFilter: Bool = false,
        useADXFilter: Bool = false,
        useVolumeFilter: Bool = false,
        volumeState: String = "Normal",
        volumeLastToAvg20: Double? = 1.0,
        volatilityPct: Double? = nil
    ) -> [ChartAnalysisPayload.TradeSetup] {
        let adxPack = ADXPack(adx: adx, plusDI: plusDI, minusDI: minusDI)
        return generateTradeSetups(
            symbol: symbol,
            timeframe: timeframe,
            lastCandle: nil,
            lastClose: lastClose,
            atr14: atr14,
            volatilityPct: volatilityPct,
            volumeState: volumeState,
            volumeLastToAvg20: volumeLastToAvg20,
            levels: levels,
            regimeLabel: regimeLabel,
            structure: structure,
            confluence: confluence,
            ema20: ema20,
            ema50: ema50,
            ema200: ema200,
            avwapVwap: avwapVwap,
            bollingerMiddle: bollingerMiddle,
            rsi14: rsi14,
            stochK: stochK,
            stochD: stochD,
            macdHist: macdHist,
            adx: adxPack,
            useEMAFilter: useEMAFilter,
            useRSIFilter: useRSIFilter,
            useMACDFilter: useMACDFilter,
            useADXFilter: useADXFilter,
            useVolumeFilter: useVolumeFilter
        )
    }
#endif
}

// MARK: - Live chart series

/// A horizontal level the chart can draw and label.
nonisolated struct LiveChartLevel: Hashable, Sendable, Identifiable {
    let id: String
    let name: String
    let price: Double
}

/// Every indicator the live chart can draw, computed once per engine tick and
/// aligned one-value-per-candle so the renderer can index straight into it.
///
/// `nil` means "not enough history yet at this bar" — the renderer breaks the line
/// there rather than drawing through a fabricated value.
nonisolated struct LiveChartSeries: Hashable, Sendable {
    var ema20: [Double?] = []
    var ema50: [Double?] = []
    var ema200: [Double?] = []
    var bollingerUpper: [Double?] = []
    var bollingerMiddle: [Double?] = []
    var bollingerLower: [Double?] = []
    var rsi: [Double?] = []
    var macd: [Double?] = []
    var macdSignal: [Double?] = []
    var macdHistogram: [Double?] = []
    var stochasticK: [Double?] = []
    var stochasticD: [Double?] = []
    var adx: [Double?] = []
    var plusDI: [Double?] = []
    var minusDI: [Double?] = []
    var fibLevels: [LiveChartLevel] = []
    var keyLevels: [LiveChartLevel] = []

    static let empty = LiveChartSeries()
}

// MARK: - Live chart signals

/// A BUY/SELL marker anchored to the exact candle where the trigger fired,
/// so the live chart can draw it in place instead of listing it.
nonisolated struct LiveChartSignal: Hashable, Sendable, Identifiable {
    enum Direction: String, Hashable, Sendable {
        case buy
        case sell
    }

    /// Stable across ticks: same bar + same trigger == same marker.
    let id: String
    let direction: Direction
    /// Short headline drawn next to the marker, e.g. "Structure break".
    let label: String
    /// Supporting line, e.g. "Broke 20-bar high".
    let detail: String
    let candleTime: Date
    /// Price the marker points at (the bar's low for buys, high for sells).
    let price: Double
    /// How many independent pieces of evidence agreed on this bar.
    let confirmations: Int
    /// 0…99. Only high-confidence bars are ever emitted, so this is a comparison
    /// between calls rather than a pass/fail gate.
    let confidence: Int
}

// MARK: - Live scan readouts

/// A single indicator line rendered by the live fullscreen scanner.
/// Values are numeric-derived (never parsed back out of display strings) so the UI
/// can animate gauges and diff two consecutive ticks reliably.
nonisolated struct LiveIndicatorReadout: Hashable, Sendable, Identifiable {
    enum Zone: String, Hashable, Sendable, Codable {
        case bullish
        case bearish
        case caution
        case neutral
    }

    /// Stable identity across ticks — used for diffing and animation.
    let key: String
    let group: String
    let title: String
    /// Primary numeric value, already formatted (e.g. "62.4", "1.84×").
    let value: String
    /// One-line plain-language state (e.g. "Oversold — buying zone").
    let state: String
    let zone: Zone
    /// 0…1 gauge fill, or nil when the row has no meaningful scale.
    let progress: Double?
    /// Directional contribution, -1 (bearish) … +1 (bullish). 0 = no vote.
    let score: Double

    var id: String { key }
}

nonisolated struct LiveScanReading: Hashable, Sendable {
    let price: Double
    let readouts: [LiveIndicatorReadout]
    /// 0…100 composite of every voting readout.
    let bullPercent: Int
    let verdict: String
    let verdictZone: LiveIndicatorReadout.Zone
    /// Live candlestick / chart patterns detected on the latest bars.
    let patterns: [String]
}

extension MarketAnalysisEngine {

    /// Recomputes every indicator the scanner uses, as numbers, for one live tick.
    /// Pure and cheap enough to run on a loop; no network, no AI.
    ///
    /// `nonisolated` is load-bearing: the target builds with approachable concurrency,
    /// so an unannotated member would be MainActor-isolated and this would run on the
    /// main thread — freezing the UI on every tick.
    nonisolated static func liveReading(
        candles: [Candle],
        timeframe: String,
        selection: IndicatorSelection = .allEnabled,
        livePrice: Double? = nil
    ) -> LiveScanReading {
        let price = livePrice ?? candles.last?.close ?? 0
        guard candles.count >= 20, price > 0 else {
            return LiveScanReading(
                price: price,
                readouts: [],
                bullPercent: 50,
                verdict: "Waiting for data",
                verdictZone: .neutral,
                patterns: []
            )
        }

        let tfKind = timeframeKind(from: timeframe)
        let closes = candles.map(\.close)
        let highs = candles.map(\.high)
        let lows = candles.map(\.low)

        var rows: [LiveIndicatorReadout] = []

        // MARK: Trend — EMA stack
        if selection.emaTrend {
            let ema20 = ema(values: closes, period: 20).last
            let ema50 = ema(values: closes, period: 50).last
            let ema200 = ema(values: closes, period: 200).last
            if let ema20, let ema50 {
                // Exactly equal values carry no information. Scoring them with `>=`
                // made a market that had not moved report a full bull stack.
                func vote(_ lhs: Double, _ rhs: Double) -> Int {
                    if lhs > rhs { return 1 }
                    if lhs < rhs { return -1 }
                    return 0
                }
                var votes = vote(price, ema20) + vote(ema20, ema50)
                let anchorVote = ema200.map { vote(price, $0) }
                if let anchorVote { votes += anchorVote }
                let denom = Double(anchorVote == nil ? 2 : 3)
                let score = Double(votes) / denom
                let state: String
                if score >= 0.99 { state = "Full bull stack — trend up" }
                else if score <= -0.99 { state = "Full bear stack — trend down" }
                else if score > 0 { state = "Leaning bullish — mixed stack" }
                else if score < 0 { state = "Leaning bearish — mixed stack" }
                else { state = "Flat — no trend edge" }
                let distancePct = (price - ema20) / ema20 * 100.0
                rows.append(LiveIndicatorReadout(
                    key: "ema",
                    group: "Trend",
                    title: "EMA stack",
                    value: String(format: "%+.2f%% vs EMA20", distancePct),
                    state: state,
                    zone: zone(for: score),
                    progress: (score + 1) / 2,
                    score: score
                ))
            }
        }

        // MARK: Momentum — RSI
        if selection.rsi, let rsiValue = rsi(closes: closes, period: 14).last {
            let previous = rsi(closes: Array(closes.dropLast()), period: 14).last
            let rising = previous.map { rsiValue > $0 }
            let state: String
            let zoneValue: LiveIndicatorReadout.Zone
            let score: Double
            switch rsiValue {
            case ..<30:
                state = "Oversold — buying zone"
                zoneValue = .bullish
                score = 0.9
            case 30..<45:
                state = rising == true ? "Recovering from weak" : "Weak momentum"
                zoneValue = rising == true ? .bullish : .bearish
                score = rising == true ? 0.35 : -0.35
            case 45...55:
                state = "Neutral — no momentum edge"
                zoneValue = .neutral
                score = 0
            case 55..<70:
                state = rising == false ? "Strong but fading" : "Strong momentum"
                zoneValue = rising == false ? .caution : .bullish
                score = rising == false ? 0.2 : 0.55
            default:
                state = "Overbought — selling zone"
                zoneValue = .bearish
                score = -0.9
            }
            rows.append(LiveIndicatorReadout(
                key: "rsi",
                group: "Momentum",
                title: "RSI (14)",
                value: String(format: "%.1f", rsiValue),
                state: state,
                zone: zoneValue,
                progress: min(1, max(0, rsiValue / 100.0)),
                score: score
            ))
        }

        // MARK: Momentum — MACD
        if selection.macd {
            let pack = macd(closes: closes)
            if let hist = pack.histogram.last, let macdLine = pack.macd.last, let signalLine = pack.signal.last {
                let prevHist = pack.histogram.dropLast().last
                let expanding = prevHist.map { abs(hist) > abs($0) }
                let crossedUp = macdLine >= signalLine
                // Line sitting exactly on its signal is not a cross in either
                // direction; on a flat tape this printed "bullish cross" at 0.0000.
                let isFlat = macdLine == signalLine
                let state: String
                if isFlat { state = "Flat — no momentum edge" }
                else if crossedUp && expanding == true { state = "Bullish cross — expanding" }
                else if crossedUp { state = "Bullish cross — losing steam" }
                else if expanding == true { state = "Bearish cross — expanding" }
                else { state = "Bearish cross — losing steam" }
                let score = isFlat ? 0 : (crossedUp ? 0.6 : -0.6) * (expanding == true ? 1.0 : 0.6)
                rows.append(LiveIndicatorReadout(
                    key: "macd",
                    group: "Momentum",
                    title: "MACD (12,26,9)",
                    value: String(format: "%+.4f", hist),
                    state: state,
                    zone: zone(for: score),
                    progress: nil,
                    score: score
                ))
            }
        }

        // MARK: Momentum — Stochastic
        let stoch = stochasticOscillator(candles: candles, period: 14, smoothing: 3)
        if let k = stoch.k {
            let state: String
            let score: Double
            if k < 20 { state = "Oversold — reversal watch"; score = 0.7 }
            else if k > 80 { state = "Overbought — reversal watch"; score = -0.7 }
            else if let d = stoch.d, k > d { state = "Turning up"; score = 0.3 }
            else if let d = stoch.d, k < d { state = "Turning down"; score = -0.3 }
            else { state = "Mid range"; score = 0 }
            rows.append(LiveIndicatorReadout(
                key: "stoch",
                group: "Momentum",
                title: "Stochastic (14,3)",
                value: String(format: "%.0f", k),
                state: state,
                zone: zone(for: score),
                progress: min(1, max(0, k / 100.0)),
                score: score
            ))
        }

        // MARK: Trend strength — ADX
        if selection.adx {
            let pack = adx(candles: candles, period: 14)
            if let adxValue = pack.adx {
                let directional: Double = {
                    guard let plus = pack.plusDI, let minus = pack.minusDI else { return 0 }
                    return plus >= minus ? 1 : -1
                }()
                let strength = min(1, adxValue / 40.0)
                let state: String
                if adxValue < 20 { state = "No trend — chop risk" }
                else if adxValue < 25 { state = directional > 0 ? "Trend building up" : "Trend building down" }
                else { state = directional > 0 ? "Strong uptrend" : "Strong downtrend" }
                let score = adxValue < 20 ? 0 : directional * strength
                rows.append(LiveIndicatorReadout(
                    key: "adx",
                    group: "Trend",
                    title: "ADX (14)",
                    value: String(format: "%.0f", adxValue),
                    state: state,
                    zone: adxValue < 20 ? .caution : zone(for: score),
                    progress: min(1, max(0, adxValue / 60.0)),
                    score: score
                ))
            }
        }

        // MARK: Volatility — Bollinger %B
        if selection.bollingerBands {
            let pack = bollingerBands(closes: closes, period: 20, stdevMultiplier: 2.0)
            if let upper = pack.upper, let lower = pack.lower, upper > lower {
                let percentB = (price - lower) / (upper - lower)
                let widthPct = pack.widthPct
                let squeezed = widthPct.map { $0 < 2.0 } ?? false
                let state: String
                let score: Double
                if squeezed { state = "Squeeze — breakout pending"; score = 0 }
                else if percentB >= 1 { state = "Above upper band — stretched"; score = -0.5 }
                else if percentB <= 0 { state = "Below lower band — stretched"; score = 0.5 }
                else if percentB > 0.5 { state = "Upper half — buyers in control"; score = 0.3 }
                else { state = "Lower half — sellers in control"; score = -0.3 }
                rows.append(LiveIndicatorReadout(
                    key: "bollinger",
                    group: "Volatility",
                    title: "Bollinger %B",
                    value: String(format: "%.0f%%", percentB * 100),
                    state: state,
                    zone: squeezed ? .caution : zone(for: score),
                    progress: min(1, max(0, percentB)),
                    score: score
                ))
            }
        }

        // MARK: Volatility — ATR
        if let atrValue = atr(candles: candles, period: 14).last, atrValue > 0 {
            let atrPct = atrValue / price * 100.0
            let history = atrPctSeries(candles: candles, period: 14)
            let regime = volatilityRegimeLabel(currentATRpct: atrPct, history: history)
            rows.append(LiveIndicatorReadout(
                key: "atr",
                group: "Volatility",
                title: "ATR (14)",
                value: String(format: "%.2f%%", atrPct),
                state: regime.map { "\($0.label) volatility" } ?? "Range per bar: \(formatCompact(atrValue))",
                zone: .neutral,
                progress: min(1, max(0, atrPct / 6.0)),
                score: 0
            ))
        }

        // MARK: Volume
        if selection.volume, candles.count >= 25 {
            let recent = candles.suffix(20).map(\.volume)
            let average = recent.reduce(0, +) / Double(recent.count)
            if average > 0, let last = candles.last {
                let ratio = last.volume / average
                let bullishBar = last.close >= last.open
                let state: String
                let score: Double
                if ratio >= 1.8 {
                    state = bullishBar ? "Volume spike into strength" : "Volume spike into weakness"
                    score = bullishBar ? 0.8 : -0.8
                } else if ratio >= 1.2 {
                    state = bullishBar ? "Above-average buying" : "Above-average selling"
                    score = bullishBar ? 0.4 : -0.4
                } else if ratio <= 0.6 {
                    state = "Thin volume — low conviction"
                    score = 0
                } else {
                    state = "Normal participation"
                    score = 0
                }
                rows.append(LiveIndicatorReadout(
                    key: "volume",
                    group: "Flow",
                    title: "Volume vs 20-bar avg",
                    value: String(format: "%.2f×", ratio),
                    state: state,
                    zone: ratio <= 0.6 ? .caution : zone(for: score),
                    progress: min(1, max(0, ratio / 3.0)),
                    score: score
                ))
            }
        }

        // MARK: Flow — OBV
        let obvPack = obv(candles: candles, lookback: 20)
        if let delta = obvPack.delta {
            let state: String
            let score: Double
            if delta > 0 { state = "Accumulation over 20 bars"; score = 0.35 }
            else if delta < 0 { state = "Distribution over 20 bars"; score = -0.35 }
            else { state = "Flat flow"; score = 0 }
            rows.append(LiveIndicatorReadout(
                key: "obv",
                group: "Flow",
                title: "OBV (Δ20)",
                value: String(format: "%+.0f", delta),
                state: state,
                zone: zone(for: score),
                progress: nil,
                score: score
            ))
        }

        // MARK: Fibonacci
        if selection.fibonacci, let fib = liveFibonacci(candles: candles, price: price, timeframeKind: tfKind) {
            let state: String
            let score: Double
            if abs(fib.distancePct) <= 0.35 {
                state = fib.retracingUp ? "Testing \(fib.name) support" : "Testing \(fib.name) resistance"
                score = fib.retracingUp ? 0.7 : -0.7
            } else if fib.distancePct > 0 {
                state = "\(String(format: "%.2f%%", abs(fib.distancePct))) above \(fib.name)"
                score = 0.2
            } else {
                state = "\(String(format: "%.2f%%", abs(fib.distancePct))) below \(fib.name)"
                score = -0.2
            }
            rows.append(LiveIndicatorReadout(
                key: "fib",
                group: "Levels",
                title: "Fib \(fib.name)",
                value: formatCompact(fib.level),
                state: state,
                zone: abs(fib.distancePct) <= 0.35 ? .caution : zone(for: score),
                progress: min(1, max(0, 1 - min(1, abs(fib.distancePct) / 3.0))),
                score: score
            ))
        }

        // MARK: Structure
        let structure = inferMarketStructure(highs: highs, lows: lows, timeframeKind: tfKind)
        let structureLower = structure.lowercased()
        let structureScore: Double = {
            if structureLower.contains("higher") { return 0.7 }
            if structureLower.contains("lower") { return -0.7 }
            return 0
        }()
        rows.append(LiveIndicatorReadout(
            key: "structure",
            group: "Structure",
            title: "Market structure",
            value: structureScore > 0 ? "Bullish" : (structureScore < 0 ? "Bearish" : "Range"),
            state: structure,
            zone: structureScore == 0 ? .caution : zone(for: structureScore),
            progress: nil,
            score: structureScore
        ))

        // MARK: Patterns
        let swings = swingPoints(candles: candles, timeframeKind: tfKind)
        let patterns = detectDeterministicPatterns(candles: candles, swingPoints: swings)
        if let headline = patterns.first {
            let lower = patterns.joined(separator: " ").lowercased()
            var patternScore: Double = 0
            if lower.contains("bullish") || lower.contains("morning") || lower.contains("hammer")
                || lower.contains("double bottom") || lower.contains("inverse head") || lower.contains("ascending") {
                patternScore = 0.6
            }
            if lower.contains("bearish") || lower.contains("evening") || lower.contains("shooting")
                || lower.contains("double top") || lower.contains("descending") {
                patternScore -= 0.6
            }
            rows.append(LiveIndicatorReadout(
                key: "pattern",
                group: "Structure",
                title: "Pattern",
                value: headline,
                state: patterns.count > 1 ? patterns.dropFirst().joined(separator: " • ") : "Detected on the latest bars",
                zone: patternScore == 0 ? .neutral : zone(for: patternScore),
                progress: nil,
                score: patternScore
            ))
        }

        // MARK: Composite verdict
        let voting = rows.filter { $0.score != 0 }
        let average = voting.isEmpty ? 0 : voting.map(\.score).reduce(0, +) / Double(voting.count)
        let bullPercent = Int(((average + 1) / 2 * 100).rounded())
        let verdict: String
        let verdictZone: LiveIndicatorReadout.Zone
        switch bullPercent {
        case ..<25: verdict = "Strong sell pressure"; verdictZone = .bearish
        case 25..<42: verdict = "Sell lean"; verdictZone = .bearish
        case 42...58: verdict = "No edge — stand aside"; verdictZone = .neutral
        case 59...75: verdict = "Buy lean"; verdictZone = .bullish
        default: verdict = "Strong buy pressure"; verdictZone = .bullish
        }

        return LiveScanReading(
            price: price,
            readouts: rows,
            bullPercent: bullPercent,
            verdict: verdict,
            verdictZone: verdictZone,
            patterns: patterns
        )
    }

    /// Walks the recent bars and emits a BUY/SELL marker only where several
    /// independent things line up at once.
    ///
    /// A single trigger is never enough. Each bar accumulates a weighted confluence
    /// score for each side, chop and nothing-bars are penalised, and only bars that
    /// clear a high bar get drawn. On a flat, low-ADX range this correctly returns
    /// nothing at all — an empty chart is the honest answer there.
    ///
    /// Deterministic and stateless: the same candles always produce the same markers,
    /// so re-running it every tick never makes a marker jump or flicker.
    nonisolated static func liveSignals(
        candles: [Candle],
        timeframe: String,
        window: Int = 70,
        /// Only bars this recent may produce a marker. The chart is a live scanner,
        /// not a backtest report — a call from twenty bars ago is history, and
        /// showing it makes a fresh signal impossible to spot.
        recentBars: Int = 4,
        now: Date = Date()
    ) -> [LiveChartSignal] {
        // Never evaluate the bar that is still forming. Its high/low/close are
        // provisional, so a pattern found mid-bar can vanish when it closes — which
        // reads as a signal firing and price immediately going the other way.
        let candles = closedCandles(candles, timeframe: timeframe, now: now)
        guard candles.count >= 80 else { return [] }

        let count = candles.count
        let closes = candles.map(\.close)
        let highs = candles.map(\.high)
        let lows = candles.map(\.low)

        let ema20 = rightAligned(ema(values: closes, period: 20), count: count)
        let ema50 = rightAligned(ema(values: closes, period: 50), count: count)
        let rsi14 = rightAligned(rsi(closes: closes, period: 14), count: count)
        let macdHist = rightAligned(macd(closes: closes).histogram, count: count)
        let atr14 = rightAligned(atr(candles: candles, period: 14), count: count)
        let adxSeries = rollingADX(candles: candles, period: 14)
        let bands = rollingBollinger(closes: closes, period: 20, stdevMultiplier: 2.0)
        let fibLevels = liveFibonacciLevels(candles: candles, timeframeKind: timeframeKind(from: timeframe))

        let scanStart = max(60, count - window)
        guard scanStart < count else { return [] }

        /// One weighted piece of evidence on one bar.
        struct Evidence {
            let weight: Double
            let label: String
            /// Only headline triggers may name the signal.
            let isHeadline: Bool
        }

        struct Candidate {
            let index: Int
            let signal: LiveChartSignal
            let score: Double
        }

        var candidates: [Candidate] = []

        for i in scanStart..<count {
            let candle = candles[i]
            let previous = candles[i - 1]
            let atrValue = atr14[i] ?? (candle.close * 0.004)
            guard atrValue > 0 else { continue }

            let barRange = candle.high - candle.low
            let body = abs(candle.close - candle.open)
            let bullishBar = candle.close >= candle.open
            let adxValue = adxSeries[i] ?? 0

            // Chop gate: a directionless, low-volatility bar cannot host a real
            // signal no matter how many oscillators happen to tick over on it.
            if adxValue < 15 && barRange < atrValue * 0.8 { continue }
            if barRange < atrValue * 0.35 { continue }

            var buy: [Evidence] = []
            var sell: [Evidence] = []

            // Structure break — the strongest single piece of evidence.
            let priorHighs = highs[(i - 20)..<i]
            let priorLows = lows[(i - 20)..<i]
            if let priorHigh = priorHighs.max(), candle.close > priorHigh + atrValue * 0.15 {
                buy.append(Evidence(weight: 3.0, label: "Structure break", isHeadline: true))
            }
            if let priorLow = priorLows.min(), candle.close < priorLow - atrValue * 0.15 {
                sell.append(Evidence(weight: 3.0, label: "Structure break", isHeadline: true))
            }

            // Fib reaction — the wick must tag the level and the body must reject it.
            for level in fibLevels where level.price > 0 {
                let tolerance = atrValue * 0.4
                if candle.low <= level.price + tolerance,
                   candle.close > level.price,
                   bullishBar,
                   body > barRange * 0.35 {
                    buy.append(Evidence(weight: 2.2, label: "Fib bounce", isHeadline: true))
                    break
                }
                if candle.high >= level.price - tolerance,
                   candle.close < level.price,
                   bullishBar == false,
                   body > barRange * 0.35 {
                    sell.append(Evidence(weight: 2.2, label: "Fib rejection", isHeadline: true))
                    break
                }
            }

            // Moving-average cross.
            if let fast = ema20[i], let slow = ema50[i], let prevFast = ema20[i - 1], let prevSlow = ema50[i - 1] {
                if prevFast <= prevSlow, fast > slow {
                    buy.append(Evidence(weight: 2.2, label: "EMA cross", isHeadline: true))
                } else if prevFast >= prevSlow, fast < slow {
                    sell.append(Evidence(weight: 2.2, label: "EMA cross", isHeadline: true))
                }
            }

            // Momentum leaving an extreme.
            if let value = rsi14[i], let prev = rsi14[i - 1] {
                if prev < 30, value >= 30 {
                    buy.append(Evidence(weight: 2.0, label: "RSI reversal", isHeadline: true))
                } else if prev > 70, value <= 70 {
                    sell.append(Evidence(weight: 2.0, label: "RSI reversal", isHeadline: true))
                }
            }

            if let hist = macdHist[i], let prevHist = macdHist[i - 1] {
                if prevHist <= 0, hist > 0 {
                    buy.append(Evidence(weight: 1.4, label: "MACD flip", isHeadline: false))
                } else if prevHist >= 0, hist < 0 {
                    sell.append(Evidence(weight: 1.4, label: "MACD flip", isHeadline: false))
                }
            }

            if let band = bands[i] {
                if candle.low <= band.lower, candle.close > band.lower, bullishBar {
                    buy.append(Evidence(weight: 1.5, label: "Band reclaim", isHeadline: false))
                } else if candle.high >= band.upper, candle.close < band.upper, bullishBar == false {
                    sell.append(Evidence(weight: 1.5, label: "Band rejection", isHeadline: false))
                }
            }

            // Candlestick confirmation.
            let prevBody = abs(previous.close - previous.open)
            let lowerWick = min(candle.open, candle.close) - candle.low
            let upperWick = candle.high - max(candle.open, candle.close)
            if bullishBar, previous.close < previous.open, candle.close >= previous.open, body > prevBody {
                buy.append(Evidence(weight: 1.6, label: "Bullish engulfing", isHeadline: false))
            } else if bullishBar == false, previous.close > previous.open, candle.close <= previous.open, body > prevBody {
                sell.append(Evidence(weight: 1.6, label: "Bearish engulfing", isHeadline: false))
            } else if lowerWick > body * 2, lowerWick > barRange * 0.55 {
                buy.append(Evidence(weight: 1.2, label: "Hammer", isHeadline: false))
            } else if upperWick > body * 2, upperWick > barRange * 0.55 {
                sell.append(Evidence(weight: 1.2, label: "Shooting star", isHeadline: false))
            }

            // Participation.
            if i >= 20 {
                let recent = candles[(i - 20)..<i].map(\.volume)
                let average = recent.reduce(0, +) / Double(recent.count)
                if average > 0, candle.volume >= average * 1.5 {
                    let evidence = Evidence(weight: 1.4, label: "Volume surge", isHeadline: false)
                    if bullishBar { buy.append(evidence) } else { sell.append(evidence) }
                }
            }

            // Trend context — with the higher-timeframe drift, not against it.
            if let slow = ema50[i], let prevSlow = ema50[i - 5 < 0 ? 0 : i - 5] {
                let risingTrend = slow > prevSlow
                if candle.close > slow, risingTrend {
                    buy.append(Evidence(weight: 1.5, label: "Trend aligned", isHeadline: false))
                } else if candle.close < slow, risingTrend == false {
                    sell.append(Evidence(weight: 1.5, label: "Trend aligned", isHeadline: false))
                }
            }

            if adxValue >= 22 {
                let evidence = Evidence(weight: 1.0, label: "Trending market", isHeadline: false)
                buy.append(evidence)
                sell.append(evidence)
            }

            for direction in [LiveChartSignal.Direction.buy, .sell] {
                let evidence = direction == .buy ? buy : sell
                let opposing = direction == .buy ? sell : buy

                // A headline trigger is mandatory: confirmations alone never make a call.
                guard let headline = evidence.filter(\.isHeadline).max(by: { $0.weight < $1.weight }) else { continue }
                // At least three distinct pieces of evidence must agree.
                guard evidence.count >= 3 else { continue }

                var score = evidence.reduce(0) { $0 + $1.weight }
                // A bar arguing with itself is not high confidence.
                score -= opposing.filter(\.isHeadline).reduce(0) { $0 + $1.weight }
                if adxValue < 18 { score -= 1.5 }

                guard score >= 5.2 else { continue }

                let supporting = evidence
                    .filter { $0.label != headline.label }
                    .sorted { $0.weight > $1.weight }
                    .prefix(2)
                    .map(\.label)

                candidates.append(Candidate(
                    index: i,
                    signal: LiveChartSignal(
                        id: "\(Int(candle.openTime.timeIntervalSince1970))-\(direction.rawValue)",
                        direction: direction,
                        label: headline.label,
                        detail: supporting.isEmpty
                            ? "High-confidence \(direction == .buy ? "long" : "short") trigger"
                            : supporting.joined(separator: " + "),
                        candleTime: candle.openTime,
                        price: direction == .buy ? candle.low : candle.high,
                        confirmations: evidence.count,
                        // Only signals that already cleared the bar get here, so the
                        // scale starts at 60 — a raw score/max ratio would print an
                        // emitted call as "43%", which reads as low conviction.
                        confidence: Int(min(99, max(60, 60 + (score - 5.2) / 7.8 * 39)))
                    ),
                    score: score
                ))
            }
        }

        // Readability pass: strongest call first, then only accept weaker ones that
        // clear every marker already on the chart. Checking against the whole kept
        // set (rather than just the previous one) is what actually guarantees the
        // spacing — a pairwise walk can leave two markers touching once a stronger
        // candidate displaces an earlier pick.
        // Recency first, then strength. Filtering afterwards would let stale calls
        // occupy the slots and leave a fresh one undrawn.
        let cutoff = count - 1 - max(0, recentBars)
        let recent = candidates.filter { $0.index >= cutoff }

        var kept: [Candidate] = []
        for candidate in recent.sorted(by: { $0.score > $1.score }) {
            let crowds = kept.contains { existing in
                let gap = abs(existing.index - candidate.index)
                // Flipping sides needs far more room than repeating one.
                let required = existing.signal.direction == candidate.signal.direction ? 5 : 9
                return gap < required
            }
            guard crowds == false else { continue }
            kept.append(candidate)
            if kept.count >= 6 { break }
        }

        return kept.sorted { $0.index < $1.index }.map(\.signal)
    }

    /// Drops a trailing bar whose interval hasn't fully elapsed.
    ///
    /// Exchanges return the in-progress candle as the last element, and treating it
    /// as final is the single biggest source of phantom signals.
    nonisolated static func closedCandles(
        _ candles: [Candle],
        timeframe: String,
        now: Date = Date()
    ) -> [Candle] {
        guard let minutes = timeframeMinutes(from: timeframe), minutes > 0,
              let last = candles.last else { return candles }
        let interval = TimeInterval(minutes * 60)
        return last.openTime.addingTimeInterval(interval) > now ? Array(candles.dropLast()) : candles
    }

    /// ADX for every bar, so the chop filter can be applied historically.
    nonisolated private static func rollingADX(candles: [Candle], period: Int) -> [Double?] {
        rollingADXPack(candles: candles, period: period).adx
    }

    /// Full directional-movement series. The shared `adx(candles:period:)` only
    /// reports the latest value, which is no use for drawing a pane.
    nonisolated private static func rollingADXPack(
        candles: [Candle],
        period: Int
    ) -> (adx: [Double?], plusDI: [Double?], minusDI: [Double?]) {
        var out = [Double?](repeating: nil, count: candles.count)
        var plusOut = [Double?](repeating: nil, count: candles.count)
        var minusOut = [Double?](repeating: nil, count: candles.count)
        guard candles.count > period * 2, period > 1 else { return (out, plusOut, minusOut) }

        var trs: [Double] = []
        var plusDMs: [Double] = []
        var minusDMs: [Double] = []
        for i in 1..<candles.count {
            let current = candles[i]
            let previous = candles[i - 1]
            let upMove = current.high - previous.high
            let downMove = previous.low - current.low
            plusDMs.append(upMove > downMove && upMove > 0 ? upMove : 0)
            minusDMs.append(downMove > upMove && downMove > 0 ? downMove : 0)
            trs.append(max(
                current.high - current.low,
                max(abs(current.high - previous.close), abs(current.low - previous.close))
            ))
        }

        // Wilder smoothing.
        var smoothedTR = trs.prefix(period).reduce(0, +)
        var smoothedPlus = plusDMs.prefix(period).reduce(0, +)
        var smoothedMinus = minusDMs.prefix(period).reduce(0, +)

        var dxValues: [Double] = []
        var adxValue: Double?

        for i in period..<trs.count {
            smoothedTR = smoothedTR - smoothedTR / Double(period) + trs[i]
            smoothedPlus = smoothedPlus - smoothedPlus / Double(period) + plusDMs[i]
            smoothedMinus = smoothedMinus - smoothedMinus / Double(period) + minusDMs[i]

            guard smoothedTR > 0 else { continue }
            let plusDI = smoothedPlus / smoothedTR * 100
            let minusDI = smoothedMinus / smoothedTR * 100
            let sum = plusDI + minusDI
            guard sum > 0 else { continue }
            let dx = abs(plusDI - minusDI) / sum * 100
            dxValues.append(dx)

            if dxValues.count == period {
                adxValue = dxValues.reduce(0, +) / Double(period)
            } else if dxValues.count > period, let current = adxValue {
                adxValue = (current * Double(period - 1) + dx) / Double(period)
            }

            // trs[i] describes candles[i + 1].
            if i + 1 < out.count {
                plusOut[i + 1] = plusDI
                minusOut[i + 1] = minusDI
                if let adxValue { out[i + 1] = adxValue }
            }
        }
        return (out, plusOut, minusOut)
    }

    /// %K / %D for every bar.
    nonisolated private static func rollingStochastic(
        candles: [Candle],
        period: Int,
        smoothing: Int
    ) -> (k: [Double?], d: [Double?]) {
        var kOut = [Double?](repeating: nil, count: candles.count)
        var dOut = [Double?](repeating: nil, count: candles.count)
        guard candles.count >= period, period > 1, smoothing > 0 else { return (kOut, dOut) }

        for i in (period - 1)..<candles.count {
            let window = candles[(i - period + 1)...i]
            guard let high = window.map(\.high).max(), let low = window.map(\.low).min() else { continue }
            let denominator = max(0.0000001, high - low)
            kOut[i] = (candles[i].close - low) / denominator * 100.0
        }

        for i in kOut.indices {
            let start = i - smoothing + 1
            guard start >= 0 else { continue }
            let values = (start...i).compactMap { kOut[$0] }
            guard values.count == smoothing else { continue }
            dOut[i] = values.reduce(0, +) / Double(smoothing)
        }
        return (kOut, dOut)
    }

    /// Computes every drawable indicator series in one pass.
    ///
    /// Called once per engine tick off the main actor; the chart then just reads
    /// arrays, so toggling an indicator on or off costs nothing.
    nonisolated static func liveSeries(candles: [Candle], timeframe: String) -> LiveChartSeries {
        guard candles.count >= 30 else { return .empty }

        let count = candles.count
        let closes = candles.map(\.close)
        var series = LiveChartSeries()

        series.ema20 = rightAligned(ema(values: closes, period: 20), count: count)
        series.ema50 = rightAligned(ema(values: closes, period: 50), count: count)
        series.ema200 = rightAligned(ema(values: closes, period: 200), count: count)

        var upper = [Double?](repeating: nil, count: count)
        var middle = [Double?](repeating: nil, count: count)
        var lower = [Double?](repeating: nil, count: count)
        let bands = rollingBollinger(closes: closes, period: 20, stdevMultiplier: 2.0)
        for (index, band) in bands.enumerated() {
            guard let band else { continue }
            upper[index] = band.upper
            lower[index] = band.lower
            middle[index] = (band.upper + band.lower) / 2
        }
        series.bollingerUpper = upper
        series.bollingerMiddle = middle
        series.bollingerLower = lower

        series.rsi = rightAligned(rsi(closes: closes, period: 14), count: count)

        let macdPack = macd(closes: closes)
        series.macd = rightAligned(macdPack.macd, count: count)
        series.macdSignal = rightAligned(macdPack.signal, count: count)
        series.macdHistogram = rightAligned(macdPack.histogram, count: count)

        let stoch = rollingStochastic(candles: candles, period: 14, smoothing: 3)
        series.stochasticK = stoch.k
        series.stochasticD = stoch.d

        let adxPack = rollingADXPack(candles: candles, period: 14)
        series.adx = adxPack.adx
        series.plusDI = adxPack.plusDI
        series.minusDI = adxPack.minusDI

        series.fibLevels = liveFibonacciLevels(
            candles: candles,
            timeframeKind: timeframeKind(from: timeframe)
        ).map { LiveChartLevel(id: "fib-\($0.name)", name: $0.name, price: $0.price) }

        series.keyLevels = liveKeyLevels(candles: candles)

        return series
    }

    /// Recent swing highs/lows that price has respected more than once.
    nonisolated private static func liveKeyLevels(candles: [Candle]) -> [LiveChartLevel] {
        guard candles.count >= 60 else { return [] }
        let recent = Array(candles.suffix(140))
        let lastClose = recent.last?.close ?? 0
        guard lastClose > 0 else { return [] }

        var pivots: [Double] = []
        let reach = 3
        for i in reach..<(recent.count - reach) {
            let window = recent[(i - reach)...(i + reach)]
            if recent[i].high == window.map(\.high).max() { pivots.append(recent[i].high) }
            if recent[i].low == window.map(\.low).min() { pivots.append(recent[i].low) }
        }
        guard pivots.isEmpty == false else { return [] }

        // Cluster pivots that sit within a small band of each other — a level that
        // was tested repeatedly matters more than a one-off wick.
        let tolerance = lastClose * 0.0035
        var clusters: [(price: Double, hits: Int)] = []
        for pivot in pivots.sorted() {
            if var last = clusters.last, abs(pivot - last.price) <= tolerance {
                last.price = (last.price * Double(last.hits) + pivot) / Double(last.hits + 1)
                last.hits += 1
                clusters[clusters.count - 1] = last
            } else {
                clusters.append((pivot, 1))
            }
        }

        return clusters
            .filter { $0.hits >= 2 }
            .sorted { abs($0.price - lastClose) < abs($1.price - lastClose) }
            .prefix(4)
            .map { cluster in
                LiveChartLevel(
                    id: "level-\(Int(cluster.price * 10000))",
                    name: cluster.price >= lastClose ? "Resistance" : "Support",
                    price: cluster.price
                )
            }
    }

    /// Pads a trailing-aligned indicator series out to one value per candle.
    nonisolated private static func rightAligned(_ series: [Double], count: Int) -> [Double?] {
        var out = [Double?](repeating: nil, count: count)
        let offset = count - series.count
        guard offset >= 0 else { return out }
        for (index, value) in series.enumerated() {
            out[offset + index] = value
        }
        return out
    }

    nonisolated private struct RollingBand {
        let upper: Double
        let lower: Double
    }

    /// Bollinger bands for every bar (the shared helper only returns the latest).
    nonisolated private static func rollingBollinger(
        closes: [Double],
        period: Int,
        stdevMultiplier: Double
    ) -> [RollingBand?] {
        var out = [RollingBand?](repeating: nil, count: closes.count)
        guard closes.count >= period, period > 1 else { return out }

        for i in (period - 1)..<closes.count {
            let window = closes[(i - period + 1)...i]
            let mean = window.reduce(0, +) / Double(period)
            guard mean.isFinite else { continue }
            let variance = window.reduce(0) { partial, value in
                let diff = value - mean
                return partial + diff * diff
            } / Double(period)
            let stdev = sqrt(max(0, variance))
            out[i] = RollingBand(
                upper: mean + stdevMultiplier * stdev,
                lower: mean - stdevMultiplier * stdev
            )
        }
        return out
    }

    nonisolated private struct NamedFibLevel {
        let name: String
        let price: Double
    }

    /// The Fib grid of the dominant recent swing, used to test bounces bar by bar.
    nonisolated private static func liveFibonacciLevels(
        candles: [Candle],
        timeframeKind: TimeframeKind
    ) -> [NamedFibLevel] {
        let lookback: Int = {
            switch timeframeKind {
            case .intraday: return 80
            case .daily: return 120
            case .weekly: return 160
            case .monthly: return 200
            }
        }()
        guard candles.count >= 40 else { return [] }
        let recent = candles.suffix(min(lookback, candles.count))
        guard let swingHigh = recent.map(\.high).max(),
              let swingLow = recent.map(\.low).min(),
              swingHigh > swingLow else { return [] }

        let range = swingHigh - swingLow
        let ratios: [(String, Double)] = [
            ("Fib 38.2%", 0.382), ("Fib 50%", 0.5), ("Fib 61.8%", 0.618), ("Fib 78.6%", 0.786)
        ]

        // Which leg is being retraced. Anchoring from the high unconditionally is
        // only right for an up-leg; in a downtrend it mislabels the grid — what it
        // calls 38.2% is really the 61.8% retracement — and those labels are what
        // the chart draws and what a "Fib rejection" signal names.
        let lastClose = recent.last?.close ?? swingHigh
        let retracingUp = (lastClose - swingLow) / range >= 0.5

        return ratios.map { name, factor in
            NamedFibLevel(
                name: name,
                price: retracingUp ? swingHigh - range * factor : swingLow + range * factor
            )
        }
    }

    nonisolated private static func zone(for score: Double) -> LiveIndicatorReadout.Zone {
        if score > 0.15 { return .bullish }
        if score < -0.15 { return .bearish }
        return .neutral
    }

    private struct LiveFibHit {
        let name: String
        let level: Double
        let distancePct: Double
        let retracingUp: Bool
    }

    /// Nearest Fibonacci retracement of the dominant swing, as numbers.
    nonisolated private static func liveFibonacci(
        candles: [Candle],
        price: Double,
        timeframeKind: TimeframeKind
    ) -> LiveFibHit? {
        let lookback: Int = {
            switch timeframeKind {
            case .intraday: return 80
            case .daily: return 120
            case .weekly: return 160
            case .monthly: return 200
            }
        }()
        guard candles.count >= 40 else { return nil }
        let recent = candles.suffix(min(lookback, candles.count))
        guard let swingHigh = recent.map(\.high).max(),
              let swingLow = recent.map(\.low).min(),
              swingHigh > swingLow else { return nil }

        let range = swingHigh - swingLow
        let ratios: [(String, Double)] = [
            ("23.6%", 0.236), ("38.2%", 0.382), ("50%", 0.5), ("61.8%", 0.618), ("78.6%", 0.786)
        ]
        // Direction of the leg: if price sits in the upper half we treat the swing as an
        // up-leg being retraced down into support, and vice versa.
        let retracingUp = (price - swingLow) / range >= 0.5
        var best: LiveFibHit?
        for (name, factor) in ratios {
            let level = retracingUp ? swingHigh - range * factor : swingLow + range * factor
            guard level > 0 else { continue }
            let distancePct = (price - level) / level * 100.0
            if best == nil || abs(distancePct) < abs(best!.distancePct) {
                best = LiveFibHit(name: name, level: level, distancePct: distancePct, retracingUp: retracingUp)
            }
        }
        return best
    }
}
