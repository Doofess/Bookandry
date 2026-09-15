import type { Currency, Minor, RateString } from '@/types/money';

import { exponentOf } from './currency-meta';

/**
 * Integer money. §12: no floats, minor units everywhere, format only at the edge.
 *
 * The one place a float would be unavoidable is multiplying by an exchange rate.
 * It is avoided by turning the rate's EXACT decimal string into a rational and
 * doing the arithmetic in BigInt, so there is exactly one rounding step per
 * conversion and it happens where we choose.
 *
 * Rounding is HALF AWAY FROM ZERO:
 *   - it matches `Intl.NumberFormat`'s default `halfExpand`, so a stored value
 *     and its rendered form never disagree by a unit;
 *   - it is sign-symmetric, so convert(-x) === -convert(x). `Math.round` is
 *     half-toward-+Infinity (Math.round(-2.5) === -2) and breaks that;
 *   - banker's rounding exists to de-bias summing many independently rounded
 *     values; here each amount is rounded exactly once, at save, so there is no
 *     bias to remove and it would merely surprise users.
 */

export class AmountOverflowError extends Error {
  constructor(value: bigint) {
    super(`Amount ${value.toString()} exceeds the safe integer range.`);
    this.name = 'AmountOverflowError';
  }
}

export class InvalidDecimalError extends Error {
  constructor(input: string) {
    super(`Not a valid decimal number: ${JSON.stringify(input)}`);
    this.name = 'InvalidDecimalError';
  }
}

export type Rational = { readonly n: bigint; readonly d: bigint };

const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/**
 * Exact decimal string to rational. Handles "1.0865", "-0.5", "6.1e-7", "1500".
 * Exponential input is real: `String(0.00000061)` is "6.1e-7".
 */
export function decimalToRational(input: string): Rational {
  const trimmed = input.trim();
  const m = DECIMAL_RE.exec(trimmed);
  if (!m) throw new InvalidDecimalError(input);

  // Group 2 is (d*) so it always participates, even when empty; group 3 is
  // optional and genuinely can be undefined. Asserting the guaranteed one keeps
  // a dead branch out of the coverage gate.
  const intPart = m[2]!;
  const fracPart = m[3] ?? '';
  if (intPart === '' && fracPart === '') throw new InvalidDecimalError(input);

  const sign = m[1] === '-' ? -1n : 1n;
  const digits = (intPart === '' ? '0' : intPart) + fracPart;
  const exp = (m[4] ? Number.parseInt(m[4], 10) : 0) - fracPart.length;

  const magnitude = BigInt(digits);
  return exp >= 0
    ? { n: sign * magnitude * 10n ** BigInt(exp), d: 1n }
    : { n: sign * magnitude, d: 10n ** BigInt(-exp) };
}

/** Divide, rounding half away from zero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const magnitude = r * 2n >= d ? q + 1n : q;
  return negative ? -magnitude : magnitude;
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new AmountOverflowError(value);
  }
  return Number(value);
}

/**
 * Normalise user input to a plain decimal string.
 *
 * `he-IL` and `en-US` both use '.' for decimals and ',' for grouping, so a
 * locale-aware parser earns nothing for this locale pair. Accepting both
 * separators unconditionally does help the real case: pasting an amount copied
 * from a European bank statement ("1.234,56").
 */
export function normalizeAmountInput(input: string): string {
  // Strip currency symbols, spaces (incl. NBSP/NNBSP) and the bidi control
  // characters that `Intl` injects into he-IL currency output.
  const cleaned = input
    .replace(/[‎‏؜⁦-⁩]/g, '')
    .replace(/[\s\u00A0\u202F]/g, '')
    .replace(/[^\d.,+-]/g, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma === -1 && lastDot === -1) return cleaned;

  // Whichever separator appears last is the decimal separator; the other groups.
  if (lastComma > lastDot) {
    return cleaned.replace(/\./g, '').replace(',', '.');
  }
  return cleaned.replace(/,/g, '');
}

/**
 * Parse display input to minor units.
 *
 * Takes a STRING, never a number: `toMinor(1.005, 'USD')` is already lossy at
 * the call site (1.005 * 100 === 100.49999999999999, so the float path yields
 * 100 rather than 101).
 */
export function toMinor(display: string, currency: Currency): Minor {
  const { n, d } = decimalToRational(normalizeAmountInput(display));
  return toSafeNumber(divRound(n * 10n ** BigInt(exponentOf(currency)), d));
}

/** Minor units back to a plain decimal string, for populating an input. */
export function toDecimalString(minor: Minor, currency: Currency): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError('minor must be a safe integer');
  const exponent = exponentOf(currency);
  if (exponent === 0) return String(minor);

  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0');
  const whole = digits.slice(0, -exponent);
  const frac = digits.slice(-exponent);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function add(a: Minor, b: Minor): Minor {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new AmountOverflowError(BigInt(a) + BigInt(b));
  return sum;
}

export function sum(values: readonly Minor[]): Minor {
  let total = 0n;
  for (const v of values) total += BigInt(v);
  return toSafeNumber(total);
}

/**
 * Convert between currencies with a SINGLE rounding step.
 *
 * `rate` is "1 unit of `from` = rate units of `to`", as an exact decimal string.
 * Exponent differences (USD(2) to JPY(0), JPY(0) to KWD(3)) are handled by one
 * shift term rather than special cases.
 */
export function convertMinor(amountMinor: Minor, from: Currency, to: Currency, rate: RateString): Minor {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('amountMinor must be a safe integer');

  // Identity short-circuit. This is what makes a base-currency round trip
  // (USD -> ILS -> USD) bit-identical rather than merely close: no multiply, no
  // rounding, nothing to drift.
  if (from === to) return amountMinor;

  const { n, d } = decimalToRational(rate);
  if (n <= 0n) throw new RangeError(`Exchange rate must be positive, got ${rate}`);

  const shift = exponentOf(to) - exponentOf(from);
  let numerator = BigInt(amountMinor) * n;
  let denominator = d;
  if (shift >= 0) numerator *= 10n ** BigInt(shift);
  else denominator *= 10n ** BigInt(-shift);

  return toSafeNumber(divRound(numerator, denominator));
}

/**
 * Derive a cross rate from a table based on a third currency.
 *
 * Kept as an exact decimal string so the stored snapshot stays auditable.
 * `dp` bounds the recorded precision; 10 significant decimals is far finer than
 * any minor-unit rounding boundary.
 */
export function crossRate(fromRate: RateString, toRate: RateString, dp = 10): RateString {
  const a = decimalToRational(fromRate);
  const b = decimalToRational(toRate);
  if (a.n <= 0n || b.n <= 0n) throw new RangeError('Exchange rates must be positive');

  const scale = 10n ** BigInt(dp);
  // Both rates are guaranteed positive above, so the result cannot be negative
  // and there is deliberately no sign branch here to go untested.
  const scaled = divRound(b.n * a.d * scale, b.d * a.n);

  const digits = scaled.toString().padStart(dp + 1, '0');
  const whole = digits.slice(0, -dp);
  const frac = digits.slice(-dp).replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}`;
}
