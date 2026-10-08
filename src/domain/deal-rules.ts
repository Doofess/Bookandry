import type { ResolvedCard } from '@/data/card-catalog/resolve';
import type { DealRule } from '@/data/card-catalog/types';
import {
  addRates,
  annualEffectiveRate,
  creditSchedule,
  longCreditPayments,
  normalizeAnnualRate,
  resetRate,
} from '@/lib/money';
import type { CardRateTerm, DealKind, PaymentMethod } from '@/types/domain';
import type { Kind, Minor } from '@/types/money';

import { cardDealRate } from './card-catalog-link';
import { cardCreditRate, rateOf } from './cards';
import { chargesInterest, MIN_INSTALLMENTS, type RecurrenceMode } from './tx-form';

/*
 * The purchase form, card-aware: which deals a card linked to the catalog
 * offers, what each is priced at, and which of its rules a purchase breaks.
 *
 * Pure. The resolved card comes from the caller (`resolveCard` over
 * `loadCatalog()`), so nothing here pulls catalog data into the main chunk;
 * and every rule broken is a warning, never a refusal - the store or the card
 * company may know better.
 */

export type DealWarning = {
  readonly code: 'min_deal' | 'min_payment' | 'payments' | 'abroad';
  /** Amounts in minor units (ILS), counts as numbers. */
  readonly values: Readonly<Record<string, string | number>>;
};

/**
 * The deal's rules a purchase breaks: its minimum deal, its minimum payment
 * (the higher one from `minPaymentFrom` payments up), its payment range, and
 * whether it is offered abroad - in that order. A payment is under the minimum
 * when the purchase does not cover the minimum that many times: the smallest
 * payment of a split is the total over the count, rounded down.
 */
export function dealWarnings(
  rule: DealRule,
  input: { readonly amountMinor: number; readonly payments: number; readonly abroad: boolean },
): readonly DealWarning[] {
  const out: DealWarning[] = [];
  if (rule.minDealMinor !== undefined && input.amountMinor < rule.minDealMinor) {
    out.push({ code: 'min_deal', values: { min: rule.minDealMinor } });
  }
  const from = rule.minPaymentFrom;
  const minPayment =
    from !== undefined && input.payments >= from.payments ? from.minPaymentMinor : rule.minPaymentMinor;
  if (minPayment !== undefined && input.amountMinor < minPayment * input.payments) {
    out.push({ code: 'min_payment', values: { min: minPayment } });
  }
  const range = rule.payments;
  if (range !== undefined && (input.payments < range.min || input.payments > range.max)) {
    out.push({ code: 'payments', values: { min: range.min, max: range.max } });
  }
  if (input.abroad && !rule.abroad) out.push({ code: 'abroad', values: {} });
  return out;
}

/** The form's purchase modes and the catalog deal each one is, in the order they are offered. */
const PURCHASE_DEALS: readonly (readonly [RecurrenceMode, DealKind])[] = [
  ['one_time', 'regular'],
  ['installments', 'installments'],
  ['credit', 'credit'],
  ['long_credit', 'long_credit'],
  ['deferred', 'deferred'],
];

/** The catalog deal a form mode is, or undefined for one that is no card deal (a loan, a standing order). */
export function dealKindOf(mode: RecurrenceMode): DealKind | undefined {
  return PURCHASE_DEALS.find(([m]) => m === mode)?.[1];
}

/** The card's rule for a mode, or undefined: no linked card, or a deal it does not have. */
export function dealRuleFor(
  resolved: ResolvedCard | undefined,
  mode: RecurrenceMode,
): ResolvedCard['deals'][number] | undefined {
  const kind = dealKindOf(mode);
  return kind === undefined ? undefined : resolved?.deals.find((d) => d.kind === kind);
}

/**
 * The form's choices. Income repeats; an expense on no card, or a card not
 * linked to the catalog, is today's list. A linked card offers its own deals -
 * רגילה, תשלומים, קרדיט, קרדיט פלוס, 30+, as many as it has - and then a
 * standing order and a loan, which are no card deal and stay on offer.
 */
export function availableModes(resolved: ResolvedCard | undefined, kind: Kind): readonly RecurrenceMode[] {
  if (kind === 'income') return ['one_time', 'monthly', 'yearly'];
  if (resolved === undefined) return ['one_time', 'installments', 'credit', 'standing_order', 'loan'];
  const has = new Set(resolved.deals.map((d) => d.kind));
  // A purchase is always possible, whatever the card's list says.
  const deals = PURCHASE_DEALS.filter(([mode, deal]) => mode === 'one_time' || has.has(deal));
  return [...deals.map(([mode]) => mode), 'standing_order', 'loan'];
}

/** A card's rate term as an annual nominal rate today; undefined while it does not read as one. */
function rateOfTerm(term: CardRateTerm, prime: { readonly primeRate: string; readonly boiRate: string }) {
  if (term.basis !== 'boi') return rateOf(term, prime.primeRate);
  return normalizeAnnualRate(addRates(prime.boiRate, term.margin));
}

/**
 * The rate a purchase in `mode` on this card arrives priced at, as the form's
 * rate field holds it ('' for none), and whether it is missing: a linked card
 * whose deal carries interest the catalog does not publish and the person has
 * not entered. A card not linked, or whose catalog has not loaded yet, prices
 * a קרדיט as it always has and nothing else.
 */
export function dealRate(
  method: PaymentMethod | undefined,
  resolved: ResolvedCard | undefined,
  mode: RecurrenceMode,
  prime: { readonly primeRate: string; readonly boiRate: string },
): { readonly rate: string; readonly missing: boolean } {
  const kind = dealKindOf(mode);
  if (!chargesInterest(mode) || kind === undefined) return { rate: '', missing: false };
  const today = { rate: mode === 'credit' ? cardCreditRate(method, prime.primeRate) : '', missing: false };
  const card = method?.card;
  if (resolved === undefined || card?.catalog === undefined) return today;
  const found = cardDealRate(card, resolved, kind);
  if (found === undefined) return today;
  if (found.term === null) return { rate: '', missing: true };
  return { rate: rateOfTerm(found.term, prime) ?? '', missing: false };
}

export type DealSchedule = {
  readonly count: number;
  /** The level payment. */
  readonly paymentMinor: Minor;
  readonly interestMinor: Minor;
  /** The מתואמת rate, two places. */
  readonly effective: string;
  /** Where the deal re-prices with prime: the payments before it, and about what follows at today's prime. */
  readonly reset?: { readonly atPayment: number; readonly firstMinor: Minor; readonly afterMinor: Minor };
};

/**
 * A קרדיט plan's schedule, as the form previews it: each payment, the
 * interest in all, and the מתואמת rate at the deal's compounding. Where the
 * deal resets with prime (Max's קרדיט פלוס, at payment 19), the payments from
 * then on at today's prime - an estimate, since prime moves. Undefined while
 * the plan is not complete.
 */
export function dealSchedule(input: {
  readonly principalMinor: Minor | undefined;
  /** The annual nominal rate, normalized. */
  readonly rate: string;
  readonly count: number;
  readonly maxCount: number;
  readonly compounding: 12 | 4;
  readonly reset?: { readonly atPayment: number } | undefined;
  readonly primeRate: string;
}): DealSchedule | undefined {
  const { principalMinor: principal, rate, count } = input;
  if (principal === undefined || principal <= 0) return undefined;
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > input.maxCount) return undefined;
  const plan = creditSchedule(principal, rate, count);
  const at = input.reset?.atPayment;
  const reset =
    at === undefined || at < 2 || at > count
      ? undefined
      : longCreditPayments(principal, rate, count, {
          atPayment: at,
          // Prime today against prime today: the rate as it stands, re-amortized.
          rate: resetRate(rate, input.primeRate, input.primeRate),
        });
  return {
    count,
    paymentMinor: plan.paymentMinor,
    interestMinor: plan.interestMinor,
    effective: annualEffectiveRate(rate, input.compounding),
    ...(reset?.afterReset === undefined || at === undefined
      ? {}
      : { reset: { atPayment: at, firstMinor: reset.first, afterMinor: reset.afterReset } }),
  };
}
