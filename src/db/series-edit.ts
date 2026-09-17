import { splitInstallments } from '@/domain/calculators';
import type { SeriesEditPlan } from '@/domain/series-edit';
import type { Override, Transaction } from '@/types/domain';
import type { IsoInstant, Minor, MoneySnapshot } from '@/types/money';

import type { GreenbackDB } from './db';
import { materialize, type TransactionDraft } from './materialize';

/**
 * Apply a series edit, atomically.
 *
 * ONE transaction over both tables. A crash between "close the original" and
 * "insert the continuation" loses every occurrence from the split point onward;
 * a crash the other way round bills the user twice. Neither failure announces
 * itself - the database just quietly holds a different history than it did a
 * moment ago.
 */
export async function applySeriesEdit(db: GreenbackDB, plan: SeriesEditPlan): Promise<void> {
  await db.transaction('rw', [db.transactions, db.overrides], async () => {
    if (plan.deleteOverrideIds.length > 0) {
      await db.overrides.bulkDelete([...plan.deleteOverrideIds]);
    }
    if (plan.overrides.length > 0) {
      await db.overrides.bulkPut([...plan.overrides]);
    }

    for (const tx of plan.transactions) {
      /*
       * Re-read the overrides INSIDE the transaction, after the writes above.
       *
       * `seriesEnd` is widened by any override that moves an occurrence past
       * the series' own end, so materialising against a stale list would leave
       * the moved occurrence outside every interval query - invisible money,
       * which is the exact defect the widening exists to prevent.
       */
      const owned = await db.overrides.where('transactionId').equals(tx.id).toArray();
      await db.transactions.put(materialize(tx, owned));
    }
  });
}

export type NewTransactionInput = {
  readonly draft: TransactionDraft;
  /**
   * תשלומים: the TOTAL, when the user entered a total and a payment count.
   *
   * The series stores the regular payment and the first occurrence carries the
   * remainder as an override, because `expandOccurrences` emits one uniform
   * amount per slot - the odd agorot have to live somewhere addressable.
   */
  readonly installmentTotalMinor?: Minor;
  readonly now: IsoInstant;
  readonly newId: () => string;
};

export type NewTransactionResult = {
  readonly transaction: Transaction;
  readonly firstPaymentOverride?: Override;
};

/**
 * Create a transaction, including an interest-free instalment plan.
 *
 * Israeli תשלומים carry no interest, so the payments must sum to the original
 * total EXACTLY. Dividing and rounding each payment independently loses or
 * gains agorot; the FIRST payment absorbs the remainder, which is the
 * card-issuer convention.
 */
export async function createTransaction(
  db: GreenbackDB,
  input: NewTransactionInput,
): Promise<NewTransactionResult> {
  const { draft, installmentTotalMinor, now, newId } = input;

  const parts = planInstallments(draft, installmentTotalMinor);
  const transaction = materialize(parts.draft);

  const override =
    parts.firstMinor === undefined
      ? undefined
      : ({
          id: newId(),
          transactionId: transaction.id,
          occurrenceDate: transaction.date,
          action: 'modify',
          patch: {
            money: {
              ...draft.money,
              amountMinor: parts.firstMinor,
              baseAmountMinor: parts.firstBaseMinor ?? parts.firstMinor,
            },
          },
          createdAt: now,
          updatedAt: now,
        } satisfies Override);

  await db.transaction('rw', [db.transactions, db.overrides], async () => {
    await db.transactions.add(transaction);
    if (override !== undefined) await db.overrides.add(override);
  });

  return { transaction, firstPaymentOverride: override };
}

function planInstallments(
  draft: TransactionDraft,
  totalMinor: Minor | undefined,
): { draft: TransactionDraft; firstMinor?: Minor; firstBaseMinor?: Minor } {
  if (totalMinor === undefined) return { draft };
  if (draft.recurrence.type !== 'monthly' || draft.recurrence.installments === undefined) {
    return { draft };
  }

  const count = draft.recurrence.installments;
  const amounts = splitInstallments(totalMinor, count);
  const base = splitInstallments(draft.money.baseAmountMinor, count);

  const regular = amounts[1] ?? amounts[0] ?? totalMinor;
  const regularBase = base[1] ?? base[0] ?? draft.money.baseAmountMinor;
  const first = amounts[0] ?? totalMinor;
  const firstBase = base[0] ?? draft.money.baseAmountMinor;

  const money: MoneySnapshot = {
    ...draft.money,
    amountMinor: regular,
    baseAmountMinor: regularBase,
  };

  return {
    draft: { ...draft, money },
    ...(first === regular ? {} : { firstMinor: first, firstBaseMinor: firstBase }),
  };
}
