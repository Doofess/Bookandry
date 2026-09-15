import { parseLocalDate } from '@/lib/dates';
import { toDecimalString } from '@/lib/money';
import type { Occurrence, Recurrence, Transaction } from '@/types/domain';
import type { LocalDate, MoneySnapshot } from '@/types/money';

import type { EditScope, TransactionPatch } from './series-edit';
import type { RecurrenceMode, TxFormParsed, TxFormValues } from './tx-form';

/**
 * The bridge between a stored occurrence and the form.
 *
 * Pure in both directions so the interesting half - working out what actually
 * changed - is testable without rendering anything. It matters more than it
 * looks: a patch that names a field the user never touched is not a no-op.
 * `paymentMethodId: null` CLEARS the method; `note: null` clears the note. Send
 * those by accident and an edit to the amount quietly wipes two other fields.
 */

/**
 * Which fields a scope may change.
 *
 * These are not UI preferences; they are the two refusals `planSeriesEdit`
 * makes, mirrored so the form cannot offer something the planner will reject:
 *
 *  - A RECURRENCE change on scope 'one' is meaningless. A single occurrence
 *    whose own rule disagrees with its parent's is not interpretable by
 *    anything downstream.
 *  - A DATE change on scope 'future' or 'all' means something else entirely:
 *    applied to a rule rather than to an occurrence, "move this to the 12th"
 *    silently becomes "move every one of them".
 */
export function scopeAllowsRecurrence(scope: EditScope): boolean {
  return scope !== 'one';
}

export function scopeAllowsMove(scope: EditScope): boolean {
  return scope === 'one';
}

/**
 * An instalment plan cannot be re-planned by editing.
 *
 * Changing the count or the total would have to re-split the payments AND
 * rewrite the first-occurrence remainder override in step, or the plan stops
 * summing to its total - the one invariant תשלומים has. Rather than offer an
 * editor that breaks it, the mode is shown read-only and the README says to
 * delete and re-add. An honest limitation beats a half-working control.
 */
export function isInstallmentPlan(recurrence: Recurrence): boolean {
  return recurrence.type === 'monthly' && recurrence.installments !== undefined;
}

export function recurrenceModeOf(recurrence: Recurrence): RecurrenceMode {
  if (recurrence.type === 'one_time') return 'one_time';
  if (recurrence.type === 'yearly') return 'yearly';
  return recurrence.installments === undefined ? 'monthly' : 'installments';
}

/**
 * Seed the form from an occurrence.
 *
 * Reads the OCCURRENCE, not the transaction, wherever the two can differ: an
 * overridden occurrence carries its own amount, category, method and note, and
 * seeding from the parent would show the user the series' values and then save
 * them over their per-occurrence edit.
 */
export function occurrenceToFormValues(occurrence: Occurrence, transaction: Transaction): TxFormValues {
  const recurrence = transaction.recurrence;

  return {
    profileId: transaction.profileId,
    kind: transaction.kind,
    categoryId: occurrence.categoryId,
    paymentMethodId: occurrence.paymentMethodId ?? '',
    amount: toDecimalString(occurrence.money.amountMinor, occurrence.money.currency),
    currency: occurrence.money.currency,
    // The EFFECTIVE date, so a moved occurrence opens on the day it is shown.
    date: occurrence.date,
    note: occurrence.note ?? '',
    mode: recurrenceModeOf(recurrence),
    dayOfMonth: String(dayOfMonthOf(recurrence, transaction.date)),
    endDate: (recurrence.type === 'one_time' ? undefined : recurrence.endDate) ?? '',
    installmentCount:
      recurrence.type === 'monthly' && recurrence.installments !== undefined
        ? String(recurrence.installments)
        : '',
  };
}

function dayOfMonthOf(recurrence: Recurrence, date: LocalDate): number {
  if (recurrence.type === 'monthly') return recurrence.dayOfMonth;
  return parseLocalDate(date).day;
}

export type BuildPatchInput = {
  readonly parsed: TxFormParsed;
  readonly occurrence: Occurrence;
  readonly transaction: Transaction;
  readonly scope: EditScope;
  /** Already rebuilt by the caller when the money changed at all. */
  readonly money: MoneySnapshot;
};

/**
 * What actually changed, and nothing else.
 *
 * Every field is omitted unless it differs, because the patch type uses
 * `undefined` for "leave alone" and `null` for "clear" - so a patch built by
 * spreading the whole form would send `note: null` for every row that never had
 * a note, and `date` for every edit, which scope 'future' and 'all' then refuse
 * outright.
 */
export function buildPatch(input: BuildPatchInput): TransactionPatch {
  const { parsed, occurrence, transaction, scope, money } = input;
  const patch: {
    money?: MoneySnapshot;
    categoryId?: string;
    paymentMethodId?: string | null;
    note?: string | null;
    date?: LocalDate;
    recurrence?: Recurrence;
  } = {};

  if (!sameMoney(money, occurrence.money)) patch.money = money;
  if (parsed.categoryId !== occurrence.categoryId) patch.categoryId = parsed.categoryId;

  if ((parsed.paymentMethodId ?? '') !== (occurrence.paymentMethodId ?? '')) {
    // `null`, not omission: clearing a payment method has to be expressible,
    // and `Partial<>` cannot say it - which is why the Override patch type
    // distinguishes the two in the first place.
    patch.paymentMethodId = parsed.paymentMethodId ?? null;
  }

  if ((parsed.note ?? '') !== (occurrence.note ?? '')) {
    patch.note = parsed.note ?? null;
  }

  if (scopeAllowsMove(scope) && parsed.date !== occurrence.date) {
    patch.date = parsed.date;
  }

  if (
    scopeAllowsRecurrence(scope) &&
    !isInstallmentPlan(transaction.recurrence) &&
    !sameRecurrence(parsed.recurrence, transaction.recurrence)
  ) {
    patch.recurrence = parsed.recurrence;
  }

  return patch;
}

/** True when a patch would write nothing, so the sheet can just close. */
export function isEmptyPatch(patch: TransactionPatch): boolean {
  return Object.keys(patch).length === 0;
}

function sameMoney(a: MoneySnapshot, b: MoneySnapshot): boolean {
  return (
    a.amountMinor === b.amountMinor &&
    a.currency === b.currency &&
    a.baseCurrency === b.baseCurrency &&
    a.baseAmountMinor === b.baseAmountMinor &&
    a.rateUsed === b.rateUsed &&
    a.rateDate === b.rateDate &&
    a.rateSource === b.rateSource
  );
}

function sameRecurrence(a: Recurrence, b: Recurrence): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'one_time') return true;
  if (a.type === 'monthly' && b.type === 'monthly') {
    return a.dayOfMonth === b.dayOfMonth && a.endDate === b.endDate && a.installments === b.installments;
  }
  if (a.type === 'yearly' && b.type === 'yearly') {
    return a.month === b.month && a.day === b.day && a.endDate === b.endDate;
  }
  return false;
}
