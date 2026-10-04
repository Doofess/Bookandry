import { addMonthsClamped, compareLocal, endOfMonth, parseLocalDate, startOfMonth } from '@/lib/dates';
import { addRates, normalizeAnnualRate, normalizeRateMargin, percentOf } from '@/lib/money';
import {
  SHARED_OWNER,
  type Occurrence,
  type PaymentMethod,
  type RateTerm,
  type Transaction,
} from '@/types/domain';
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

/** The series id every card-fee line carries: `cardfee:<card id>`. */
export const CARD_FEE_PREFIX = 'cardfee:';

/** The built-in category card fees are filed under. */
export const CARD_FEES_CATEGORY_ID = 'cat.cardFees';

/** Whether an occurrence is a card's monthly fee - worked out, not a row anyone saved. */
export function isCardFee(occurrence: Pick<Occurrence, 'seriesId'>): boolean {
  return occurrence.seriesId.startsWith(CARD_FEE_PREFIX);
}

export type CardFeeMonth = {
  /** What the bill charges for the card this month. */
  readonly feeMinor: number;
  /** The fee before any discount. */
  readonly fullMinor: number;
  /** What was spent on the card that month, which the discount is earned by. */
  readonly spentMinor: number;
  /** The month's discount terms, when they apply to it at all (earned or not). */
  readonly discount?: { readonly minSpendMinor: number; readonly percent: string; readonly earned: boolean };
};

/**
 * A card's fee for one month: the full fee, or less in a month the card was
 * used enough to earn its discount - while the discount lasts. Undefined for
 * a card without a fee, or a month before the fee was set.
 */
export function cardFeeFor(
  card: PaymentMethod,
  month: LocalDate,
  occurrences: readonly Occurrence[],
): CardFeeMonth | undefined {
  const fee = card.card?.monthlyFeeMinor;
  const since = card.card?.feeSince;
  if (card.type !== 'credit_card' || fee === undefined || fee <= 0) return undefined;
  const key = month.slice(0, 7);
  if (since !== undefined && key < since) return undefined;

  const spentMinor = occurrences
    .filter(
      (o) =>
        o.paymentMethodId === card.id &&
        !o.isSkipped &&
        !isCardFee(o) &&
        o.transaction.kind === 'expense' &&
        o.date.slice(0, 7) === key,
    )
    .reduce((sum, o) => sum + o.money.baseAmountMinor, 0);

  const terms = card.card?.feeDiscount;
  if (terms === undefined || (terms.until !== undefined && key > terms.until)) {
    return { feeMinor: fee, fullMinor: fee, spentMinor };
  }
  const earned = spentMinor >= terms.minSpendMinor;
  return {
    feeMinor: earned ? Math.max(0, fee - percentOf(fee, terms.percent)) : fee,
    fullMinor: fee,
    spentMinor,
    discount: { minSpendMinor: terms.minSpendMinor, percent: terms.percent, earned },
  };
}

/**
 * Every card's monthly fee as a line on the card, one per month in
 * [from, to] - dated the month's last day, so it rides on that month's bill
 * like any purchase - computed from the purchases in `occurrences`.
 *
 * Only in a shekel base: the fee is in shekels and nothing converts it here.
 * A shared card's fee belongs to no one profile, so it is in the household's
 * view (`profileId` ALL) only. A waived month has no line at all.
 */
export function cardFeeOccurrences(input: {
  readonly cards: readonly PaymentMethod[];
  readonly occurrences: readonly Occurrence[];
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly today: LocalDate;
  readonly baseCurrency: Currency;
  /** The profile being looked at, or ALL. */
  readonly profileId: string;
  readonly allProfiles: string;
}): Occurrence[] {
  if (input.baseCurrency !== CARD_CURRENCY) return [];
  const out: Occurrence[] = [];
  for (const card of input.cards) {
    if (input.profileId !== input.allProfiles && card.profileId !== input.profileId) continue;
    if (card.profileId === SHARED_OWNER && input.profileId !== input.allProfiles) continue;
    const fee = card.card?.monthlyFeeMinor;
    if (card.type !== 'credit_card' || card.isArchived === 1 || fee === undefined || fee <= 0) continue;

    for (
      let month = startOfMonth(input.from);
      compareLocal(month, input.to) <= 0;
      month = addMonthsClamped(month, 1, 1)
    ) {
      const date = endOfMonth(month);
      if (compareLocal(date, input.from) < 0 || compareLocal(date, input.to) > 0) continue;
      const charge = cardFeeFor(card, month, input.occurrences);
      if (charge === undefined || charge.feeMinor === 0) continue;
      out.push(feeOccurrence(card, date, charge.feeMinor, input.today));
    }
  }
  return out;
}

function feeOccurrence(card: PaymentMethod, date: LocalDate, feeMinor: number, today: LocalDate): Occurrence {
  const id = `${CARD_FEE_PREFIX}${card.id}`;
  const money = {
    amountMinor: feeMinor,
    currency: CARD_CURRENCY,
    baseCurrency: CARD_CURRENCY,
    baseAmountMinor: feeMinor,
    rateUsed: '1',
    rateDate: date,
    rateSource: 'manual' as const,
  };
  const transaction: Transaction = {
    id,
    profileId: card.profileId,
    kind: 'expense',
    categoryId: CARD_FEES_CATEGORY_ID,
    paymentMethodId: card.id,
    money,
    recurrence: { type: 'one_time' },
    date,
    note: card.label,
    seriesStart: date,
    seriesEnd: date,
    isDeleted: 0,
    seriesRootId: id,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
  return {
    transaction,
    seriesId: id,
    date,
    originalDate: date,
    key: `${id}@${date}`,
    money,
    categoryId: CARD_FEES_CATEGORY_ID,
    paymentMethodId: card.id,
    note: card.label,
    isOverridden: false,
    isMoved: false,
    isSkipped: false,
    isProjected: compareLocal(date, today) > 0,
  };
}
