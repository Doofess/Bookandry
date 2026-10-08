import type { ResolvedCard } from '@/data/card-catalog/resolve';
import {
  addMonthsClamped,
  compareLocal,
  days360,
  daysBetween,
  parseLocalDate,
  startOfMonth,
} from '@/lib/dates';
import { normalizeAnnualRate, requestDatePrincipal } from '@/lib/money';
import type { PaymentMethod, Recurrence, Transaction } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

import { cardDealRate } from './card-catalog-link';
import { billingDayOf, chargeDate } from './cards';
import { dealSchedule, rateOfTerm, type DealSchedule } from './deal-rules';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS } from './tx-form';

/*
 * Splitting a purchase after the fact (Max's חלוקת עסקה, Isracard's and
 * Amex's העברה לקרדיט): an ordinary purchase already saved becomes a קרדיט
 * plan in place. Interest runs from the day the split is asked for; the first
 * payment is the card's next bill - or, once the purchase has been billed, the
 * bill after that.
 *
 * Pure: the resolved card comes from the caller, which loads the catalog.
 */

export type SplitRule = ResolvedCard['deals'][number];

/**
 * The card's split rule, when this row can be split: a saved, one-time
 * expense (a 30+ purchase is a deal of its own already) charged to a card
 * linked to the catalog whose company splits purchases (`method` is the card
 * it is charged to). Undefined otherwise, and while the catalog has not loaded.
 */
export function splitRuleFor(
  tx: Transaction,
  method: PaymentMethod | undefined,
  resolved: ResolvedCard | undefined,
): SplitRule | undefined {
  if (tx.kind !== 'expense' || tx.isDeleted === 1 || tx.recurrence.type !== 'one_time') return undefined;
  if (tx.deferral !== undefined || resolved === undefined) return undefined;
  if (method?.card?.catalog === undefined) return undefined;
  return resolved.deals.find((d) => d.kind === 'split_purchase');
}

/** The card's split rate today, as the sheet's rate field holds it, and whether nobody has given one. */
export function splitRate(
  method: PaymentMethod | undefined,
  resolved: ResolvedCard | undefined,
  prime: { readonly primeRate: string; readonly boiRate: string },
): { readonly rate: string; readonly missing: boolean } {
  const card = method?.card;
  const found =
    card === undefined || resolved === undefined ? undefined : cardDealRate(card, resolved, 'split_purchase');
  const rate = found?.term == null ? undefined : rateOfTerm(found.term, prime);
  return rate === undefined ? { rate: '', missing: true } : { rate, missing: false };
}

/**
 * Whether the menu offers a split for this row: ready, with the card's rule
 * and billing day; or held back until the card has a billing day, which is
 * what dates the first payment (without one, the payments would be planned
 * from the purchase's own date - for an older purchase, already in the past);
 * or not at all (`splitRuleFor`).
 */
export type SplitAvailability =
  | { readonly kind: 'ready'; readonly rule: SplitRule; readonly billingDay: number }
  | { readonly kind: 'needs_billing_day' };

export function splitAvailability(
  tx: Transaction,
  method: PaymentMethod | undefined,
  resolved: ResolvedCard | undefined,
): SplitAvailability | undefined {
  const rule = splitRuleFor(tx, method, resolved);
  if (rule === undefined) return undefined;
  const billingDay = billingDayOf(method);
  return billingDay === undefined ? { kind: 'needs_billing_day' } : { kind: 'ready', rule, billingDay };
}

export type SplitTiming = {
  /** The plan's first occurrence: in the month before the bill that charges it. */
  readonly planDate: LocalDate;
  /** The bill that charges the first payment: always after today. */
  readonly firstCharge: LocalDate;
  /** The purchase's own bill has already been charged. */
  readonly billed: boolean;
};

/**
 * When a split purchase is paid. Not billed yet, its own bill carries the
 * first payment and the purchase stays where it is. Billed, the first payment
 * is the bill after the next one, and the plan moves to the month before it,
 * keeping the purchase's day.
 */
export function splitTiming(date: LocalDate, billingDay: number, today: LocalDate): SplitTiming {
  const own = chargeDate(date, billingDay);
  const billed = compareLocal(own, today) <= 0;
  let firstCharge = own;
  if (billed) {
    // The next bill strictly after today, then the one after it.
    const thisMonth = addMonthsClamped(startOfMonth(today), 0, billingDay);
    const next =
      compareLocal(thisMonth, today) > 0 ? thisMonth : addMonthsClamped(startOfMonth(today), 1, billingDay);
    firstCharge = addMonthsClamped(startOfMonth(next), 1, billingDay);
  }
  return {
    planDate: addMonthsClamped(startOfMonth(firstCharge), -1, parseLocalDate(date).day),
    firstCharge,
    billed,
  };
}

/** A split's schedule: the plan's, and what the purchase will owe a regular month before its first payment. */
export type SplitSchedule = DealSchedule & {
  /** The principal the plan is priced on (`requestDatePrincipal`), kept so payment 19 re-prices from it. */
  readonly principalMinor: Minor;
};

/**
 * The split's schedule, as `dealSchedule` gives a קרדיט's, with interest from
 * the day of the request: a Spitzer schedule on what the purchase will owe a
 * regular month before the first payment (`requestDatePrincipal`), its
 * interest counted against the purchase itself. The days are the rate's own -
 * 30/360 or actual/365. Undefined while it is not a plan - and for a first
 * payment that is not after today, which no split may have.
 */
export function splitSchedule(input: {
  readonly principalMinor: Minor;
  /** The annual nominal rate, normalized. */
  readonly rate: string;
  readonly count: number;
  readonly today: LocalDate;
  readonly firstCharge: LocalDate;
  readonly dayCount: '30/360' | 'actual/365';
  readonly compounding: 12 | 4;
  /** Where the deal re-prices with prime (Max: 19). */
  readonly resetAt?: number | undefined;
  readonly primeRate: string;
}): SplitSchedule | undefined {
  const { principalMinor: principal, rate, count, firstCharge, today } = input;
  if (principal <= 0 || compareLocal(firstCharge, today) <= 0) return undefined;
  const accrued =
    input.dayCount === '30/360'
      ? requestDatePrincipal(principal, rate, days360(today, firstCharge), 360)
      : requestDatePrincipal(principal, rate, daysBetween(today, firstCharge), 365);
  const plan = dealSchedule({
    principalMinor: accrued,
    rate,
    count,
    maxCount: MAX_INSTALLMENTS,
    compounding: input.compounding,
    reset: input.resetAt === undefined ? undefined : { atPayment: input.resetAt },
    primeRate: input.primeRate,
  });
  return plan === undefined
    ? undefined
    : {
        ...plan,
        interestMinor: Math.max(0, plan.interestMinor + accrued - principal),
        principalMinor: accrued,
      };
}

/**
 * The recurrence a split purchase becomes: a קרדיט plan from `planDate`, at
 * the split's rate snapshotted, and - where the deal re-prices with prime and
 * the plan reaches that payment - prime today and the principal it was priced
 * on, to re-price it by.
 */
export function splitRecurrence(input: {
  readonly planDate: LocalDate;
  readonly count: number;
  readonly rate: string;
  readonly resetAt?: number | undefined;
  readonly primeRate: string;
  /** `SplitSchedule.principalMinor`. */
  readonly principalMinor?: Minor | undefined;
}): Recurrence {
  const rate = normalizeAnnualRate(input.rate);
  const prime = normalizeAnnualRate(input.primeRate);
  const at = input.resetAt;
  const resets = at !== undefined && at <= input.count && rate !== undefined && prime !== undefined;
  const principal = input.principalMinor;
  return {
    type: 'monthly',
    dayOfMonth: parseLocalDate(input.planDate).day,
    installments: input.count,
    plan: 'credit',
    ...(rate === undefined ? {} : { creditAnnualRate: rate }),
    ...(resets
      ? {
          reset: {
            atPayment: at,
            primeAtPurchase: prime,
            ...(principal === undefined ? {} : { principalMinor: principal }),
          },
        }
      : {}),
  };
}

/** Whether a payment count is one a split can have at all; the card's own range is a warning. */
export function isSplitCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS;
}
