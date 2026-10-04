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

/** How a statement writes its decimal point, when a column has already shown which. */
export type DecimalMark = '.' | ',';

const STATEMENT_NOISE = /[\u200E\u200F\u061C\u2066-\u2069\u202A-\u202E\s\u00A0\u202F]/g;

/**
 * An amount as a bank, card company or wallet printed it, in minor units -
 * signed, so a credit or a refund comes back negative - or undefined when the
 * text cannot be read without guessing.
 *
 * Stricter than `normalizeAmountInput`, which serves a person typing into the
 * form and may read "0,5" as a half. A statement is read by a machine and
 * nobody is there to see the guess:
 *  - "-150", "150-", "(150)" and "−150" are all negative; the currency, the
 *    bidi marks a Hebrew page carries and any spaces are ignored.
 *  - With both separators the last one is the decimal point ("1.234,56").
 *  - One separator used more than once groups thousands ("1,234,567").
 *  - A lone "," before exactly three digits groups ("1,234" is 1,234), and a
 *    lone "." before exactly three digits is ambiguous in a two-decimal
 *    currency - 1.234 or 1,234? - and is refused rather than guessed.
 *  - More decimals than the currency has are refused, never rounded.
 * A `decimal` mark already known for the column (a spreadsheet's) decides
 * instead of all that.
 */
export function parseStatementAmount(
  text: string,
  currency: Currency,
  decimal?: DecimalMark,
): Minor | undefined {
  let body = text.replace(STATEMENT_NOISE, '').replace(/\u2212/g, '-');
  let negative = false;
  if (/^\(.*\)$/.test(body)) {
    negative = true;
    body = body.slice(1, -1);
  }
  body = body.replace(/^[^\d.,+-]+|[^\d.,+-]+$/g, '');
  if (body.startsWith('-') || body.endsWith('-')) {
    negative = true;
    body = body.startsWith('-') ? body.slice(1) : body.slice(0, -1);
  } else if (body.startsWith('+')) {
    body = body.slice(1);
  }
  body = body.replace(/^[^\d.,]+|[^\d.,]+$/g, '');
  if (!/^[\d.,]*\d[\d.,]*$/.test(body)) return undefined;

  const exponent = exponentOf(currency);
  const mark = decimal ?? decimalMarkOf(body, exponent);
  if (mark === null) return undefined;
  // The other separator groups thousands; with no decimal point, whichever one is there.
  const group = mark === '.' ? ',' : mark === ',' ? '.' : body.includes(',') ? ',' : '.';
  const point = mark === undefined ? -1 : body.lastIndexOf(mark);
  if (mark !== undefined && body.indexOf(mark) !== point) return undefined;
  // ".5" is half: an empty whole part is zero.
  const whole = point === -1 ? body : body.slice(0, point) || '0';
  const frac = point === -1 ? '' : body.slice(point + 1);
  if (frac.includes(group) || frac.length > exponent) return undefined;
  const grouped = group === ',' ? /^\d{1,3}(,\d{3})+$/ : /^\d{1,3}(\.\d{3})+$/;
  if (!(/^\d+$/.test(whole) || grouped.test(whole))) return undefined;

  const minor =
    BigInt(whole.split(group).join('')) * 10n ** BigInt(exponent) +
    (frac === '' ? 0n : BigInt(frac.padEnd(exponent, '0')));
  return toSafeNumber(negative ? -minor : minor);
}

/**
 * Which separator is the decimal point in a statement amount: '.' or ',',
 * undefined for none, or null when it cannot be told.
 */
function decimalMarkOf(body: string, exponent: number): DecimalMark | undefined | null {
  const commas = body.split(',').length - 1;
  const dots = body.split('.').length - 1;
  if (commas === 0 && dots === 0) return undefined;
  if (commas > 0 && dots > 0) return body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.';
  const mark: DecimalMark = commas > 0 ? ',' : '.';
  // Used more than once, it can only be grouping thousands.
  if (commas + dots > 1) return undefined;
  const after = body.length - body.indexOf(mark) - 1;
  if (after !== 3) return mark;
  if (mark === ',') return exponent === 3 ? null : undefined;
  if (exponent === 3) return '.';
  return exponent === 0 ? undefined : null;
}

/**
 * A spreadsheet's numeric cell in minor units, rounded once. The cell is a
 * double already - this is where its binary noise (1234.5000000001) stops.
 */
export function minorFromNumber(value: number, currency: Currency): Minor | undefined {
  if (!Number.isFinite(value)) return undefined;
  const { n, d } = decimalToRational(String(value));
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
 * The part of an amount that covers `part` of `whole` days: a ₪300 monthly
 * charge started with 15 days of a 30-day month left costs ₪150 for them.
 * One multiplication, one division, rounded once - half away from zero, as
 * everywhere here - so it is never an agora out.
 */
export function prorateMinor(minor: Minor, part: number, whole: number): Minor {
  if (!Number.isSafeInteger(minor)) throw new RangeError('minor must be a safe integer');
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(whole) || whole <= 0 || part < 0 || part > whole) {
    throw new RangeError(`cannot take ${String(part)} of ${String(whole)}`);
  }
  return toSafeNumber(divRound(BigInt(minor) * BigInt(part), BigInt(whole)));
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

/**
 * What a run of monthly payments is worth today at an annual rate: each one
 * discounted by the months until it falls due, the first a month away.
 *
 *   PV = Σ p_j / (1+r)^j,  j = 1..m,  r = annual / 12
 *
 * Applied to the payments a לוח שפיצר still has to go, it is the principal
 * still owed - the balance an issuer quotes for paying a plan off early - so
 * what is left of the payments minus it is the interest still in them. That
 * holds without knowing what the plan was first priced at, which is not
 * stored: only what it charges is.
 *
 * Exact, with one rounding, like `spitzerPayment`: (1+r)^j = (b+a)^j / b^j
 * puts every term over (b+a)^m, and the numerator is built in one pass.
 */
export function presentValueMinor(paymentsMinor: readonly Minor[], annualRatePercent: string): Minor {
  for (const payment of paymentsMinor) {
    if (!Number.isSafeInteger(payment) || payment < 0) {
      throw new RangeError('payments must be non-negative safe integers');
    }
  }
  const rate = decimalToRational(annualRatePercent);
  if (rate.n < 0n) throw new RangeError('interest rate cannot be negative');
  const total = paymentsMinor.reduce((sum, payment) => sum + BigInt(payment), 0n);
  if (rate.n === 0n || paymentsMinor.length === 0) return toSafeNumber(total);

  const a = rate.n;
  const b = rate.d * 1200n;
  const grown = b + a;
  // Σ p_j · b^j · (b+a)^(m-j), by Horner's rule over (b+a).
  let numerator = 0n;
  let bPower = 1n;
  for (const payment of paymentsMinor) {
    bPower *= b;
    numerator = numerator * grown + BigInt(payment) * bPower;
  }
  return toSafeNumber(divRound(numerator, grown ** BigInt(paymentsMinor.length)));
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

const RATE_MARGIN_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * A margin over prime as typed - "1.5", "+2", "-0.4" - or undefined if it is
 * not one. Empty is no margin at all: a loan at prime.
 *
 * Signed, unlike a rate: a mortgage track at prime minus half a point is
 * ordinary. No exponent, for the same reason a rate has none.
 */
export function normalizeRateMargin(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return '0';
  if (!RATE_MARGIN_RE.test(trimmed)) return undefined;
  const margin = decimalToRational(trimmed);
  const size = margin.n < 0n ? -margin.n : margin.n;
  if (size > BigInt(MAX_ANNUAL_RATE) * margin.d) return undefined;
  return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
}

/**
 * Two rates added exactly, as a plain decimal string: prime at 4.75 with a
 * margin of -0.4 is "4.35", never 4.3500000000000005.
 */
export function addRates(a: string, b: string): string {
  const x = decimalToRational(a);
  const y = decimalToRational(b);
  // Both denominators are powers of ten, so the larger is a common one.
  const d = x.d > y.d ? x.d : y.d;
  const n = x.n * (d / x.d) + y.n * (d / y.d);
  const places = d.toString().length - 1;
  const digits = (n < 0n ? -n : n).toString().padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const fraction = digits.slice(digits.length - places).replace(/0+$/, '');
  return (n < 0n ? '-' : '') + whole + (fraction === '' ? '' : `.${fraction}`);
}

/**
 * An amount with a percentage fee added - a card's foreign-currency fee:
 * ₪100.00 at 2.5% is ₪102.50. Exact, and rounded once (half away from zero).
 */
export function addPercentFee(minor: Minor, percent: string): Minor {
  return minor + percentOf(minor, percent);
}

/** A percentage of an amount, exact and rounded once: 2.5% of ₪100.00 is ₪2.50. */
export function percentOf(minor: Minor, percent: string): Minor {
  const rate = decimalToRational(percent);
  return toSafeNumber(divRound(BigInt(minor) * rate.n, rate.d * 100n));
}
