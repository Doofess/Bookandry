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

/**
 * Compose two rates exactly: rate(X to Y) * rate(Y to Z) = rate(X to Z).
 *
 * Needed by the reconvert flow. When a row carries a rate the USER supplied
 * (say 1 EUR = 3.95 ILS) and the base currency changes from ILS to USD, the
 * honest move is to keep their EUR leg and compose it with a provider rate for
 * the ILS leg - NOT to discard their figure, and NOT to convert the stored
 * base amount a second time.
 *
 * Composing the RATES and applying the result once means a single rounding
 * step. Converting twice would round twice and drift.
 */
export function multiplyRates(a: RateString, b: RateString, dp = 12): RateString {
  const ra = decimalToRational(a);
  const rb = decimalToRational(b);
  if (ra.n <= 0n || rb.n <= 0n) throw new RangeError('Exchange rates must be positive');

  const scale = 10n ** BigInt(dp);
  const scaled = divRound(ra.n * rb.n * scale, ra.d * rb.d);

  const digits = scaled.toString().padStart(dp + 1, '0');
  const whole = digits.slice(0, -dp);
  const frac = digits.slice(-dp).replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}`;
}

/**
 * The rate implied by "I was charged X" - the everyday foreign-purchase case.
 *
 * An Israeli buys EUR 45 online and the card charges ILS 178.40 INCLUDING the
 * foreign-transaction fee. They know the shekel figure from the bank's SMS;
 * they do not know, and cannot look up, the ECB rate their issuer used. So the
 * charged amount is the primary input and the rate is derived from it, not the
 * other way round.
 *
 * Exact throughout: the exponent difference is one shift term, and the only
 * rounding is the final truncation to `dp` decimals.
 */
export function rateFromAmounts(
  amountMinor: Minor,
  from: Currency,
  chargedMinor: Minor,
  to: Currency,
  dp = 10,
): RateString {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(chargedMinor)) {
    throw new RangeError('amounts must be safe integers');
  }
  if (amountMinor <= 0) throw new RangeError('amountMinor must be positive');
  if (chargedMinor <= 0) throw new RangeError('chargedMinor must be positive');

  const shift = exponentOf(from) - exponentOf(to);
  const scale = 10n ** BigInt(dp);
  let numerator = BigInt(chargedMinor) * scale;
  let denominator = BigInt(amountMinor);
  if (shift >= 0) numerator *= 10n ** BigInt(shift);
  else denominator *= 10n ** BigInt(-shift);

  const scaled = divRound(numerator, denominator);
  const digits = scaled.toString().padStart(dp + 1, '0');
  const whole = digits.slice(0, -dp);
  const frac = digits.slice(-dp).replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}`;
}

/** `1 / rate`, exactly. Used to test whether a typed rate was entered backwards. */
export function invertRate(rate: RateString, dp = 10): RateString {
  const { n, d } = decimalToRational(rate);
  if (n <= 0n) throw new RangeError('Exchange rate must be positive');

  const scale = 10n ** BigInt(dp);
  const scaled = divRound(d * scale, n);
  const digits = scaled.toString().padStart(dp + 1, '0');
  const whole = digits.slice(0, -dp);
  const frac = digits.slice(-dp).replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}`;
}

export function isPositiveRate(rate: RateString): boolean {
  try {
    return decimalToRational(rate).n > 0n;
  } catch {
    return false;
  }
}

/**
 * |value - reference| / reference > tolerance, computed exactly.
 *
 * The tolerance arrives as a fraction rather than a decimal because this
 * decides whether to warn the user that a rate looks wrong; doing that
 * comparison in floating point would make the boundary itself fuzzy.
 */
export function rateDeviationExceeds(
  value: RateString,
  reference: RateString,
  toleranceNumerator: bigint,
  toleranceDenominator: bigint,
): boolean {
  const v = decimalToRational(value);
  const r = decimalToRational(reference);
  if (v.n <= 0n || r.n <= 0n) return true;

  const difference = v.n * r.d - r.n * v.d;
  const magnitude = difference < 0n ? -difference : difference;
  return magnitude * toleranceDenominator > toleranceNumerator * v.d * r.n;
}

/**
 * Divide a minor amount into equal parts, rounding once.
 *
 * For the "monthly equivalent" of a yearly bill and nothing else: a yearly
 * insurance premium has to be comparable with a monthly one, and comparing them
 * requires dividing money by twelve. Half away from zero, like every other
 * rounding here, so a negative amount rounds symmetrically with its positive.
 */
export function divideMinor(minor: Minor, divisor: number): Minor {
  if (!Number.isSafeInteger(minor)) throw new RangeError('minor must be a safe integer');
  if (!Number.isSafeInteger(divisor) || divisor === 0) {
    throw new RangeError(`divisor must be a non-zero integer, got ${String(divisor)}`);
  }
  return toSafeNumber(divRound(BigInt(minor), BigInt(divisor)));
}

/**
 * לוח שפיצר - the fixed monthly payment of an amortizing plan.
 *
 *   PMT = PV · r(1+r)^n / ((1+r)^n − 1)
 *
 * with `r` the MONTHLY rate (the annual nominal rate divided by twelve) and `n`
 * the number of payments. It is how an Israeli card issuer computes עסקת
 * קרדיט, and the reason the early payments are mostly interest and the later
 * ones mostly principal: the payment is level, the split inside it is not.
 *
 * Done in exact BigInt rationals rather than floats, like everything else in
 * this file. Writing it as `p * r * (1+r)**n / ...` in doubles gives an answer
 * that is almost always right and occasionally an agora out, and "occasionally
 * an agora out" in a ledger is a bug report nobody can reproduce. Expanding
 * (1+r)^n = (b+a)^n / b^n lets the whole expression collapse to one integer
 * division, so there is exactly ONE rounding - the same rule the rest of the
 * money layer follows.
 *
 * A zero rate is not a special case in the maths so much as a hole in it: the
 * denominator becomes zero. It is also the ordinary case of תשלומים, so it
 * falls back to a plain division.
 */
export function spitzerPayment(principalMinor: Minor, annualRatePercent: string, months: number): Minor {
  if (!Number.isSafeInteger(principalMinor) || principalMinor < 0) {
    throw new RangeError('principal must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(months) || months < 1) {
    throw new RangeError(`months must be a positive integer, got ${String(months)}`);
  }

  const rate = decimalToRational(annualRatePercent);
  if (rate.n < 0n) throw new RangeError('interest rate cannot be negative');
  // Interest-free: the plan is just the purchase split N ways.
  if (rate.n === 0n) return divideMinor(principalMinor, months);

  /*
   * The monthly rate as a/b, exactly.
   *
   * `annualRatePercent` is a PERCENTAGE, so the fraction is rate/100, and the
   * monthly rate is that over twelve: rate/1200. Both divisions fold into the
   * denominator, so no decimal is ever taken.
   */
  const a = rate.n;
  const b = rate.d * 1200n;

  const grown = (b + a) ** BigInt(months);
  const principal = BigInt(principalMinor);

  // PV · a · (b+a)^n / (b · ((b+a)^n − b^n)), rounded half away from zero once.
  return toSafeNumber(divRound(principal * a * grown, b * (grown - b ** BigInt(months))));
}

export type CreditSchedule = {
  /** The level monthly payment. */
  readonly paymentMinor: Minor;
  /** What the plan costs in total: payment × months. */
  readonly totalMinor: Minor;
  /** The issuer's cut: total − principal. */
  readonly interestMinor: Minor;
};

/**
 * The three figures a קרדיט plan is judged by.
 *
 * The total is the payment times the count rather than an independently
 * rounded number, because that is what the user will actually be charged:
 * six payments of ₪207.06 is ₪1,242.36 even if the "true" total is a
 * fraction of an agora off it. Deriving the interest from the same subtraction
 * keeps the three consistent with each other, which matters more than either
 * being independently ideal.
 */
export function creditSchedule(
  principalMinor: Minor,
  annualRatePercent: string,
  months: number,
): CreditSchedule {
  /*
   * A plan never costs less than the purchase.
   *
   * payment × months can come out BELOW the principal: at zero interest
   * ₪1,000 over 3 is 333.33 × 3 = ₪999.99, and at a promotional 0.01% the
   * interest is too small to lift the rounded payment past 333.33 either. That
   * missing agora would be shown as "−₪0.01 of interest", which no issuer has
   * ever charged. Where the interest does not survive rounding the plan IS
   * תשלומים, whose first payment absorbs the remainder so the parts sum to
   * the whole - so that is what is returned.
   */
  const paymentMinor = spitzerPayment(principalMinor, annualRatePercent, months);
  const totalMinor = toSafeNumber(BigInt(paymentMinor) * BigInt(months));
  if (totalMinor <= principalMinor) {
    return {
      paymentMinor: divideMinor(principalMinor, months),
      totalMinor: principalMinor,
      interestMinor: 0,
    };
  }
  return { paymentMinor, totalMinor, interestMinor: totalMinor - principalMinor };
}

/** Rates above this are a typo, not a loan. */
export const MAX_ANNUAL_RATE = 100;

const ANNUAL_RATE_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * An annual interest rate as the user typed it, or undefined if it is not one.
 *
 * The ONE place that decides what a rate is. The form, the preview, the card
 * editor, the repository and the import all ask it, because each getting its
 * own answer is how "1.2.3" passes one check and crashes the next: `Number`
 * rejects it, but a preview that skipped the check hands it straight to the
 * BigInt parser, which throws mid-render.
 *
 * Plain digits with at most one point - no sign, no exponent. `Number` alone
 * would accept "1e1", and a rate stored as "1e1" is ten percent to this code
 * and a mystery to anybody reading the export.
 */
export function normalizeAnnualRate(input: string): string | undefined {
  const trimmed = input.trim();
  if (!ANNUAL_RATE_RE.test(trimmed)) return undefined;
  const rate = decimalToRational(trimmed);
  return rate.n > BigInt(MAX_ANNUAL_RATE) * rate.d ? undefined : trimmed;
}
