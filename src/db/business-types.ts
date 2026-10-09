import { isMcc } from '@/domain/mcc';
import { categoryForMcc } from '@/domain/mcc-categories';
import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from './db';
import { undoableWrite, type UndoableAction } from './occurrence-actions';

/**
 * The person's moves of business types between categories (spec §4.2).
 *
 * A move lives on the category it went INTO (`Category.mccs`); the default
 * table is never written. Every write spreads the stored row, so a field a
 * later build added survives it.
 */

/**
 * Move `code` into the expense category `toId`: added to its `mccs`, and
 * taken out of every other category's, in one transaction - so no moment, on
 * this device or a synced one, has two categories claiming it. Returns the
 * category it filed under just before, for the past-expenses question.
 */
export async function moveBusinessType(
  db: BookandryDB,
  code: string,
  toId: string,
  now: IsoInstant,
): Promise<{ readonly from: string | undefined }> {
  if (!isMcc(code)) throw new Error('Not a business type');
  return db.transaction('rw', db.categories, async () => {
    const all = await db.categories.toArray();
    const target = all.find((c) => c.id === toId);
    if (target?.kind !== 'expense') throw new Error(`No expense category ${toId}`);
    const from = categoryForMcc(code, all);
    for (const category of all) {
      if (category.id === toId || category.mccs?.includes(code) !== true) continue;
      await db.categories.put({
        ...category,
        mccs: category.mccs.filter((c) => c !== code),
        updatedAt: now,
      });
    }
    if (target.mccs?.includes(code) !== true) {
      await db.categories.put({ ...target, mccs: [...(target.mccs ?? []), code], updatedAt: now });
    }
    return { from };
  });
}

/** "Return to default": `code` out of this category's moves. Past rows are left where they are. */
export async function returnBusinessType(
  db: BookandryDB,
  code: string,
  categoryId: string,
  now: IsoInstant,
): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const category = await db.categories.get(categoryId);
    if (category?.mccs?.includes(code) !== true) return;
    await db.categories.put({ ...category, mccs: category.mccs.filter((c) => c !== code), updatedAt: now });
  });
}

/**
 * What "move past expenses" would move: live expenses with this business
 * type still filed where its old mapping put them. A row the person filed
 * somewhere else, a deleted row and income are not (Review Focus 3).
 */
export async function pastExpensesFor(db: BookandryDB, code: string, fromId: string): Promise<string[]> {
  const rows = await db.transactions.where('categoryId').equals(fromId).toArray();
  return rows.filter((t) => t.isDeleted === 0 && t.kind === 'expense' && t.mcc === code).map((t) => t.id);
}

/**
 * Re-file those rows, in one undoable write. The series rows only: an
 * override that gave one occurrence its own category is the person's edit,
 * and stays (spec point 11).
 */
export async function movePastExpenses(
  db: BookandryDB,
  ids: readonly string[],
  toId: string,
  now: IsoInstant,
): Promise<UndoableAction> {
  return undoableWrite(db, [{ table: 'transactions', ids }], async () => {
    for (const id of ids) {
      const row = await db.transactions.get(id);
      if (row !== undefined) await db.transactions.put({ ...row, categoryId: toId, updatedAt: now });
    }
  });
}
