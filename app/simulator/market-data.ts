export type Candle = {
  openTime: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketCandlesResult = {
  sourceExchange: string;
  sourceSymbol: string;
  sourceTimeframe: string;
  candles: Candle[];
};

class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataError";
  }
}

type FetchArgs = {
  exchange: string;
  symbol: string;
  timeframe: string;
  limit: number;
};

function normalizeBinanceTimeframeCandidate(timeframe: string) {
  const trimmed = timeframe.trim();
  if (!trimmed) return timeframe;

  const lowered = trimmed.toLowerCase();
  const hasUnit = /[mhdw]/.test(lowered);
  if (hasUnit) {
    const cleaned = lowered.replaceAll(" ", "");
    const match = cleaned.match(/^(\d+)m$/);
    if (match) {
      const minutes = Number(match[1]);
      if (minutes === 60) return "1h";
      if (minutes === 120) return "2h";
      if (minutes === 180) return "3h";
      if (minutes === 240) return "4h";
      if (minutes === 360) return "6h";
      if (minutes === 480) return "8h";
      if (minutes === 720) return "12h";
      if (minutes === 1440) return "1d";
      if (minutes === 10080) return "1w";
    }
    return cleaned;
  }

  const digits = lowered.replaceAll(/[^0-9]/g, "");
  const value = Number(digits);
  if (!Number.isFinite(value)) return trimmed;

  switch (value) {
    case 1:
    case 3:
    case 5:
    case 15:
    case 30:
      return `${value}m`;
    case 60:
      return "1h";
    case 120:
      return "2h";
    case 240:
      return "4h";
    case 360:
      return "6h";
    case 720:
      return "12h";
    case 1440:
      return "1d";
    case 10080:
      return "1w";
    default:
      return trimmed;
  }
}

function normalizeSymbolForBinance(symbol: string) {
  return symbol.trim().toUpperCase().replaceAll(" ", "").replaceAll("/", "").replaceAll("-", "");
}

type StooqAggregationPlan = { targetTimeframe: string; groupSize: number };
function stooqAggregationPlan(timeframe: string): StooqAggregationPlan {
  const trimmed = timeframe.trim();
  const lower = trimmed.toLowerCase().replaceAll(" ", "");
  if (lower === "1d" || lower === "d") return { targetTimeframe: "1d", groupSize: 1 };
  if (lower === "1w" || lower === "w") return { targetTimeframe: "1w", groupSize: 5 };
  if (trimmed === "1M" || lower === "1mo" || lower === "1mon") return { targetTimeframe: "1M", groupSize: 21 };
  throw new MarketDataError(`Unsupported timeframe for Stooq: ${timeframe}`);
}

function normalizedStooqSymbol(symbol: string) {
  return symbol.trim().toLowerCase().replaceAll(" ", "");
}

function stooqSymbolCandidates(normalizedLowerSymbol: string) {
  const cleaned = normalizedLowerSymbol.trim().toLowerCase();
  const candidates: string[] = [cleaned];

  if (cleaned.startsWith("^")) candidates.push(cleaned.slice(1));

  const lettersOnly = cleaned.replaceAll(/[^a-z]/g, "");
  const isBareStockTicker = !cleaned.includes(".") && lettersOnly.length === cleaned.length && lettersOnly.length >= 1 && lettersOnly.length <= 5;
  if (isBareStockTicker) candidates.push(`${cleaned}.us`);

  switch (cleaned) {
    case "xauusd":
      candidates.push("gld.us");
      break;
    case "xagusd":
      candidates.push("slv.us");
      break;
    case "xptusd":
      candidates.push("pplt.us");
      break;
    case "xpdusd":
      candidates.push("pall.us");
      break;
    case "xcuusd":
      candidates.push("cper.us");
      break;
    default:
      break;
  }

  return Array.from(new Set(candidates));
}

function aggregateCandles(candles: Candle[], groupSize: number) {
  if (groupSize <= 1) return candles;
  if (candles.length < groupSize) return candles;

  const usableCount = candles.length - (candles.length % groupSize);
  if (usableCount <= 0) return candles;

  const base = candles.slice(0, usableCount);
  const aggregated: Candle[] = [];
  for (let index = 0; index < base.length; index += groupSize) {
    const slice = base.slice(index, index + groupSize);
    const first = slice[0];
    const last = slice.at(-1);
    if (!first || !last) continue;
    let high = first.high;
    let low = first.low;
    let volume = 0;
    for (const c of slice) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
    }
    aggregated.push({ openTime: first.openTime, open: first.open, high, low, close: last.close, volume });
  }
  return aggregated;
}

async function fetchBinanceKlines(args: {
  host: string;
  path: string;
  symbol: string;
  interval: string;
  limit: number;
}): Promise<Candle[]> {
  const u = new URL(`https://${args.host}${args.path}`);
  u.searchParams.set("symbol", args.symbol);
  u.searchParams.set("interval", args.interval);
  u.searchParams.set("limit", String(args.limit));

  const res = await fetch(u, { next: { revalidate: 60 } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MarketDataError(`Binance request failed (${res.status}): ${text.slice(0, 140)}`);
  }

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) throw new MarketDataError("Binance response parsing failed.");

  const candles: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if (![openTime, open, high, low, close, volume].every((n) => Number.isFinite(n))) continue;
    candles.push({ openTime, open, high, low, close, volume });
  }
  if (candles.length === 0) throw new MarketDataError("No candles returned from Binance.");
  return candles;
}

async function fetchStooqDailyCandles(symbol: string, limit: number): Promise<Candle[]> {
  const u = new URL("https://stooq.com/q/d/l/");
  u.searchParams.set("s", symbol);
  u.searchParams.set("i", "d");
  const res = await fetch(u, { next: { revalidate: 60 } });
  if (!res.ok) throw new MarketDataError(`Stooq request failed (${res.status}).`);

  const text = await res.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new MarketDataError("Stooq response parsing failed.");

  // date,open,high,low,close,volume
  const out: Candle[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < 6) continue;
    const date = Date.parse(parts[0]);
    const open = Number(parts[1]);
    const high = Number(parts[2]);
    const low = Number(parts[3]);
    const close = Number(parts[4]);
    const volume = Number(parts[5]);
    if (!Number.isFinite(date) || ![open, high, low, close, volume].every((n) => Number.isFinite(n))) continue;
    out.push({ openTime: date, open, high, low, close, volume });
  }
  if (out.length === 0) throw new MarketDataError("No candles returned from Stooq.");
  out.sort((a, b) => a.openTime - b.openTime);
  return out.slice(-limit);
}

export async function fetchMarketCandles(args: FetchArgs): Promise<MarketCandlesResult> {
  const exchange = args.exchange.trim().toLowerCase();
  const limit = Math.max(10, Math.min(1000, args.limit));

  if (exchange.includes("stooq")) {
    const plan = stooqAggregationPlan(args.timeframe);
    const normalizedSymbol = normalizedStooqSymbol(args.symbol);
    const candidates = stooqSymbolCandidates(normalizedSymbol);

    let lastErr: unknown = null;
    for (const candidate of candidates) {
      try {
        const base = await fetchStooqDailyCandles(candidate, Math.max(limit * plan.groupSize, limit));
        const candles = plan.groupSize > 1 ? aggregateCandles(base, plan.groupSize) : base;
        return {
          sourceExchange: "Stooq",
          sourceSymbol: candidate.toUpperCase(),
          sourceTimeframe: plan.targetTimeframe,
          candles: candles.slice(-limit)
        };
      } catch (e) {
        lastErr = e;
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : "Stooq fetch failed.";
    throw new MarketDataError(msg);
  }

  const interval = normalizeBinanceTimeframeCandidate(args.timeframe);
  const normalizedSymbol = normalizeSymbolForBinance(args.symbol);
  const isFutures = exchange.includes("futures") || exchange.includes("perp") || exchange.includes("fapi");

  const candles = await fetchBinanceKlines({
    host: isFutures ? "fapi.binance.com" : "api.binance.com",
    path: isFutures ? "/fapi/v1/klines" : "/api/v3/klines",
    symbol: normalizedSymbol,
    interval,
    limit
  });

  return {
    sourceExchange: isFutures ? "Binance Futures" : "Binance",
    sourceSymbol: normalizedSymbol,
    sourceTimeframe: interval,
    candles: candles.slice(-limit)
  };
}

