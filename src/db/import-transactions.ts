import type { TxFormParsed } from '@/domain/tx-form';
import type { Currency, IsoInstant } from '@/types/money';

import type { BookandryDB } from './db';
import { restoreDeleted, softDelete } from './repos/transactions';
import { saveNewTransaction, type ResolvedRate } from './save-transaction';

/** One reviewed row, ready to save: the form's own output, and its rate when it needs one. */
export type ImportItem = {
  readonly parsed: TxFormParsed;
  readonly rate?: ResolvedRate;
  readonly feeRate?: string;
};

/**
 * Every row "Smart import" found and the person kept, saved through the same
 * path the form uses - all of them, or none. Rates are resolved before this
 * is called: a network wait inside a Dexie transaction lets it commit early.
 */
export async function saveImported(
  db: BookandryDB,
  items: readonly ImportItem[],
  context: { readonly baseCurrency: Currency; readonly now: IsoInstant; readonly newId: () => string },
): Promise<string[]> {
  const ids: string[] = [];
  await db.transaction('rw', [db.transactions, db.overrides], async () => {
    for (const item of items) {
      const result = await saveNewTransaction(db, {
        parsed: item.parsed,
        baseCurrency: context.baseCurrency,
        ...(item.rate === undefined ? {} : { rate: item.rate }),
        ...(item.feeRate === undefined ? {} : { feeRate: item.feeRate }),
        now: context.now,
        newId: context.newId,
      });
      ids.push(result.transaction.id);
    }
  });
  return ids;
}

/** Undo a whole import, in one step; it stays in Recently deleted like any deletion. */
export async function undoImport(db: BookandryDB, ids: readonly string[], now: IsoInstant): Promise<void> {
  await db.transaction('rw', [db.transactions], async () => {
    for (const id of ids) await softDelete(db, id, now);
  });
}

/** And back again. */
export async function redoImport(db: BookandryDB, ids: readonly string[], now: IsoInstant): Promise<void> {
  await db.transaction('rw', [db.transactions], async () => {
    for (const id of ids) await restoreDeleted(db, id, now);
  });
}
