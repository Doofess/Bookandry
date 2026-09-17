import {
  convertMinor,
  invertRate,
  isPositiveRate,
  rateDeviationExceeds,
  rateFromAmounts,
  toMinor,
} from '@/lib/money';
import type { Currency, LocalDate, Minor, RateSource, RateString } from '@/types/money';

/**
 * The rate half of the transaction form.
 *
 * Your decision - "use the rate at the time the expense was added and store it;
 * if online fetch it, if offline the user fills it in manually" - replaces §4's
 * entire offline-degradation machinery, and is strictly better: no `pending`
 * state, no `rateDate: "unknown"` (which breaks Zod's date regex, `parseISO`
 * and `Intl.DateTimeFormat` alike), no "Fix rates" flow, and above all no
 * `rateUsed = 1` fallback - which would have turned a 500 shekel expense into
 * $500 instead of $163.75, a 3.05x error in the large animated hero number.
 *
 * But "never fabricate a rate" is not the same as "never let them save", and
 * the difference is this module:
 *
 *  - The field is NEVER blank. A historical cache row never expires, so a stale
 *    `latest` table is still a perfectly good manual default. A hard block is
 *    reserved for a pair this install has genuinely never seen.
 *  - The rate can be entered as the CHARGED AMOUNT instead. One derived input,
 *    two ways in.
 *  - A rate entered backwards is caught, because the error is ~15x in the hero
 *    number and the direction of an exchange rate is genuinely ambiguous.
 */

/** Warn beyond this much drift from the last known rate. An exact fraction. */
const DEVIATION_WARN_NUMERATOR = 1n;
const DEVIATION_WARN_DENOMINATOR = 4n;

/** How close to `1/lastKnown` counts as "you typed this upside down". */
const INVERSION_NUMERATOR = 1n;
const INVERSION_DENOMINATOR = 20n;

/** A rate this install already knows, from the cache or from an existing row. */
export type KnownRate = {
  readonly rate: RateString;
  readonly rateDate: LocalDate;
  readonly rateSource: RateSource;
};

export type RateEntry = 'rate' | 'charged';

export type RateFieldInput = {
  readonly amount: string;
  readonly currency: Currency;
  readonly baseCurrency: Currency;
  /** What the user typed, in whichever field they last touched. */
  readonly rate: string;
  readonly charged: string;
  /** Which field is authoritative; the other is derived from it. */
  readonly entry: RateEntry;
  /** Prefill and sanity reference. Absent only for a genuinely unseen pair. */
  readonly known?: KnownRate;
};

export type RateProblem =
  /** No rate typed, and none to prefill: the one case that genuinely blocks. */
  | { readonly code: 'rate_required' }
  | { readonly code: 'rate_not_a_number' }
  | { readonly code: 'rate_not_positive' }
  | { readonly code: 'charged_not_positive' }
  /**
   * A rate cannot be derived from a charge until there is an amount to divide.
   *
   * Distinct from `rate_required` because it is NOT the user's problem to fix
   * here: the amount field is already asking for the amount, and repeating the
   * demand under the rate field tells them the same thing twice while pointing
   * at the wrong box. The UI renders nothing for it.
   */
  | { readonly code: 'awaiting_amount' };

export type RateWarning =
  /** The typed value is close to 1/known - almost certainly entered backwards. */
  | { readonly code: 'rate_inverted'; readonly suggestion: RateString }
  | { readonly code: 'rate_far_from_known'; readonly known: RateString; readonly on: LocalDate };

export type RateResolution =
  | { readonly status: 'same_currency' }
  | { readonly status: 'invalid'; readonly problem: RateProblem }
  | {
      readonly status: 'resolved';
      readonly rate: RateString;
      readonly chargedMinor: Minor;
      readonly rateDate: LocalDate;
      readonly rateSource: RateSource;
      readonly warnings: readonly RateWarning[];
    };

/**
 * Resolve the rate field pair into one rate and one charged amount.
 *
 * Whichever field the user last touched wins, and the other is computed from
 * it. Binding them both ways at once - each recomputing the other on change -
 * is the classic two-way-binding oscillation: a rounded derivation feeds back
 * into the field that produced it and the value creeps on every keystroke.
 */
export function resolveRate(input: RateFieldInput, today: LocalDate): RateResolution {
  if (input.currency === input.baseCurrency) return { status: 'same_currency' };

  const amountMinor = safeMinor(input.amount, input.currency);

  if (input.entry === 'charged') {
    const chargedMinor = safeMinor(input.charged, input.baseCurrency);
    if (chargedMinor === undefined || chargedMinor <= 0) {
      return { status: 'invalid', problem: { code: 'charged_not_positive' } };
    }
    if (amountMinor === undefined || amountMinor <= 0) {
      // The rate is a ratio of the two, so there is nothing to divide by yet.
      // Not a resolution, but not the rate field's complaint to make either.
      return { status: 'invalid', problem: { code: 'awaiting_amount' } };
    }
    const derived = rateFromAmounts(amountMinor, input.currency, chargedMinor, input.baseCurrency);
    return {
      status: 'resolved',
      rate: derived,
      chargedMinor,
      rateDate: today,
      // A charged amount carries the issuer's fee, so it is the user's own
      // figure even though they never typed a rate.
      rateSource: 'manual',
      warnings: warningsFor(derived, input.known),
    };
  }

  const typed = input.rate.trim();
  if (typed === '') {
    if (input.known === undefined) return { status: 'invalid', problem: { code: 'rate_required' } };
    return resolveWith(input.known.rate, input.known.rateDate, input.known.rateSource, input, amountMinor);
  }

  if (!isNumeric(typed)) return { status: 'invalid', problem: { code: 'rate_not_a_number' } };
  if (!isPositiveRate(typed)) return { status: 'invalid', problem: { code: 'rate_not_positive' } };

  /*
   * A typed rate is the user's own rate even when it equals the cached one.
   *
   * Recording it as `frankfurter` because the digits happen to match would put
   * it into the reconvert prefetch, and a later base-currency change would
   * then silently overwrite a figure they chose deliberately.
   */
  const known = input.known;
  const unchanged = known !== undefined && sameRate(typed, known.rate);
  const source: RateSource = unchanged ? known.rateSource : 'manual';
  const date = unchanged ? known.rateDate : today;

  return resolveWith(typed, date, source, input, amountMinor);
}

function resolveWith(
  rate: RateString,
  rateDate: LocalDate,
  rateSource: RateSource,
  input: RateFieldInput,
  amountMinor: Minor | undefined,
): RateResolution {
  return {
    status: 'resolved',
    rate,
    chargedMinor:
      amountMinor === undefined || amountMinor <= 0
        ? 0
        : convertMinor(amountMinor, input.currency, input.baseCurrency, rate),
    rateDate,
    rateSource,
    warnings: warningsFor(rate, input.known),
  };
}

function warningsFor(rate: RateString, known: KnownRate | undefined): RateWarning[] {
  if (known === undefined) return [];
  if (sameRate(rate, known.rate)) return [];

  const inverted = invertRate(known.rate);
  if (!rateDeviationExceeds(rate, inverted, INVERSION_NUMERATOR, INVERSION_DENOMINATOR)) {
    /*
     * Inversion is checked BEFORE the deviation band, and reported instead of
     * it. A backwards rate is always also far from the known one, so reporting
     * both would bury the actionable message ("did you mean 3.95?") under the
     * vague one ("this looks unusual").
     */
    return [{ code: 'rate_inverted', suggestion: known.rate }];
  }

  if (rateDeviationExceeds(rate, known.rate, DEVIATION_WARN_NUMERATOR, DEVIATION_WARN_DENOMINATOR)) {
    return [{ code: 'rate_far_from_known', known: known.rate, on: known.rateDate }];
  }
  return [];
}

/**
 * The charged amount implied by the rate, in minor units of the base currency.
 *
 * Returns undefined rather than 0 when there is nothing to derive from: an
 * input pre-filled with a zero reads as a real charge of nothing.
 */
export function chargedFor(
  amount: string,
  currency: Currency,
  baseCurrency: Currency,
  rate: RateString,
): Minor | undefined {
  if (currency === baseCurrency) return undefined;
  const amountMinor = safeMinor(amount, currency);
  if (amountMinor === undefined || amountMinor <= 0) return undefined;
  if (!isPositiveRate(rate)) return undefined;
  return convertMinor(amountMinor, currency, baseCurrency, rate);
}

/**
 * Whether an edit must re-derive the stored rate.
 *
 * §4 as written re-converts at TODAY'S rate whenever the amount changes, so
 * fixing a typo in a 2024 row quietly rewrites that row's history at 2026
 * prices. The rate belongs to the (currency, date, baseCurrency) triple and to
 * nothing else - correcting 45 euros to 54 does not change what a euro was
 * worth that day.
 */
export function needsRestamp(
  previous: { readonly currency: Currency; readonly date: LocalDate; readonly baseCurrency: Currency },
  next: { readonly currency: Currency; readonly date: LocalDate; readonly baseCurrency: Currency },
): boolean {
  return (
    previous.currency !== next.currency ||
    previous.date !== next.date ||
    previous.baseCurrency !== next.baseCurrency
  );
}

/**
 * The prefill, in preference order.
 *
 * A quote for the exact date wins; failing that, ANY rate this install has for
 * the pair, with its own date carried along so the field can say "Rate from
 * 14 Sep - tap to change" rather than presenting a stale number as current.
 */
export function prefillRate(
  onDate: KnownRate | undefined,
  lastKnown: KnownRate | undefined,
): KnownRate | undefined {
  return onDate ?? lastKnown;
}

/** Digits with at most one separator and no sign: rates are positive quantities. */
function isNumeric(value: string): boolean {
  return /^\d+([.,]\d+)?$/.test(value.trim());
}

function sameRate(a: RateString, b: RateString): boolean {
  return !rateDeviationExceeds(a, b, 0n, 1n);
}

function safeMinor(display: string, currency: Currency): Minor | undefined {
  if (display.trim() === '') return undefined;
  try {
    const minor = toMinor(display, currency);
    return Number.isSafeInteger(minor) ? minor : undefined;
  } catch {
    return undefined;
  }
}
