import { addMonthsClamped, compareLocal, parseLocalDate, startOfMonth } from '@/lib/dates';
import { addRates, normalizeAnnualRate, normalizeRateMargin } from '@/lib/money';
import type { Occurrence, PaymentMethod, RateTerm } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

import { isInstallmentPlan } from './tx-edit';

/**
 * Credit cards as an Israeli card company runs them.
 *
 * A card does not take money out of the bank when something is bought with
 * it. It collects a month's purchases and the bank pays them all at once, on
 * the card's billing day (מועד חיוב) of the following month - usually the
 * 2nd, the 10th or the 15th. An instalment payment is a purchase of its own
 * month and goes on that month's bill.
 *
 * Only for a card with a billing day: without one there is nothing to move,
 * and a card set up before billing days existed behaves exactly as it did.
 */

/** The currency an Israeli card bills in. */
export const CARD_CURRENCY: Currency = 'ILS';

/** The billing days Israeli card companies offer; any day can still be typed. */
export const COMMON_BILLING_DAYS = [2, 10, 15] as const;

/** A card that collects its purchases into a monthly bill, and its billing day. */
export function billingDayOf(method: PaymentMethod | undefined): number | undefined {
  if (method?.type !== 'credit_card') return undefined;
  const day = method.card?.billingDay;
  return day !== undefined && Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
}

/** The day a purchase made on `date` is debited: the billing day of the next month. */
export function chargeDate(date: LocalDate, billingDay: number): LocalDate {
  return addMonthsClamped(startOfMonth(date), 1, billingDay);
}

/**
 * When an occurrence's money actually leaves the bank: on its card's next
 * bill, or on its own date for anything not paid by a billing card.
 */
export function settleDate(
  occurrence: Pick<Occurrence, 'date' | 'paymentMethodId'>,
  methods: ReadonlyMap<string, PaymentMethod>,
): LocalDate {
  const id = occurrence.paymentMethodId;
  const day = id === undefined ? undefined : billingDayOf(methods.get(id));
  return day === undefined ? occurrence.date : chargeDate(occurrence.date, day);
}

/** A rate term's annual rate today, or undefined while it is not a readable one. */
export function rateOf(term: RateTerm, primeRate: string): string | undefined {
  if (term.basis === 'fixed') return normalizeAnnualRate(term.rate);
  const margin = normalizeRateMargin(term.margin);
  const prime = normalizeAnnualRate(primeRate);
  return margin === undefined || prime === undefined
    ? undefined
    : normalizeAnnualRate(addRates(prime, margin));
}

/** The card's קרדיט rate: prime plus its margin, or the fixed rate. '' for none. */
export function cardCreditRate(method: PaymentMethod | undefined, primeRate: string): string {
  if (method === undefined) return '';
  const margin = method.card?.creditPrimeMargin;
  if (margin !== undefined) return rateOf({ basis: 'prime', margin }, primeRate) ?? '';
  return method.creditAnnualRate ?? '';
}

/**
 * The foreign-currency fee a purchase in `currency` pays on this card, or
 * undefined: only a credit card charges one, and only off the shekel.
 */
export function fxFeeFor(method: PaymentMethod | undefined, currency: Currency): string | undefined {
  if (method?.type !== 'credit_card' || currency === CARD_CURRENCY) return undefined;
  const fee = method.card?.fxFeeRate;
  return fee === undefined || normalizeAnnualRate(fee) === undefined || Number(fee) === 0 ? undefined : fee;
}

export type CardBill = {
  /** The day it is debited. */
  readonly chargeDate: LocalDate;
  /** The month whose purchases it collects. */
  readonly month: LocalDate;
  readonly totalMinor: Minor;
  readonly occurrences: readonly Occurrence[];
};

/**
 * A card's bills, from its occurrences: one per billing day, newest first.
 * Skipped occurrences are not charged and are left out.
 */
export function cardBills(occurrences: readonly Occurrence[], card: PaymentMethod): CardBill[] {
  const day = billingDayOf(card);
  if (day === undefined) return [];
  const bills = new Map<LocalDate, Occurrence[]>();
  for (const occurrence of occurrences) {
    if (occurrence.paymentMethodId !== card.id || occurrence.isSkipped) continue;
    if (occurrence.transaction.kind !== 'expense') continue;
    const charge = chargeDate(occurrence.date, day);
    const list = bills.get(charge);
    if (list === undefined) bills.set(charge, [occurrence]);
    else list.push(occurrence);
  }
  return [...bills.entries()]
    .map(([charge, list]) => ({
      chargeDate: charge,
      month: startOfMonth(addMonthsClamped(charge, -1, 1)),
      totalMinor: list.reduce((sum, o) => sum + o.money.baseAmountMinor, 0),
      occurrences: [...list].sort((a, b) => compareLocal(b.date, a.date)),
    }))
    .sort((a, b) => compareLocal(b.chargeDate, a.chargeDate));
}

/**
 * How much of the credit limit is taken: everything bought and not yet
 * debited, and every payment still to come on an instalment plan - the card
 * company holds the whole plan against the limit from the day of purchase.
 * A standing order's future months are not purchases yet, and are not counted.
 */
export function limitUsedMinor(
  occurrences: readonly Occurrence[],
  card: PaymentMethod,
  today: LocalDate,
): Minor {
  const day = billingDayOf(card);
  if (day === undefined) return 0;
  return occurrences
    .filter(
      (o) =>
        o.paymentMethodId === card.id &&
        !o.isSkipped &&
        o.transaction.kind === 'expense' &&
        compareLocal(chargeDate(o.date, day), today) > 0 &&
        (compareLocal(o.date, today) <= 0 || isInstallmentPlan(o.transaction.recurrence)),
    )
    .reduce((sum, o) => sum + o.money.baseAmountMinor, 0);
}

export type ExpiryStatus = 'expired' | 'soon' | 'valid';

/** Expired after its printed month; "soon" in its last two months, when the new one should be on its way. */
export function expiryStatus(expiresMonth: string | undefined, today: LocalDate): ExpiryStatus | undefined {
  if (expiresMonth === undefined || !isExpiresMonth(expiresMonth)) return undefined;
  const { year, month } = parseLocalDate(today);
  const [y, m] = expiresMonth.split('-').map(Number) as [number, number];
  const monthsLeft = (y - year) * 12 + (m - month);
  if (monthsLeft < 0) return 'expired';
  return monthsLeft <= 1 ? 'soon' : 'valid';
}

/** A YYYY-MM month as the card prints it, in a sane range. */
export function isExpiresMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

/**
 * Which occurrences have left the bank by `today` - by when they are debited,
 * not when they were bought - and the card purchases still waiting for their
 * bill. Each profile's opening-balance date applies to its own rows, by the
 * same debit date: a purchase from before it that is charged after it is
 * money that leaves the account after it.
 */
export function splitBySettlement(
  occurrences: readonly Occurrence[],
  methods: ReadonlyMap<string, PaymentMethod>,
  today: LocalDate,
  cutoffs: ReadonlyMap<string, LocalDate>,
): { readonly settled: Occurrence[]; readonly pendingOnCards: Occurrence[] } {
  const settled: Occurrence[] = [];
  const pendingOnCards: Occurrence[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.isSkipped) continue;
    const settles = settleDate(occurrence, methods);
    const cutoff = cutoffs.get(occurrence.transaction.profileId);
    if (cutoff !== undefined && compareLocal(settles, cutoff) < 0) continue;
    if (compareLocal(settles, today) <= 0) settled.push(occurrence);
    else if (compareLocal(occurrence.date, today) <= 0) pendingOnCards.push(occurrence);
  }
  return { settled, pendingOnCards };
}
