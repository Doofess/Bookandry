import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSeedCategories } from '@/db/seed';
import { d, modify, MONEY } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Category, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { moveBusinessType, movePastExpenses, pastExpensesFor, returnBusinessType } from './business-types';
import { materialize } from './materialize';

const NOW = '2026-10-09T10:00:00.000Z' as IsoInstant;
const LATER = '2026-10-09T11:00:00.000Z' as IsoInstant;
const UNDONE = '2026-10-09T12:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(async () => {
  handle = freshDb();
  await handle.db.categories.bulkPut([
    ...buildSeedCategories(NOW),
    { ...custom('c.coffee'), mccs: [] },
    { ...custom('c.lunch'), mccs: ['5812', '5814'] },
  ]);
});
afterEach(async () => {
  await handle.dispose();
});

function custom(id: string): Category {
  return {
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder: 50,
    isArchived: 0,
    source: 'custom',
    name: id,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const expense = (id: string, over: Partial<Transaction> = {}) =>
  materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'c.lunch',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-10-01'),
    mcc: '5812',
    mccSource: 'ai',
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });

describe('moving a business type into a category', () => {
  it('writes it there and takes it out of every other category, and says where it filed before', async () => {
    expect(await moveBusinessType(handle.db, '5812', 'c.coffee', LATER)).toEqual({ from: 'c.lunch' });
    expect((await handle.db.categories.get('c.coffee'))?.mccs).toEqual(['5812']);
    expect((await handle.db.categories.get('c.lunch'))?.mccs).toEqual(['5814']);
    // Untouched categories keep their stamp.
    expect((await handle.db.categories.get('cat.groceries'))?.updatedAt).toBe(NOW);
  });

  it('files a code nobody moved under its default before, and refuses what is not a listed code or an expense category', async () => {
    expect(await moveBusinessType(handle.db, '5411', 'c.coffee', LATER)).toEqual({ from: 'cat.groceries' });
    await expect(moveBusinessType(handle.db, '9999', 'c.coffee', LATER)).rejects.toThrow();
    await expect(moveBusinessType(handle.db, '5411', 'cat.salary', LATER)).rejects.toThrow();
  });

  it('returns one to the default, leaving past rows alone', async () => {
    await handle.db.transactions.put(expense('t1'));
    await returnBusinessType(handle.db, '5812', 'c.lunch', LATER);
    expect((await handle.db.categories.get('c.lunch'))?.mccs).toEqual(['5814']);
    expect((await handle.db.transactions.get('t1'))?.categoryId).toBe('c.lunch');
  });
});

describe('moving past expenses (Review Focus 3)', () => {
  it('takes only live expenses with this business type still filed where the old mapping put them', async () => {
    await handle.db.transactions.bulkPut([
      expense('moves'),
      // Filed elsewhere by hand: the person's choice stays.
      expense('by-hand', { categoryId: 'cat.dining' }),
      // Deleted.
      expense('deleted', { deletedAt: NOW }),
      // Income is never a business-type row, whatever a stray row carries.
      expense('income', { kind: 'income' }),
      // Another business type.
      expense('other-type', { mcc: '5814' }),
    ]);
    expect(await pastExpensesFor(handle.db, '5812', 'c.lunch')).toEqual(['moves']);
  });

  it('moves the series row, never an occurrence’s own category, and Undo puts back exactly what it moved', async () => {
    const series = expense('rent', { recurrence: { type: 'monthly', dayOfMonth: 1 }, date: d('2026-08-01') });
    const own = { ...modify('rent', d('2026-09-01'), { categoryId: 'cat.groceries' }), id: 'o1' };
    await handle.db.transactions.bulkPut([series, expense('one')]);
    await handle.db.overrides.put(own);
    const before = await handle.db.transactions.get('rent');

    const ids = await pastExpensesFor(handle.db, '5812', 'c.lunch');
    expect(ids.sort()).toEqual(['one', 'rent']);
    const undoable = await movePastExpenses(handle.db, ids, 'c.coffee', LATER);
    expect((await handle.db.transactions.get('rent'))?.categoryId).toBe('c.coffee');
    expect(await handle.db.overrides.get('o1')).toEqual(own);

    await undoable.undo(UNDONE);
    expect(await handle.db.transactions.get('rent')).toEqual({ ...before, updatedAt: UNDONE });
    expect((await handle.db.transactions.get('one'))?.categoryId).toBe('c.lunch');
  });
});
