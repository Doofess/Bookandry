import { addDays, addMonthsClamped, compareLocal, maxDate } from '@/lib/dates';
import type { Override, Recurrence, Transaction } from '@/types/domain';
import type { IsoInstant, LocalDate, MoneySnapshot } from '@/types/money';

import { expandOccurrences } from './occurrences';

/**
 * Editing one occurrence, this-and-future, or the whole series.
 *
 * The spec's two-step split ("set endDate on the original, insert a new
 * transaction") breaks five ways, and four of them are silent:
 *
 *  1. It ORPHANS future overrides. They stay in the table pointing at a series
 *     that no longer reaches them - invisible, and they RESURRECT if the
 *     endDate is ever extended again.
 *  2. It creates no lineage link, so nothing can tell that two rows were once
 *     one series.
 *  3. It leaves undo nothing to key on.
 *  4. It loses an existing endDate, so the continuation bills forever.
 *  5. Splitting at the FIRST occurrence produces `endDate < date` - a series
 *     that can never emit anything, sitting in the database looking normal.
 *
 * Planned purely, so every one of those is directly testable without a
 * database, and applied in a single transaction by `db/series-edit.ts`.
 */

export type EditScope = 'one' | 'future' | 'all';

export type TransactionPatch = {
  readonly money?: MoneySnapshot;
  readonly categoryId?: string;
  /** `null` clears it; `undefined` leaves it alone. */
  readonly paymentMethodId?: string | null;
  /** Income only. `null` clears it; `undefined` leaves it alone. */
  readonly destinationId?: string | null;
  readonly note?: string | null;
  /** Moves this occurrence off its slot. Scope 'one' only. */
  readonly date?: LocalDate;
  /** Scope 'future' and 'all' only: a per-occurrence rule change is meaningless. */
  readonly recurrence?: Recurrence;
};

export type SeriesEditInput = {
  readonly transaction: Transaction;
  readonly overrides: readonly Override[];
  readonly scope: EditScope;
  /** The ORIGINAL slot date of the occurrence being edited, never its moved date. */
  readonly at: LocalDate;
  readonly patch: TransactionPatch;
  readonly today: LocalDate;
  readonly now: IsoInstant;
  /** Injected, so a plan is byte-stable and an undo can be keyed on it. */
  readonly newId: () => string;
};

export type SeriesEditWarning =
  | { readonly kind: 'overrides_dropped'; readonly count: number }
  | { readonly kind: 'scope_promoted'; readonly from: EditScope; readonly to: EditScope };

export type SeriesEditError =
  | { readonly kind: 'not_a_slot'; readonly at: LocalDate }
  | { readonly kind: 'rule_change_needs_series'; readonly scope: EditScope }
  | { readonly kind: 'move_needs_single'; readonly scope: EditScope };

export type SeriesEditPlan = {
  /** Transactions to write, already carrying their new field values. */
  readonly transactions: readonly Transaction[];
  readonly overrides: readonly Override[];
  readonly deleteOverrideIds: readonly string[];
  readonly warnings: readonly SeriesEditWarning[];
  /** The scope actually used, which is not always the scope asked for. */
  readonly effectiveScope: EditScope;
};

export type SeriesEditResult =
  | { readonly ok: true; readonly plan: SeriesEditPlan }
  | { readonly ok: false; readonly error: SeriesEditError };

/** How far back to look for the previous slot. Covers monthly and yearly alike. */
const LOOKBACK_MONTHS = 14;

function endDateOf(recurrence: Recurrence): LocalDate | undefined {
  return recurrence.type === 'one_time' ? undefined : recurrence.endDate;
}

function withEndDate(recurrence: Recurrence, endDate: LocalDate | undefined): Recurrence {
  if (recurrence.type === 'one_time') return recurrence;
  return endDate === undefined ? { ...recurrence, endDate: undefined } : { ...recurrence, endDate };
}

/** Is `at` a real slot of this series? A SKIPPED slot still counts as one. */
export function isSlot(
  tx: Transaction,
  overrides: readonly Override[],
  at: LocalDate,
  today: LocalDate,
): boolean {
  return (
    expandOccurrences(tx, overrides, at, at, { today, includeSkipped: true }).some(
      (o) => o.originalDate === at,
    ) || tx.date === at
  );
}

/** The last real slot strictly before `at`, or undefined when `at` is the first. */
export function previousSlot(
  tx: Transaction,
  overrides: readonly Override[],
  at: LocalDate,
  today: LocalDate,
): LocalDate | undefined {
  if (compareLocal(at, tx.date) <= 0) return undefined;
  const from = maxDate(tx.date, addMonthsClamped(at, -LOOKBACK_MONTHS, 1));
  const slots = expandOccurrences(tx, overrides, from, addDays(at, -1), {
    today,
    includeSkipped: true,
  });
  return slots.at(-1)?.originalDate;
}

/** Apply a patch's transaction-level fields. Per-occurrence fields are ignored. */
function applyToTransaction(tx: Transaction, patch: TransactionPatch, now: IsoInstant): Transaction {
  /*
   * A 30+ deferral belongs to a one-off purchase. A row whose type changes to
   * a plan or a repeat is not one any more, and a deferral left on it would
   * bill every one of its payments a month late (`settleDate`).
   */
  const { deferral, ...rest } = tx;
  const recurrence = patch.recurrence ?? tx.recurrence;
  const base = deferral === undefined || recurrence.type !== 'one_time' ? rest : tx;
  return {
    ...base,
    ...(patch.money === undefined ? {} : { money: patch.money }),
    ...(patch.categoryId === undefined ? {} : { categoryId: patch.categoryId }),
    ...(patch.paymentMethodId === undefined ? {} : { paymentMethodId: patch.paymentMethodId ?? undefined }),
    ...(patch.destinationId === undefined ? {} : { destinationId: patch.destinationId ?? undefined }),
    ...(patch.note === undefined ? {} : { note: patch.note ?? undefined }),
    ...(patch.recurrence === undefined ? {} : { recurrence: patch.recurrence }),
    updatedAt: now,
  };
}

function overrideFor(
  transactionId: string,
  at: LocalDate,
  patch: TransactionPatch,
  existing: Override | undefined,
  now: IsoInstant,
  newId: () => string,
): Override {
  const previous = existing?.action === 'modify' ? existing.patch : {};
  return {
    id: existing?.id ?? newId(),
    transactionId,
    occurrenceDate: at,
    action: 'modify',
    patch: {
      ...previous,
      ...(patch.money === undefined ? {} : { money: patch.money }),
      ...(patch.categoryId === undefined ? {} : { categoryId: patch.categoryId }),
      ...(patch.paymentMethodId === undefined ? {} : { paymentMethodId: patch.paymentMethodId }),
      ...(patch.destinationId === undefined ? {} : { destinationId: patch.destinationId }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      ...(patch.date === undefined ? {} : { date: patch.date }),
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function planSeriesEdit(input: SeriesEditInput): SeriesEditResult {
  const { transaction: tx, overrides, patch, at, today, now, newId } = input;
  const warnings: SeriesEditWarning[] = [];

  // A rule change is a statement about the SERIES. Storing one on a single
  // occurrence would mean a slot whose own recurrence disagrees with its
  // parent's, which nothing downstream can interpret.
  if (patch.recurrence !== undefined && input.scope === 'one') {
    return { ok: false, error: { kind: 'rule_change_needs_series', scope: 'one' } };
  }
  // Symmetrically, moving a date is a statement about ONE occurrence. Applied to
  // a series it would silently mean "change the rule", which is a different
  // edit with different consequences.
  if (patch.date !== undefined && input.scope !== 'one') {
    return { ok: false, error: { kind: 'move_needs_single', scope: input.scope } };
  }

  if (!isSlot(tx, overrides, at, today)) {
    return { ok: false, error: { kind: 'not_a_slot', at } };
  }

  // A one-time transaction has exactly one occurrence, so every scope is the
  // same edit. Saying so here keeps three branches from having to know it.
  let scope = tx.recurrence.type === 'one_time' ? 'all' : input.scope;

  if (scope === 'future' && previousSlot(tx, overrides, at, today) === undefined) {
    /*
     * Splitting at the FIRST occurrence is the zero-occurrence zombie: the
     * original would be closed at a slot before its own start date, leaving a
     * row that can never emit anything and looks entirely normal in the table.
     * "This and all future" from the first occurrence IS "the whole series".
     */
    scope = 'all';
    warnings.push({ kind: 'scope_promoted', from: 'future', to: 'all' });
  }

  if (scope === 'future' && tx.recurrence.type === 'monthly' && tx.recurrence.installments !== undefined) {
    /*
     * A plan (תשלומים, קרדיט) counts its payments from its own date. Split, the
     * continuation would start the count again: a 36-payment plan split at
     * payment 5 would run to 40, and its prime reset at payment 19 would land on
     * the original's 23rd. A plan's terms are one agreement, so an edit to "this
     * and the rest" of it is an edit to the whole plan.
     */
    scope = 'all';
    warnings.push({ kind: 'scope_promoted', from: 'future', to: 'all' });
  }

  if (scope === 'all') {
    const updated = applyToTransaction(tx, patch, now);

    /*
     * A rule change orphans every override whose slot the new rule no longer
     * emits.
     *
     * This is the SAME defect the split path was built to avoid, on a different
     * route, and it was in this branch until a browser walkthrough turned it
     * up: change a monthly bill from the 10th to the 20th for the whole series,
     * and the per-occurrence edits on the 10th stay in the table pointing at
     * days that are no longer occurrences. Expansion iterates slots, so they
     * are invisible - right up until someone changes the rule back to the 10th,
     * at which point months-old edits reappear on live occurrences.
     *
     * Dropping them is the honest outcome, and the count is reported so the
     * sheet can ask before doing it rather than after.
     */
    const stale =
      patch.recurrence === undefined
        ? []
        : overrides.filter((o) => o.transactionId === tx.id && !isSlot(updated, [], o.occurrenceDate, today));

    if (stale.length > 0) warnings.push({ kind: 'overrides_dropped', count: stale.length });

    return {
      ok: true,
      plan: {
        transactions: [updated],
        overrides: [],
        deleteOverrideIds: stale.map((o) => o.id),
        warnings,
        effectiveScope: scope,
      },
    };
  }

  if (scope === 'one') {
    const existing = overrides.find((o) => o.transactionId === tx.id && o.occurrenceDate === at);
    return {
      ok: true,
      plan: {
        transactions: [],
        overrides: [overrideFor(tx.id, at, patch, existing, now, newId)],
        deleteOverrideIds: [],
        warnings,
        effectiveScope: 'one',
      },
    };
  }

  return planSplit(input, warnings);
}

/**
 * The split itself.
 *
 * In one plan, so it can be applied in one transaction: a crash between "close
 * the original" and "insert the continuation" loses every occurrence from the
 * split point onward, and a crash the other way round bills the user twice.
 */
function planSplit(input: SeriesEditInput, warnings: SeriesEditWarning[]): SeriesEditResult {
  const { transaction: tx, overrides, patch, at, today, now, newId } = input;

  const closeAt = previousSlot(tx, overrides, at, today);
  if (closeAt === undefined) {
    // Already handled by the promotion above; unreachable, and an assertion is
    // cheaper than a silent zombie if that ever stops being true.
    return { ok: false, error: { kind: 'not_a_slot', at } };
  }

  // Captured BEFORE the original is closed. The spec dropped it, so every
  // continuation billed forever regardless of when the series was meant to end.
  const inheritedEnd = endDateOf(tx.recurrence);

  const original: Transaction = {
    ...tx,
    recurrence: withEndDate(tx.recurrence, closeAt),
    updatedAt: now,
  };

  const continuationId = newId();
  const continuation: Transaction = {
    ...applyToTransaction(tx, patch, now),
    id: continuationId,
    date: at,
    seriesStart: at,
    // Lineage, which the spec had no field for: without it nothing can tell
    // that these two rows were once one series, and undo has nothing to key on.
    seriesRootId: tx.seriesRootId,
    splitFromId: tx.id,
    splitAtDate: at,
    recurrence: withEndDate(patch.recurrence ?? tx.recurrence, inheritedEnd),
    createdAt: now,
    updatedAt: now,
  };

  /*
   * Future overrides move with the occurrences they belong to.
   *
   * Left behind they point at a series that no longer reaches them: invisible,
   * and they RESURRECT the day someone extends the original's endDate. When the
   * rule itself changed, their slots may no longer exist at all - so they are
   * dropped, with a warning, rather than re-homed onto dates the new rule never
   * emits.
   */
  const future = overrides.filter(
    (o) => o.transactionId === tx.id && compareLocal(o.occurrenceDate, at) >= 0,
  );
  const ruleChanged = patch.recurrence !== undefined;

  const rehomed = ruleChanged
    ? []
    : future.map((o) => ({ ...o, transactionId: continuationId, updatedAt: now }));

  if (ruleChanged && future.length > 0) {
    warnings.push({ kind: 'overrides_dropped', count: future.length });
  }

  return {
    ok: true,
    plan: {
      transactions: [original, continuation],
      overrides: rehomed,
      /*
       * ONLY the dropped ones.
       *
       * A re-homed override keeps its primary key, so a `put` updates the row
       * in place and the [transactionId+occurrenceDate] index follows. Listing
       * it here as well would make the result depend on whether the applier
       * deletes before it puts - and one of those orders loses the row.
       */
      deleteOverrideIds: ruleChanged ? future.map((o) => o.id) : [],
      warnings,
      effectiveScope: 'future',
    },
  };
}
