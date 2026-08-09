/**
 * Swift / C runtime semantics, reproduced exactly.
 *
 * The engine is a line-for-line port of `ChartGPT/MarketAnalysisEngine.swift`, and its
 * output is compared against iOS golden snapshots string-for-string. That only works if
 * the primitives behave identically, and several of them do NOT match their obvious
 * JavaScript counterparts:
 *
 *   - `String(format: "%.0f", x)` is C `printf`, which rounds ties to EVEN.
 *     `Number.prototype.toFixed` rounds ties AWAY FROM ZERO. So 68600.5 formats as
 *     "68600" on iOS and "68601" in naive JS. Ties are exactly representable in binary
 *     whenever the fraction is a negative power of two (.5, .25, .125…), so this is a
 *     real divergence, not a theoretical one.
 *   - Swift's `Double.rounded()` rounds ties AWAY FROM ZERO (schoolbook), while
 *     `Math.round` rounds ties toward +∞: Math.round(-0.5) === -0, (-0.5).rounded() === -1.
 *   - Swift's `Int(x)` truncates toward zero; so does Math.trunc, but `| 0` overflows.
 *   - Swift integer division `a / b` on Int truncates toward zero.
 */

// MARK: - Rounding

/** Swift `Double.rounded()` — round half away from zero. */
export function rounded(value: number): number {
  if (!Number.isFinite(value)) return value;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Swift `Int(x)` — truncate toward zero. */
export function toInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

/** Swift integer division (both operands Int) — truncates toward zero. */
export function intDiv(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.trunc(a / b);
}

// MARK: - Exact decimal expansion of a double

/**
 * Decomposes a finite double into an exact dyadic rational `mantissa * 2^exponent`
 * with `mantissa` a BigInt. Every finite double is exactly such a rational, so this
 * loses nothing — it is what lets us reproduce printf's rounding bit-for-bit.
 */
function decompose(value: number): { negative: boolean; mantissa: bigint; exponent: number } {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, value);
  const hi = buffer.getUint32(0);
  const lo = buffer.getUint32(4);

  const negative = (hi & 0x80000000) !== 0;
  const rawExponent = (hi >>> 20) & 0x7ff;
  const rawMantissa = (BigInt(hi & 0x000fffff) << 32n) | BigInt(lo);

  if (rawExponent === 0) {
    // Subnormal: no implicit leading bit.
    return { negative, mantissa: rawMantissa, exponent: -1074 };
  }
  const mantissa = rawMantissa | (1n << 52n);
  return { negative, mantissa, exponent: rawExponent - 1075 };
}

const TEN = 10n;

/**
 * C `printf("%.<decimals>f", value)`.
 *
 * Rounds the exact binary value to `decimals` places using round-half-to-even, which is
 * the IEEE-754 default rounding mode that glibc/Apple libc apply. Matches Swift's
 * `String(format:)` for every finite double.
 */
export function formatF(value: number, decimals: number): string {
  if (Number.isNaN(value)) return "nan";
  if (!Number.isFinite(value)) return value > 0 ? "inf" : "-inf";

  const { negative, mantissa, exponent } = decompose(value);

  // Represent |value| as numerator / denominator exactly.
  let numerator: bigint;
  let denominator: bigint;
  if (exponent >= 0) {
    numerator = mantissa << BigInt(exponent);
    denominator = 1n;
  } else {
    numerator = mantissa;
    denominator = 1n << BigInt(-exponent);
  }

  // Scale so the result is an integer count of 10^-decimals units.
  const scale = TEN ** BigInt(decimals);
  numerator *= scale;

  let quotient = numerator / denominator;
  const remainder = numerator % denominator;

  // Round half to even on the exact remainder.
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > denominator) {
    quotient += 1n;
  } else if (twiceRemainder === denominator) {
    if (quotient % 2n === 1n) quotient += 1n;
  }

  let digits = quotient.toString();
  let text: string;
  if (decimals === 0) {
    text = digits;
  } else {
    if (digits.length <= decimals) digits = digits.padStart(decimals + 1, "0");
    text = `${digits.slice(0, digits.length - decimals)}.${digits.slice(digits.length - decimals)}`;
  }

  // printf prints "-0.00" for negative zero and for negatives that round to zero.
  return negative ? `-${text}` : text;
}

/** Swift `String(format: "%+.<decimals>f", value)` — always signed. */
export function formatSignedF(value: number, decimals: number): string {
  const text = formatF(value, decimals);
  return text.startsWith("-") ? text : `+${text}`;
}

/** Swift `String(format: "%+d", value)` — always signed integer. */
export function formatSignedInt(value: number): string {
  const truncated = toInt(value);
  return truncated < 0 ? `${truncated}` : `+${truncated}`;
}

// MARK: - Collection helpers matching Swift's Array API

/** Swift `Array.prefix(k)` — safe when k exceeds the length. */
export function prefix<T>(values: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  return values.slice(0, Math.min(count, values.length));
}

/** Swift `Array.suffix(k)` — safe when k exceeds the length. */
export function suffix<T>(values: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  return values.slice(Math.max(0, values.length - count));
}

/** Swift `Array.dropFirst(k)`. */
export function dropFirst<T>(values: readonly T[], count = 1): T[] {
  return values.slice(Math.min(count, values.length));
}

/** Swift `Array.dropLast(k)`. */
export function dropLast<T>(values: readonly T[], count = 1): T[] {
  return values.slice(0, Math.max(0, values.length - count));
}

/** Swift `Array.last` — undefined-free, returns null like an Optional. */
export function last<T>(values: readonly T[]): T | null {
  return values.length === 0 ? null : values[values.length - 1];
}

/** Swift `Array.first`. */
export function first<T>(values: readonly T[]): T | null {
  return values.length === 0 ? null : values[0];
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/**
 * Swift `Array.sorted()` on Doubles. JavaScript's default sort is lexicographic, which
 * would order [10, 9] as [10, 9]; this sorts numerically like Swift does.
 */
export function sortedAscending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function maxOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let result = values[0];
  for (const value of values) if (value > result) result = value;
  return result;
}

export function minOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let result = values[0];
  for (const value of values) if (value < result) result = value;
  return result;
}

/** Swift's `Date` bridges to JSON as seconds since 2001-01-01, not since the epoch. */
export const SWIFT_REFERENCE_DATE_UNIX = 978307200;

export function unixToSwiftDate(unixSeconds: number): number {
  return unixSeconds - SWIFT_REFERENCE_DATE_UNIX;
}

export function swiftDateToUnix(referenceSeconds: number): number {
  return referenceSeconds + SWIFT_REFERENCE_DATE_UNIX;
}
