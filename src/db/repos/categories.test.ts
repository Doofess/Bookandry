import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { buildSeedCategories } from '@/db/seed';
import { MONEY, d, modify } from '@/domain/test-factories';
import { InvalidNameError } from '@/domain/validation';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import {
  BuiltinCategoryError,
  createCategory,
  deleteCategory,
  ensureBuiltinCategories,
  listCategories,
  renameCategory,
  setCategoryArchived,
} from './categories';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(async () => {
  handle = freshDb();
  await handle.db.categories.bulkPut(buildSeedCategories(NOW));
});
afterEach(async () => {
  await handle.dispose();
});

const addTx = async (id: string, categoryId: string) =>
  handle.db.transactions.put(
    materialize({
      id,
      profileId: 'p1',
      kind: 'expense',
      categoryId,
      money: MONEY,
      recurrence: { type: 'one_time' },
      date: d('2026-09-01'),
      seriesRootId: id,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

describe('listCategories', () => {
  it('hides archived categories by default', async () => {
    await setCategoryArchived(handle.db, 'cat.gift', true, NOW);
    const visible = await listCategories(handle.db);
    expect(visible.some((c) => c.id === 'cat.gift')).toBe(false);
    expect(
      (await listCategories(handle.db, { includeArchived: true })).some((c) => c.id === 'cat.gift'),
    ).toBe(true);
  });

  it('filters by kind and stays in sort order', async () => {
    const income = await listCategories(handle.db, { kind: 'income' });
    expect(income.every((c) => c.kind === 'income')).toBe(true);
    expect(income.map((c) => c.sortOrder)).toEqual([...income.map((c) => c.sortOrder)].sort((a, b) => a - b));
  });

  it('includes the Israeli built-ins nobody files under Utilities', async () => {
    const ids = (await listCategories(handle.db, { kind: 'expense' })).map((c) => c.id);
    expect(ids).toContain('cat.arnona');
    expect(ids).toContain('cat.buildingFee');
  });
});

describe('custom categories', () => {
  it('appends after the last built-in of its kind', async () => {
    const before = await listCategories(handle.db, { kind: 'expense' });
    const highest = Math.max(...before.map((c) => c.sortOrder));

    const created = await createCategory(
      handle.db,
      'c1',
      { name: 'Pets', kind: 'expense', icon: 'Dog' },
      NOW,
    );

    expect(created.sortOrder).toBe(highest + 1);
    expect(created.source).toBe('custom');
    // Income and expense are ordered independently, so a new expense must not
    // renumber against the income list.
    const income = await listCategories(handle.db, { kind: 'income' });
    expect(Math.max(...income.map((c) => c.sortOrder))).toBeLessThan(created.sortOrder);
  });

  it('enforces the name limits', async () => {
    await expect(
      createCategory(handle.db, 'c1', { name: '  ', kind: 'expense', icon: 'Dog' }, NOW),
    ).rejects.toThrow(InvalidNameError);
    await expect(
      createCategory(handle.db, 'c2', { name: 'x'.repeat(41), kind: 'expense', icon: 'Dog' }, NOW),
    ).rejects.toThrow(InvalidNameError);
  });
});

describe('built-ins are archivable, not editable', () => {
  it('refuses to rename one, because the name is an i18n key', async () => {
    await expect(renameCategory(handle.db, 'cat.groceries', 'Food', NOW)).rejects.toThrow(
      BuiltinCategoryError,
    );
  });

  it('refuses to delete one', async () => {
    await expect(deleteCategory(handle.db, 'cat.groceries', {}, NOW)).rejects.toThrow(BuiltinCategoryError);
  });

  it('archives one instead', async () => {
    await setCategoryArchived(handle.db, 'cat.groceries', true, NOW);
    expect((await handle.db.categories.get('cat.groceries'))?.isArchived).toBe(1);
    await setCategoryArchived(handle.db, 'cat.groceries', false, NOW);
    expect((await handle.db.categories.get('cat.groceries'))?.archivedAt).toBeUndefined();
  });
});

describe('deleteCategory', () => {
  beforeEach(async () => {
    await createCategory(handle.db, 'c1', { name: 'Pets', kind: 'expense', icon: 'Dog' }, NOW);
  });

  it('moves transactions to the fallback category', async () => {
    await addTx('t1', 'c1');
    const result = await deleteCategory(handle.db, 'c1', {}, NOW);

    expect(result.transactionsMoved).toBe(1);
    expect((await handle.db.transactions.get('t1'))?.categoryId).toBe('cat.otherExpense');
    expect(await handle.db.categories.get('c1')).toBeUndefined();
  });

  it('moves per-occurrence category edits too', async () => {
    await addTx('t1', 'cat.groceries');
    await handle.db.overrides.put({
      ...modify('t1', d('2026-09-01'), { categoryId: 'c1' }),
      id: 'o1',
    });

    const result = await deleteCategory(handle.db, 'c1', { reassignTo: 'cat.shopping' }, NOW);

    expect(result.overridesMoved).toBe(1);
    const override = await handle.db.overrides.get('o1');
    // An override pointing at a deleted category renders one feed row with no
    // icon and no name, and nothing on screen explains why.
    expect(override?.action === 'modify' ? override.patch.categoryId : undefined).toBe('cat.shopping');
  });

  it('refuses to move expenses into an income category', async () => {
    await addTx('t1', 'c1');
    await expect(deleteCategory(handle.db, 'c1', { reassignTo: 'cat.salary' }, NOW)).rejects.toThrow();
    expect(await handle.db.categories.get('c1')).toBeDefined();
  });
});

describe('the built-in categories on an older install', () => {
  it('adds the ones it lacks in their places, and moves an untouched "Other" back to last', async () => {
    // As a device from before AI & software and the rest: Other was 13th of 14.
    for (const id of [
      'cat.aiSoftware',
      'cat.phoneInternet',
      'cat.travel',
      'cat.kids',
      'cat.pets',
      'cat.fitness',
      'cat.currencyExchange',
      'cat.loans',
      'cat.cardFees',
    ]) {
      await handle.db.categories.delete(id);
    }
    await handle.db.categories.update('cat.otherExpense', { sortOrder: 13 });
    await handle.db.outbox.clear();

    await ensureBuiltinCategories(handle.db, NOW);

    const names = (await listCategories(handle.db, { kind: 'expense' })).map((c) => c.id);
    expect(names.slice(-11)).toEqual([
      'cat.aiSoftware',
      'cat.phoneInternet',
      'cat.travel',
      'cat.kids',
      'cat.pets',
      'cat.fitness',
      'cat.currencyExchange',
      'cat.loans',
      'cat.cardFees',
      'cat.cash_missing',
      'cat.otherExpense',
    ]);
    expect(await handle.db.outbox.toArray()).toEqual([]);
  });

  it('leaves an "Other" someone has reordered or archived where they put it', async () => {
    await handle.db.categories.delete('cat.aiSoftware');
    await handle.db.categories.update('cat.otherExpense', {
      sortOrder: 0,
      isArchived: 1,
      updatedAt: '2026-09-20T10:00:00.000Z' as IsoInstant,
    });

    await ensureBuiltinCategories(handle.db, NOW);

    expect(await handle.db.categories.get('cat.otherExpense')).toMatchObject({ sortOrder: 0, isArchived: 1 });
    expect(await handle.db.categories.get('cat.aiSoftware')).toMatchObject({
      source: 'builtin',
      isArchived: 0,
    });
  });

  it('adds the two cash categories to an install from before the cash tab, before "Other"', async () => {
    await handle.db.categories.bulkDelete(['cat.cash_found', 'cat.cash_missing']);
    await handle.db.outbox.clear();

    await ensureBuiltinCategories(handle.db, NOW);

    expect(await handle.db.categories.get('cat.cash_found')).toMatchObject({
      kind: 'income',
      source: 'builtin',
      nameKey: 'categories:builtin.cashFound',
    });
    expect(await handle.db.categories.get('cat.cash_missing')).toMatchObject({
      kind: 'expense',
      nameKey: 'categories:builtin.cashMissing',
    });
    const income = (await listCategories(handle.db, { kind: 'income' })).map((c) => c.id);
    expect(income.slice(-2)).toEqual(['cat.cash_found', 'cat.otherIncome']);
    expect(await handle.db.outbox.toArray()).toEqual([]);
  });
});

describe('business types moved into a category', () => {
  it('survive a rename and an archive: every write spreads the stored row', async () => {
    const custom = await createCategory(
      handle.db,
      'cat.custom',
      { name: 'Coffee', kind: 'expense', icon: 'Circle' },
      NOW,
    );
    await handle.db.categories.update(custom.id, { mccs: ['5814'] });

    await renameCategory(handle.db, custom.id, 'Coffee out', NOW);
    await setCategoryArchived(handle.db, custom.id, true, NOW);
    expect(await handle.db.categories.get(custom.id)).toMatchObject({
      name: 'Coffee out',
      isArchived: 1,
      mccs: ['5814'],
    });
  });
});

describe('a category’s hue (§1.4, the rollout with older builds)', () => {
  it('starts a new custom category on the hue least used among its kind', async () => {
    const created = await createCategory(
      handle.db,
      'c1',
      { name: 'Garden', kind: 'expense', icon: 'Flower' },
      NOW,
    );
    expect(created.hue).toBe('lime');
    expect((await handle.db.categories.get('c1'))?.hue).toBe('lime');
  });

  it('keeps hue through a rename and an archive, even a key this build does not know', async () => {
    await createCategory(handle.db, 'c2', { name: 'Garden', kind: 'expense', icon: 'Flower' }, NOW);
    await handle.db.categories.update('c2', { hue: 'teal-3' });

    await renameCategory(handle.db, 'c2', 'Gardening', NOW);
    await setCategoryArchived(handle.db, 'c2', true, NOW);
    await setCategoryArchived(handle.db, 'c2', false, NOW);

    expect((await handle.db.categories.get('c2'))?.hue).toBe('teal-3');
  });

  it('keeps a re-coloured built-in’s hue when the built-ins are checked again', async () => {
    await handle.db.categories.update('cat.rent', { hue: 'lime' });
    await ensureBuiltinCategories(handle.db, NOW);
    expect((await handle.db.categories.get('cat.rent'))?.hue).toBe('lime');
  });
});
