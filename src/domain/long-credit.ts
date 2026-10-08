import { addMonthsClamped, compareLocal } from '@/lib/dates';
import { longCreditPayments, normalizeAnnualRate, presentValueMinor, resetRate } from '@/lib/money';
import type { Recurrence, Transaction } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/*
 * A long קרדיט (Max's קרדיט פלוס) over time: from one payment on (Max: 19) its
 * rate is the rate it was bought at plus however far prime has moved since.
 * Until that payment is due, the payments from it are an estimate at prime
 * today; once its date has passed, the rate and payment are saved on the plan
 * and never move again.
 *
 * Pure. Every device works the same values out of the same row and the same
 * prime, so the writes converge.
 */

type Reset = NonNullable<Extract<Recurrence, { type: 'monthly' }>['reset']>;

/**
 * The plan's reset as it should now stand, or undefined when there is nothing
 * to write: not a long קרדיט still following prime (no reset, frozen, deleted,
 * unreadable), or nothing changed.
 *
 * The balance at the reset is re-amortized from what the plan borrowed, which
 * is not stored: only what it charges is. The present value of its payments at
 * its own rate is that principal, to within an agora or so of rounding - and,
 * being worked out of the row alone, the same on every device.
 */
export function nextReset(tx: Transaction, primePercent: string, today: LocalDate): Reset | undefined {
  const recurrence = tx.recurrence;
  if (tx.isDeleted === 1 || recurrence.type !== 'monthly') return undefined;
  const reset = recurrence.reset;
  const count = recurrence.installments;
  const rate = normalizeAnnualRate(recurrence.creditAnnualRate ?? '');
  if (reset === undefined || reset.frozen === true || count === undefined || rate === undefined)
    return undefined;
  if (!Number.isInteger(reset.atPayment) || reset.atPayment < 2 || reset.atPayment > count) return undefined;
  const prime = normalizeAnnualRate(primePercent);
  const was = normalizeAnnualRate(reset.primeAtPurchase);
  if (prime === undefined || was === undefined) return undefined;

  const newRate = resetRate(rate, was, prime);
  const principal = presentValueMinor(Array<number>(count).fill(tx.money.amountMinor), rate);
  const paymentMinor = longCreditPayments(principal, rate, count, {
    atPayment: reset.atPayment,
    rate: newRate,
  }).afterReset;
  /* v8 ignore next -- longCreditPayments always prices the payment after a reset it is given */
  if (paymentMinor === undefined) return undefined;

  const due = addMonthsClamped(tx.date, reset.atPayment - 1, recurrence.dayOfMonth);
  const frozen = compareLocal(due, today) <= 0;
  if (reset.rate === newRate && reset.paymentMinor === paymentMinor && !frozen) return undefined;
  return {
    atPayment: reset.atPayment,
    primeAtPurchase: reset.primeAtPurchase,
    rate: newRate,
    paymentMinor,
    ...(frozen ? { frozen: true as const } : {}),
  };
}

/** The payment a plan re-prices with prime from, while it still will; undefined once frozen or for any other plan. */
export function followsPrimeFrom(recurrence: Recurrence): number | undefined {
  if (recurrence.type !== 'monthly') return undefined;
  const reset = recurrence.reset;
  return reset === undefined || reset.frozen === true ? undefined : reset.atPayment;
}
