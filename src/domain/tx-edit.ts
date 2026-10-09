import { parseLocalDate } from '@/lib/dates';
import { toDecimalString } from '@/lib/money';
import type { Occurrence, PaymentMethod, Recurrence, Transaction } from '@/types/domain';
import type { Kind, LocalDate, MoneySnapshot } from '@/types/money';

import { destinationsFor } from './income-destination';
import type { EditScope, TransactionPatch } from './series-edit';
import type { RecurrenceMode, StandingOrderFrequency, TxFormParsed, TxFormValues } from './tx-form';
import { methodOwnedBy } from './tx-options';

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
 *
 * Editing a plan's payments (their amount, on one payment or all of them)
 * leaves its recurrence alone, `reset.principalMinor` included: the reset at
 * payment 19 still re-prices what was borrowed at the purchase, never what the
 * edited payments would be worth. Its scopes are this one or the whole plan;
 * `planSeriesEdit` never splits a plan.
 */
export function isInstallmentPlan(recurrence: Recurrence): boolean {
  return recurrence.type === 'monthly' && recurrence.installments !== undefined;
}

/**
 * Which control the form should open on, for a row that already exists.
 *
 * `kind` matters because the same stored recurrence is described by two
 * different vocabularies: monthly recurrence on an expense is a הוראת קבע, and
 * on income it is just a salary that arrives every month. Opening a salary in
 * a control labelled "standing order" would be wrong in the ordinary sense of
 * the word - a standing order is something you set up to pay someone else.
 *
 * A plan with no `plan` field is תשלומים: rows written before the distinction
 * existed could not have been anything else.
 */
export function recurrenceModeOf(recurrence: Recurrence, kind: Kind = 'expense'): RecurrenceMode {
  if (recurrence.type === 'one_time') return 'one_time';
  if (recurrence.type === 'yearly') return kind === 'expense' ? 'standing_order' : 'yearly';
  if (recurrence.installments !== undefined) {
    return recurrence.plan === 'credit' || recurrence.plan === 'loan' ? recurrence.plan : 'installments';
  }
  return kind === 'expense' ? 'standing_order' : 'monthly';
}

/** The frequency control's value for a row that is already a standing order. */
export function frequencyOf(recurrence: Recurrence, kind: Kind): StandingOrderFrequency {
  if (recurrenceModeOf(recurrence, kind) !== 'standing_order') return '';
  return recurrence.type === 'yearly' ? 'yearly' : 'monthly';
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
    destinationId: occurrence.destinationId ?? '',
    amount: toDecimalString(occurrence.money.amountMinor, occurrence.money.currency),
    currency: occurrence.money.currency,
    // The EFFECTIVE date, so a moved occurrence opens on the day it is shown.
    date: occurrence.date,
    note: occurrence.note ?? '',
    mode: recurrenceModeOf(recurrence, transaction.kind),
    dayOfMonth: String(dayOfMonthOf(recurrence, transaction.date)),
    endDate: (recurrence.type === 'one_time' ? undefined : recurrence.endDate) ?? '',
    installmentCount:
      recurrence.type === 'monthly' && recurrence.installments !== undefined
        ? String(recurrence.installments)
        : '',
    frequency: frequencyOf(recurrence, transaction.kind),
    /*
     * Deliberately empty, even for a קרדיט plan that has a rate.
     *
     * The amount field of an existing plan holds ONE PAYMENT, not the purchase
     * price, and the plan itself is read-only once saved. The schema prices an
     * amount it believes is a purchase, so handing it the rate would add the
     * interest a second time: correcting the note on a ₪207.06 payment would
     * save it as ₪1,242.36. The snapshotted rate stays on the recurrence, which
     * an edit of a plan never rewrites.
     */
    annualRate: '',
    // Read-only once saved, like the rate: a fixed basis prices nothing here.
    rateBasis: 'fixed',
    primeMargin: '',
    primeRate: '',
    // A saved rule's first month is behind it: nothing to split.
    partialFirst: false,
    /*
     * The SERIES' business type: a series carries one, and an occurrence
     * never has its own (`OverridePatch` has no field for it).
     */
    mcc: transaction.mcc ?? '',
    mccSource: transaction.mccSource ?? '',
  };
}

/**
 * The add form, prefilled from a row: what it was, how much, in what currency,
 * on which card, under what name. It is dated today and one-time, whatever the
 * source's recurrence was, because a duplicate is a new purchase, not a second
 * copy of a plan. The amount is the row's own (one payment, for a plan), as
 * the row shows it. Everything else is the add form's own default (`base`).
 *
 * WHOSE it is comes from the row too, while that person is still in the
 * household: a duplicate of Dana's purchase is Dana's, whoever is being looked
 * at. And the card goes only where that person can pay with it. A card the
 * form's person does not own or share is dropped, never kept: the picker
 * cannot show it, so it would sit behind "Not specified" and be saved anyway.
 * Where income went is kept by the same rule.
 */
export function duplicateFormValues(
  occurrence: Occurrence,
  transaction: Transaction,
  base: TxFormValues,
  today: LocalDate,
  owners: {
    readonly profiles: readonly { readonly id: string }[];
    readonly methods: readonly PaymentMethod[];
  },
): TxFormValues {
  const from = occurrenceToFormValues(occurrence, transaction);
  const profileId = owners.profiles.some((profile) => profile.id === from.profileId)
    ? from.profileId
    : base.profileId;
  const method = owners.methods.find((m) => m.id === from.paymentMethodId);
  return {
    ...base,
    profileId,
    kind: from.kind,
    categoryId: from.categoryId,
    amount: from.amount,
    currency: from.currency,
    paymentMethodId: method !== undefined && methodOwnedBy(method, profileId) ? method.id : '',
    // Where the income went, when the form's person can say it went there too.
    destinationId: destinationsFor(owners.methods, profileId).some((m) => m.id === from.destinationId)
      ? from.destinationId
      : '',
    note: from.note,
    // Another purchase from the same business: the same business type.
    mcc: from.mcc,
    mccSource: from.mccSource,
    date: today,
    mode: 'one_time',
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
    destinationId?: string | null;
    note?: string | null;
    date?: LocalDate;
    recurrence?: Recurrence;
    mcc?: string | null;
    mccSource?: string | null;
  } = {};

  if (!sameMoney(money, occurrence.money)) patch.money = money;
  if (parsed.categoryId !== occurrence.categoryId) patch.categoryId = parsed.categoryId;

  if ((parsed.paymentMethodId ?? '') !== (occurrence.paymentMethodId ?? '')) {
    // `null`, not omission: clearing a payment method has to be expressible,
    // and `Partial<>` cannot say it - which is why the Override patch type
    // distinguishes the two in the first place.
    patch.paymentMethodId = parsed.paymentMethodId ?? null;
  }

  if ((parsed.destinationId ?? '') !== (occurrence.destinationId ?? '')) {
    // `null` clears it, exactly as for a payment method.
    patch.destinationId = parsed.destinationId ?? null;
  }

  if ((parsed.note ?? '') !== (occurrence.note ?? '')) {
    patch.note = parsed.note ?? null;
  }

  // Not when the kind was switched: an edit does not save a switch of kind today, and the form
  // strips the business type from income, so the comparison would wipe the series' own.
  if (
    parsed.kind === transaction.kind &&
    ((parsed.mcc ?? '') !== (transaction.mcc ?? '') ||
      (parsed.mccSource ?? '') !== (transaction.mccSource ?? ''))
  ) {
    // Compared with the SERIES, not the occurrence; `null` clears it.
    patch.mcc = parsed.mcc ?? null;
    patch.mccSource = parsed.mccSource ?? null;
  }

  if (scopeAllowsMove(scope) && parsed.date !== occurrence.date) {
    patch.date = parsed.date;
  }

  if (
    scopeAllowsRecurrence(scope) &&
    !isInstallmentPlan(transaction.recurrence) &&
    !sameRecurrence(parsed.recurrence, transaction.recurrence)
  ) {
    patch.recurrence = keepingUnknownKeys(parsed.recurrence, transaction.recurrence);
  }

  return patch;
}

/** The recurrence keys the transaction form builds; any other key on a stored plan is not this version's. */
const FORM_RECURRENCE_KEYS: ReadonlySet<string> = new Set([
  'type',
  'dayOfMonth',
  'endDate',
  'installments',
  'plan',
  'creditAnnualRate',
  'rateBasis',
  'primeMargin',
]);

/** The form's recurrence, plus the keys of the stored one it doesn't know, when the plan kind is unchanged. */
function keepingUnknownKeys(next: Recurrence, previous: Recurrence): Recurrence {
  if (next.type !== 'monthly' || previous.type !== 'monthly' || next.plan !== previous.plan) return next;
  // A newer version may store keys this one doesn't know; an edit here must not erase them.
  const unknown = Object.fromEntries(
    Object.entries(previous).filter(([key]) => !FORM_RECURRENCE_KEYS.has(key)),
  );
  return { ...unknown, ...next };
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
