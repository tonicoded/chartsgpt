import Foundation

struct AnalysisRequest: Decodable {
    let symbol: String
    let timeframe: String
    let candles: [Candle]
    let indicatorSelection: IndicatorSelection?
    let higherTimeframes: [TimeframeInput]?
}

struct TimeframeInput: Decodable {
    let timeframe: String
    let candles: [Candle]
}

do {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .secondsSince1970
    let request = try decoder.decode(AnalysisRequest.self, from: FileHandle.standardInput.readDataToEndOfFile())
    guard request.candles.count >= 250 && request.candles.count <= 1000 else {
        throw NSError(domain: "Analysis", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected 250–1000 candles"])
    }
    let rawSnapshot = MarketAnalysisEngine.analyze(
        exchange: "Binance", symbol: request.symbol, timeframe: request.timeframe,
        candles: request.candles, indicatorSelection: request.indicatorSelection ?? .allEnabled, mode: .live
    )
    let contexts = (request.higherTimeframes ?? []).map { input in
        MarketAnalysisEngine.analyze(exchange: "Binance", symbol: request.symbol,
            timeframe: input.timeframe, candles: input.candles, mode: .live)
    }
    let snapshot = IOSHigherTimeframeAlignment.apply(to: rawSnapshot, snapshots: contexts)
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .secondsSince1970
    encoder.outputFormatting = [.sortedKeys]
    var output = try JSONSerialization.jsonObject(with: encoder.encode(snapshot)) as! [String: Any]
    output["setupQuality"] = snapshot.tradeSetups.map { setup -> [String: Any] in
        let quality = SetupQualityScorer.score(setup: setup, context: SetupQualityContext(snapshot: snapshot))
        return ["score": quality.score, "label": quality.label, "reasons": quality.reasons]
    }
    output["higherTimeframes"] = contexts.map { context -> [String: Any] in
        return ["timeframe": context.timeframe, "regime": context.marketRegime, "structure": context.marketStructure,
            "signal": context.signal, "lastClose": context.lastClose, "indicators": context.indicators]
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]))
} catch {
    FileHandle.standardError.write(Data("Analysis failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}
