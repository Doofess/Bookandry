import { addMonthsClamped, compareLocal, monthsBetween } from '@/lib/dates';
import { divideMinor } from '@/lib/money';
import type { Occurrence, Override, Transaction } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

import { expandOccurrences, seriesEndDate } from './occurrences';

/**
 * What the household is actually signed up for.
 *
 * The plan's answer to a question the feed cannot answer: a feed shows one
 * month, so six standing orders and three instalment plans are nine rows
 * scattered across it and no total anywhere. This is the drill-down from
 * "Expected monthly expense", the home for "end this series", and the only
 * screen that says what a yearly premium costs per month.
 *
 * Pure. The DB layer supplies the rows; everything interesting here - which
 * series are still live, what each one comes to monthly, how many instalments
 * are left - is arithmetic over them.
 */

/** How far ahead to look for the next occurrence. A yearly bill needs 12+. */
const HORIZON_MONTHS = 14;

export type Commitment = {
  readonly transaction: Transaction;
  /** The next occurrence at or after today; absent once the series has run out. */
  readonly next: Occurrence | undefined;
  /**
   * What this costs per month, in the BASE currency.
   *
   * A yearly premium divided by twelve, an instalment plan at its payment, a
   * monthly bill at face value. Base currency so the figures can be summed and
   * compared - a list mixing 45 EUR with 3,900 ILS ranks by neither.
   */
  readonly monthlyEquivalentMinor: Minor;
  /** Instalment plans only: payments still to come, counting the next one. */
  readonly remaining: number | undefined;
  /** When the series stops, if it ever does. */
  readonly endsOn: LocalDate | undefined;
};

export type CommitmentsInput = {
  readonly transactions: readonly Transaction[];
  readonly overrides: readonly Override[];
  readonly today: LocalDate;
};

export type CommitmentsResult = {
  readonly commitments: readonly Commitment[];
  /** Monthly equivalent of every live EXPENSE commitment. */
  readonly monthlyExpenseMinor: Minor;
  /** Monthly equivalent of every live INCOME commitment - usually the salary. */
  readonly monthlyIncomeMinor: Minor;
};

export function listCommitments(input: CommitmentsInput): CommitmentsResult {
  const { transactions, overrides, today } = input;
  const horizon = addMonthsClamped(today, HORIZON_MONTHS, 1);

  const byTransaction = new Map<string, Override[]>();
  for (const override of overrides) {
    const list = byTransaction.get(override.transactionId);
    if (list === undefined) byTransaction.set(override.transactionId, [override]);
    else list.push(override);
  }

  const commitments: Commitment[] = [];

  for (const tx of transactions) {
    // One-time transactions are not commitments. They are things that happened.
    if (tx.recurrence.type === 'one_time') continue;
    if (tx.isDeleted === 1) continue;

    const own = byTransaction.get(tx.id) ?? [];

    /*
     * Skipped occurrences are EXCLUDED here, unlike in the feed.
     *
     * "What am I signed up for" means the next payment that will actually
     * happen. A skipped month is one the user has already decided is not
     * happening, and showing it as next is a date they will wait for in vain.
     */
    const upcoming = expandOccurrences(tx, own, today, horizon, { today });
    const next = upcoming.find((o) => compareLocal(o.date, today) >= 0);

    const endsOn = endOf(tx);
    // A series whose last occurrence is behind us is finished, not a
    // commitment - it just has not been tidied away.
    if (next === undefined && endsOn !== undefined && compareLocal(endsOn, today) < 0) continue;

    commitments.push({
      transaction: tx,
      next,
      monthlyEquivalentMinor: monthlyEquivalent(tx, next),
      remaining: remainingInstallments(tx, today),
      endsOn,
    });
  }

  /*
   * Sorted by WHEN, then by size.
   *
   * The question this screen answers is "what is coming", so the next payment
   * belongs at the top. Sorting by amount instead buries a rent payment due
   * tomorrow under a yearly premium due in November.
   */
  commitments.sort((a, b) => {
    if (a.next === undefined) return b.next === undefined ? 0 : 1;
    if (b.next === undefined) return -1;
    return compareLocal(a.next.date, b.next.date) || b.monthlyEquivalentMinor - a.monthlyEquivalentMinor;
  });

  let monthlyExpenseMinor = 0;
  let monthlyIncomeMinor = 0;
  for (const commitment of commitments) {
    if (commitment.next === undefined) continue;
    if (commitment.transaction.kind === 'expense') {
      monthlyExpenseMinor += commitment.monthlyEquivalentMinor;
    } else {
      monthlyIncomeMinor += commitment.monthlyEquivalentMinor;
    }
  }

  return { commitments, monthlyExpenseMinor, monthlyIncomeMinor };
}

/**
 * Per-month cost, in the base currency.
 *
 * Taken from the NEXT occurrence where there is one, so a per-occurrence edit
 * to next month's bill is what the list shows - the series' figure would be
 * the number the user already corrected.
 */
function monthlyEquivalent(tx: Transaction, next: Occurrence | undefined): Minor {
  const money = next?.money ?? tx.money;

  if (tx.recurrence.type === 'yearly') return divideMinor(money.baseAmountMinor, 12);
  return money.baseAmountMinor;
}

function endOf(tx: Transaction): LocalDate | undefined {
  if (tx.recurrence.type === 'one_time') return undefined;

  if (tx.recurrence.type === 'monthly' && tx.recurrence.installments !== undefined) {
    // An instalment plan ends after exactly N payments, whether or not anyone
    // wrote an end date.
    const last = addMonthsClamped(tx.date, tx.recurrence.installments - 1, tx.recurrence.dayOfMonth);
    const declared = tx.recurrence.endDate;
    return declared === undefined || compareLocal(last, declared) < 0 ? last : declared;
  }

  const end = seriesEndDate(tx.recurrence);
  return tx.recurrence.endDate === undefined ? undefined : end;
}

/** Payments still to come on an instalment plan, counting the next one. */
function remainingInstallments(tx: Transaction, today: LocalDate): number | undefined {
  if (tx.recurrence.type !== 'monthly' || tx.recurrence.installments === undefined) return undefined;

  const elapsed = monthsBetween(tx.date, today);
  // Before the plan starts, every payment is still to come.
  const done = Math.max(0, Math.min(elapsed, tx.recurrence.installments));
  return Math.max(0, tx.recurrence.installments - done);
}
