import type { SeriesEditPlan } from '@/domain/series-edit';
import { splitRecurrence, type SplitTiming } from '@/domain/split-purchase';
import { moneyForAmount } from '@/lib/money';
import type { Override, Transaction } from '@/types/domain';
import type { IsoInstant, Minor } from '@/types/money';

import type { BookandryDB } from './db';
import { materialize } from './materialize';
import { applySeriesEdit, planInstallments } from './series-edit';

export class NotSplittableError extends Error {
  constructor() {
    super('Only a saved one-time purchase can be split');
    this.name = 'NotSplittableError';
  }
}

export type SplitPurchaseInput = {
  readonly transactionId: string;
  readonly count: number;
  /** The split's annual rate, snapshotted. */
  readonly rate: string;
  /** What the plan charges in all, in the purchase's own currency (`splitSchedule`). */
  readonly totalMinor: Minor;
  readonly timing: SplitTiming;
  /** Where the deal re-prices with prime, and prime today. */
  readonly resetAt?: number | undefined;
  readonly primeRate: string;
  readonly now: IsoInstant;
  readonly newId: () => string;
};

/**
 * The purchase, as a קרדיט plan: the same row, never a second one.
 *
 * The purchase's own values first - an edit made to its one occurrence (an
 * amount, a note) is what was on screen - then the plan: the date its first
 * payment is billed from, the total split into its payments with the first
 * absorbing the remainder, exactly as a new plan is saved (`planInstallments`).
 * The one-off's overrides go: none of them is a slot of the plan.
 */
export function planSplitPurchase(
  tx: Transaction,
  overrides: readonly Override[],
  input: SplitPurchaseInput,
): SeriesEditPlan {
  const own = overrides.filter((o) => o.transactionId === tx.id);
  const edit = own.find((o) => o.action === 'modify' && o.occurrenceDate === tx.date)?.patch;
  const { deferral: _deferral, ...rest } = tx;
  const purchase: Transaction = {
    ...rest,
    money: edit?.money ?? tx.money,
    categoryId: edit?.categoryId ?? tx.categoryId,
    ...(edit !== undefined && 'note' in edit ? { note: edit.note ?? undefined } : {}),
    ...(edit !== undefined && 'paymentMethodId' in edit
      ? { paymentMethodId: edit.paymentMethodId ?? undefined }
      : {}),
  };

  const parts = planInstallments(
    {
      ...purchase,
      date: input.timing.planDate,
      money: moneyForAmount(purchase.money, input.totalMinor),
      recurrence: splitRecurrence({
        planDate: input.timing.planDate,
        count: input.count,
        rate: input.rate,
        resetAt: input.resetAt,
        primeRate: input.primeRate,
      }),
      updatedAt: input.now,
    },
    input.totalMinor,
  );
  const plan = materialize(parts.draft);

  const first: Override[] =
    parts.firstMinor === undefined
      ? []
      : [
          {
            id: input.newId(),
            transactionId: plan.id,
            occurrenceDate: plan.date,
            action: 'modify',
            patch: {
              money: {
                ...plan.money,
                amountMinor: parts.firstMinor,
                baseAmountMinor: parts.firstBaseMinor ?? parts.firstMinor,
              },
            },
            createdAt: input.now,
            updatedAt: input.now,
          },
        ];

  return {
    transactions: [plan],
    overrides: first,
    deleteOverrideIds: own.map((o) => o.id),
    warnings: [],
    effectiveScope: 'all',
  };
}

/**
 * Split a saved purchase into payments, in one transaction, through the same
 * path as any edit to a series - so it is tracked and syncs like one. Read
 * afresh inside it: a purchase changed or deleted meanwhile is not split from
 * an older copy.
 */
export async function splitPurchase(db: BookandryDB, input: SplitPurchaseInput): Promise<Transaction> {
  return db.transaction('rw', [db.transactions, db.overrides], async () => {
    const tx = await db.transactions.get(input.transactionId);
    if (tx === undefined || tx.isDeleted === 1 || tx.recurrence.type !== 'one_time')
      throw new NotSplittableError();
    const overrides = await db.overrides.where('transactionId').equals(tx.id).toArray();
    const plan = planSplitPurchase(tx, overrides, input);
    await applySeriesEdit(db, plan);
    return plan.transactions[0] ?? tx;
  });
}
