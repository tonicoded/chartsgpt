/**
 * Label builders and supplemental-digest lines — port of the corresponding helpers in
 * `ChartGPT/MarketAnalysisEngine.swift` (lines ~623-995).
 *
 * These are the strings the result screen renders verbatim, so the wording, the plus
 * signs and the decimal counts are all load-bearing.
 *
 * iOS calls `Date()` inside the macro helpers. Here "now" is an explicit parameter so the
 * engine stays a pure function — a server rendering the same snapshot twice must not
 * produce two different answers.
 */

import { formatCompact, parseDoubleStrict } from "./format";
import { formatF, formatSignedF, prefix, rounded, sum, toInt } from "./swift";
import type {
  Candle,
  DerivativesDigest,
  FearGreedData,
  MacroCalendarDigest,
  MarketNewsDigest,
  TradeSetup,
  VolatilityRegime
} from "./types";

const HOUR = 3600;
const DAY = 24 * HOUR;

/** DateFormatter("MMM d") in America/New_York, en_US_POSIX. */
function formatEasternMonthDay(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric"
  }).format(new Date(unixSeconds * 1000));
}

/** DateFormatter("HH:mm") in the local zone. */
function formatLocalHourMinute(unixSeconds: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...(timeZone ? { timeZone } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(unixSeconds * 1000));
}

/** Swift: `macroRiskNotes(macroDigest:)`. */
export function macroRiskNotes(macroDigest: MacroCalendarDigest, now: number): string[] {
  if (macroDigest.events.length === 0) return [];

  const upcoming = macroDigest.events
    .filter((event) => {
      if (event.scheduledAt === null) return false;
      const delta = event.scheduledAt - now;
      return delta > 0 && delta <= 7 * DAY;
    })
    .filter((event) => {
      const impact = (event.impact ?? "").toLowerCase();
      return impact.includes("high") || impact.includes("medium");
    })
    .sort((lhs, rhs) => (lhs.scheduledAt ?? Number.MAX_SAFE_INTEGER) - (rhs.scheduledAt ?? Number.MAX_SAFE_INTEGER));

  if (upcoming.length === 0) return [];

  const highWithin24h = upcoming.filter((event) => {
    const impact = (event.impact ?? "").toLowerCase();
    if (!impact.includes("high") || event.scheduledAt === null) return false;
    return event.scheduledAt - now <= DAY;
  });

  const highWithin72h = upcoming.filter((event) => {
    const impact = (event.impact ?? "").toLowerCase();
    if (!impact.includes("high") || event.scheduledAt === null) return false;
    return event.scheduledAt - now <= 72 * HOUR;
  });

  const notes: string[] = [];
  if (highWithin24h.length > 0) {
    notes.push(
      "Macro event risk elevated: high-impact releases/speeches within 24h can trigger liquidity spikes and faster setup invalidation."
    );
  }
  if (highWithin72h.length >= 3) {
    notes.push(
      "Macro event cluster ahead: expect chop, fake reversals, and lower breakout reliability until the calendar clears."
    );
  }

  for (const event of prefix(upcoming, 5)) {
    const currency = event.currency.trim();
    const title = event.title.trim();
    if (currency.length === 0 || title.length === 0) continue;
    const impact = (event.impact ?? "").trim();
    const dateStr = event.scheduledAt !== null ? formatEasternMonthDay(event.scheduledAt) : "TBA";
    const isWithin24h = event.scheduledAt !== null ? event.scheduledAt - now <= DAY : false;
    const urgency = isWithin24h ? " — within 24h, expect volatility." : ".";
    const impactPrefix = impact.length === 0 ? "" : `${impact} `;
    notes.push(`Macro (${dateStr}): ${impactPrefix}${currency} — ${title}${urgency}`);
  }

  return notes;
}

/** Swift: `sameDayHighImpactMacroAlert(macroDigest:)`. */
export function sameDayHighImpactMacroAlert(
  macroDigest: MacroCalendarDigest,
  now: number,
  timeZone?: string
): string | null {
  const nowDate = new Date(now * 1000);
  const sameDay = (unixSeconds: number): boolean => {
    const date = new Date(unixSeconds * 1000);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      ...(timeZone ? { timeZone } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return fmt.format(date) === fmt.format(nowDate);
  };

  const upcomingHigh = macroDigest.events
    .filter((event) => {
      if (event.scheduledAt === null) return false;
      const impact = (event.impact ?? "").toLowerCase();
      return impact.includes("high") && event.scheduledAt > now && sameDay(event.scheduledAt);
    })
    .sort((lhs, rhs) => (lhs.scheduledAt ?? Number.MAX_SAFE_INTEGER) - (rhs.scheduledAt ?? Number.MAX_SAFE_INTEGER));

  const event = upcomingHigh[0];
  if (event === undefined || event.scheduledAt === null) return null;
  const date = event.scheduledAt;

  const hours = Math.max(0, (date - now) / 3600);
  let timeText: string;
  if (hours < 1) {
    // Swift uses `round()` here (half away from zero) rather than `.rounded()`.
    const minutes = Math.max(1, toInt(rounded((date - now) / 60)));
    timeText = `in ${minutes}m`;
  } else {
    timeText = `in ${formatF(hours, 1)}h`;
  }

  const currency = event.currency.trim();
  const title = event.title.trim();
  const currencyPrefix = currency.length === 0 ? "" : `${currency} `;
  return `Macro alert: High-impact ${currencyPrefix}${title} at ${formatLocalHourMinute(date, timeZone)} (${timeText}). Expect volatility/spread risk around this setup.`;
}

/** Swift: `newsConfluenceItems(newsDigest:)`. */
export function newsConfluenceItems(newsDigest: MarketNewsDigest): string[] {
  if (newsDigest.items.length === 0) return [];

  const tones = newsDigest.items
    .map((item) => item.tone)
    .filter((tone): tone is number => tone !== null && tone !== undefined);
  if (tones.length === 0) return [];

  const avgTone = sum(tones) / tones.length;
  const positiveCount = tones.filter((tone) => tone > 0.1).length;
  const negativeCount = tones.filter((tone) => tone < -0.1).length;
  const total = tones.length;

  if (avgTone > 0.2) {
    return [`News sentiment: bullish (${positiveCount}/${total} headlines positive)`];
  }
  if (avgTone < -0.2) {
    return [`News sentiment: bearish (${negativeCount}/${total} headlines negative)`];
  }
  return [`News sentiment: mixed/neutral (${total} recent headlines)`];
}

/** Swift: `derivativesConfluenceItems(digest:)`. Funding rate, open interest, long/short ratio. */
export function derivativesConfluenceItems(digest: DerivativesDigest): string[] {
  if (digest.errorMessage !== null) return [];
  const items: string[] = [];

  if (digest.fundingRate !== null) {
    const pct = digest.fundingRate * 100;
    if (pct > 0.03) {
      items.push(`Funding elevated (${formatSignedF(pct, 3)}%) — longs dominant`);
    } else if (pct > 0.005) {
      items.push(`Funding rate positive (${formatSignedF(pct, 3)}%) — longs paying`);
    } else if (pct < -0.03) {
      items.push(`Funding negative (${formatF(pct, 3)}%) — shorts dominant`);
    } else if (pct < -0.005) {
      items.push(`Funding rate negative (${formatF(pct, 3)}%) — shorts paying`);
    } else {
      items.push(`Funding rate neutral (${formatSignedF(pct, 3)}%)`);
    }
  }

  if (digest.openInterestChange24h !== null) {
    const change = digest.openInterestChange24h;
    if (change > 5) {
      items.push(`OI expanding (${formatSignedF(change, 1)}% 24h) — trend supported`);
    } else if (change < -5) {
      items.push(`OI declining (${formatF(change, 1)}% 24h) — participation falling`);
    }
  }

  if (digest.longShortRatio !== null) {
    const ls = digest.longShortRatio;
    if (ls > 1.8) {
      items.push(`Long-heavy positioning (L/S ${formatF(ls, 2)})`);
    } else if (ls < 0.6) {
      items.push(`Short-heavy positioning (L/S ${formatF(ls, 2)})`);
    }
  }

  return items;
}

/** Swift: `derivativesRiskNotes(digest:)`. Crowded trades and squeeze setups. */
export function derivativesRiskNotes(digest: DerivativesDigest): string[] {
  if (digest.errorMessage !== null) return [];
  const notes: string[] = [];

  if (digest.fundingRate !== null) {
    const pct = digest.fundingRate * 100;
    if (pct > 0.05) {
      notes.push(`High funding rate (${formatSignedF(pct, 3)}%) — long squeeze risk if price drops.`);
    } else if (pct < -0.05) {
      notes.push(`Deeply negative funding (${formatF(pct, 3)}%) — short squeeze risk if price rises.`);
    }
  }

  // Both values are required even though only the account percentage is rendered.
  if (digest.longShortRatio !== null && digest.longAccountPct !== null) {
    const lp = digest.longAccountPct;
    if (lp > 0.72) {
      notes.push(`${formatF(lp * 100, 0)}% of accounts are long — crowded long, watch for flush.`);
    } else if (lp < 0.35) {
      const sp = 1 - lp;
      notes.push(`${formatF(sp * 100, 0)}% of accounts are short — crowded short, squeeze possible.`);
    }
  }

  return notes;
}

/** Swift: `isFearGreedRelevant(symbol:)`. Only Yahoo index symbols qualify. */
export function isFearGreedRelevant(symbol: string): boolean {
  const upper = symbol.trim().toUpperCase();
  return upper.startsWith("^");
}

/** Swift: `fearGreedConfluenceItems(data:symbol:)`. */
export function fearGreedConfluenceItems(data: FearGreedData, symbol: string): string[] {
  if (!isFearGreedRelevant(symbol)) return [];
  const v = data.value;
  if (v >= 0 && v <= 15) {
    return [`Fear & Greed: Extreme Fear (${v}) — potential capitulation/reversal zone`];
  }
  if (v >= 16 && v <= 30) {
    return [`Fear & Greed: Fear (${v}) — risk-off sentiment`];
  }
  if (v >= 70 && v <= 84) {
    return [`Fear & Greed: Greed (${v}) — bullish sentiment`];
  }
  if (v >= 85 && v <= 100) {
    return [`Fear & Greed: Extreme Greed (${v}) — potential topping/overbought zone`];
  }
  return [];
}

/** Swift: `fearGreedRiskNotes(data:symbol:)`. */
export function fearGreedRiskNotes(data: FearGreedData, symbol: string): string[] {
  if (!isFearGreedRelevant(symbol)) return [];
  const v = data.value;
  if (v >= 0 && v <= 15) {
    return [
      `Fear & Greed at ${v} (Extreme Fear): historical reversal zones often mark local bottoms — counter-trend bounces possible.`
    ];
  }
  if (v >= 85 && v <= 100) {
    return [
      `Fear & Greed at ${v} (Extreme Greed): markets often consolidate or pull back from these extremes — avoid chasing.`
    ];
  }
  return [];
}

/** Swift: `signalLabel(regimeLabel:tradeSetups:)`. Only ever "Hold" or "Watch". */
export function signalLabel(_regimeLabel: string, tradeSetups: readonly TradeSetup[]): string {
  if (tradeSetups.length === 0) return "Hold";
  return "Watch";
}

/**
 * Swift: `riskLevelLabel(volatilityPct:volatilityRegime:)`.
 * Absolute ATR% wins over the regime percentile, so a quiet-by-history but objectively
 * violent tape is never labelled "Low".
 */
export function riskLevelLabel(
  volatilityPct: number | null,
  volatilityRegime: VolatilityRegime | null
): string {
  if (volatilityPct !== null && volatilityPct >= 2.2) return "High";

  if (volatilityRegime !== null) {
    const lower = volatilityRegime.label.toLowerCase();
    if (lower.includes("high")) return "High";
    if (lower.includes("low")) return "Low";
    if (lower.includes("normal")) return "Medium";
  }

  if (volatilityPct === null) return "Medium";
  if (volatilityPct >= 1.1) return "Medium";
  return "Low";
}

export interface VolumeStateResult {
  state: string;
  note: string | null;
}

/**
 * Swift: `volumeStateLabel(exchange:symbol:candles:volatilityPct:volatilityRegime:)`.
 *
 * Yahoo does not report usable volume for FX, indices or futures, so those short-circuit
 * to a labelled state rather than producing a misleading "Low".
 */
export function volumeStateLabel(
  exchange: string,
  symbol: string,
  candles: readonly Candle[],
  volatilityPct: number | null,
  volatilityRegime: VolatilityRegime | null
): VolumeStateResult {
  const normalizedExchange = exchange.trim().toLowerCase();
  const normalizedSymbol = symbol.trim().toUpperCase();
  const isYahooFX = normalizedExchange.includes("yahoo") && normalizedSymbol.endsWith("=X");
  const isIndexSymbol = normalizedSymbol.startsWith("^"); // S&P 500, Nasdaq, etc.
  const isFuturesSymbol = normalizedSymbol.endsWith("=F"); // Gold, Oil, etc.

  if (isYahooFX) {
    return { state: "Synthetic", note: "FX volume is synthetic — volume signals have lower confidence." };
  }
  if (isIndexSymbol) {
    return { state: "Not available", note: "Index volume unavailable — volume signals skipped." };
  }
  if (isFuturesSymbol) {
    return {
      state: "Estimated",
      note: "Futures volume may be delayed — volume signals are moderate confidence."
    };
  }
  if (candles.length < 25) {
    return { state: "Unknown", note: "Insufficient candle data for volume analysis." };
  }

  const recent20 = candles.slice(Math.max(0, candles.length - 20)).map((candle) => candle.volume);
  const avg = sum(recent20) / recent20.length;
  if (!(avg > 0)) {
    return { state: "Not available", note: "No volume data available for this instrument." };
  }
  const lastVolume = candles[candles.length - 1]?.volume ?? 0;
  const last3 = candles.slice(Math.max(0, candles.length - 3)).map((candle) => candle.volume);
  const avg3 = sum(last3) / Math.max(last3.length, 1);

  const ratioLast = lastVolume / avg;
  const ratio3 = avg3 / avg;

  const lastCandle = candles[candles.length - 1];
  const rangePct =
    lastCandle !== undefined && lastCandle.close > 0
      ? ((lastCandle.high - lastCandle.low) / lastCandle.close) * 100.0
      : null;

  if (ratioLast >= 1.25 || ratio3 >= 1.2) {
    return { state: "High", note: "Volume elevated vs 20-period average." };
  }

  if (ratioLast <= 0.75 && ratio3 <= 0.8) {
    // Elevated price movement must not be reported as "Low" — users read that as inactivity.
    const isHighVolRegime = volatilityRegime?.label.toLowerCase().includes("high") === true;
    if (isHighVolRegime || (volatilityPct ?? 0) >= 0.7 || (rangePct ?? 0) >= 0.5) {
      return { state: "Normal", note: "Price movement elevated; volume is muted vs 20-period average." };
    }
    return { state: "Low", note: "Volume muted vs 20-period average." };
  }

  return { state: "Normal", note: null };
}

/** Swift: `confluenceForSetups(from:)` — an identity pass kept for traceability. */
export function confluenceForSetups(fibConfluence: readonly string[]): string[] {
  return [...fibConfluence];
}

/**
 * Swift: `buildSummary(symbol:timeframe:lastClose:changePct:regime:structure:levels:)`.
 * The one-paragraph headline at the top of the result screen.
 */
export function buildSummary(
  symbol: string,
  timeframe: string,
  lastClose: number,
  changePct: number | null,
  regime: string,
  structure: string,
  levels: readonly { price: string; note: string | null }[]
): string {
  const last = formatCompact(lastClose);
  const change = changePct !== null ? `${formatSignedF(changePct, 2)}%` : "n/a";

  const parsed = levels
    .map((level) => ({ value: parseDoubleStrict(level.price), price: level.price }))
    .filter((item): item is { value: number; price: string } => item.value !== null);

  const nearestBelow = parsed
    .filter((item) => item.value < lastClose)
    .sort((lhs, rhs) => rhs.value - lhs.value)[0];
  const nearestAbove = parsed
    .filter((item) => item.value > lastClose)
    .sort((lhs, rhs) => lhs.value - rhs.value)[0];

  const parts: string[] = [];
  parts.push(`${symbol} ${timeframe} last close ${last} (${change}).`);
  parts.push(`${regime}. ${structure}.`);

  if (nearestBelow !== undefined && nearestAbove !== undefined) {
    parts.push(`Nearest levels: ${nearestBelow.price} below, ${nearestAbove.price} above.`);
  } else if (nearestBelow !== undefined) {
    parts.push(`Nearest support: ${nearestBelow.price}.`);
  } else if (nearestAbove !== undefined) {
    parts.push(`Nearest resistance: ${nearestAbove.price}.`);
  }

  return parts.join(" ");
}
