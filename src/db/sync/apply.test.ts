import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { updatePaymentMethod } from '@/db/repos/payment-methods';
import { applySeriesEdit } from '@/db/series-edit';
import { planSeriesEdit } from '@/domain/series-edit';
import { d, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { makeRev } from '@/lib/rev';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import { applyPage } from './apply';

const NOW = '2026-10-08T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

/** A card as a later release might write it: a kind and a basis this one has never heard of. */
const laterCard = {
  billingDay: 10,
  catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 },
  overrides: {
    credit: { basis: 'prime', margin: '9' },
    long_credit: { basis: 'cpi', margin: '2', since: '2026-10' },
    revolving: { basis: 'prime', margin: '6', minPaymentPercent: '5' },
  },
};

const row = (card: unknown) => ({
  id: 'pm.max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card,
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const record = (card: unknown) => ({
  tbl: 'paymentMethods' as const,
  id: 'pm.max',
  rev: makeRev({ ms: 1_000, counter: 0, deviceId: 'abcdefgh' }),
  deleted: false,
  row: row(card),
});

describe('a pulled card with rates a later release added', () => {
  it('is applied, kept whole, and survives an edit here', async () => {
    const report = await applyPage(handle.db, [record(laterCard)], 1);
    expect(report).toEqual({ applied: 1, skipped: 0, rejected: 0 });
    expect((await handle.db.paymentMethods.get('pm.max'))?.card).toEqual(laterCard);

    await updatePaymentMethod(handle.db, 'pm.max', { card: { ...laterCard, billingDay: 15 } as never }, NOW);
    expect((await handle.db.paymentMethods.get('pm.max'))?.card).toEqual({ ...laterCard, billingDay: 15 });
  });

  it('is still refused when a rate this release knows does not read', async () => {
    const bad = {
      ...laterCard,
      overrides: { ...laterCard.overrides, credit: { basis: 'prime', margin: 'x' } },
    };
    const report = await applyPage(handle.db, [record(bad)], 1);
    expect(report.rejected).toBe(1);
    expect(await handle.db.paymentMethods.get('pm.max')).toBeUndefined();
  });
});

describe('a transaction from this build, met by the sync apply path', () => {
  const salary = materialize({
    id: 's1',
    profileId: 'p1',
    kind: 'income',
    categoryId: 'cat.salary',
    money: MONEY,
    recurrence: { type: 'monthly', dayOfMonth: 1 },
    date: d('2026-09-01'),
    destinationId: 'pm.cash',
    seriesRootId: 's1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const recount = materialize({
    id: 'r1',
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.cash_missing',
    paymentMethodId: 'pm.cash',
    cashCount: true,
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-10-01'),
    seriesRootId: 'r1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const pulled = (row: unknown) => ({
    tbl: 'transactions' as const,
    id: (row as { id: string }).id,
    rev: makeRev({ ms: 1_000, counter: 0, deviceId: 'abcdefgh' }),
    deleted: false,
    row,
  });

  /** An edit of the note alone, through the path the edit form takes. */
  async function editNote(id: string): Promise<void> {
    const transaction = (await handle.db.transactions.get(id))!;
    const planned = planSeriesEdit({
      transaction,
      overrides: [],
      scope: 'all',
      at: transaction.date,
      patch: { note: 'edited' },
      today: d('2026-10-08'),
      now: NOW,
      newId: counterIdFactory('e'),
    });
    if (!planned.ok) throw new Error(planned.error.kind);
    await applySeriesEdit(handle.db, planned.plan);
  }

  it('stores where income went and the recount tag, and an edit of the note keeps both', async () => {
    const report = await applyPage(handle.db, [pulled(salary), pulled(recount)], 1);
    expect(report).toEqual({ applied: 2, skipped: 0, rejected: 0 });

    await editNote('s1');
    await editNote('r1');
    expect(await handle.db.transactions.get('s1')).toMatchObject({
      destinationId: 'pm.cash',
      note: 'edited',
    });
    expect(await handle.db.transactions.get('r1')).toMatchObject({
      cashCount: true,
      paymentMethodId: 'pm.cash',
      note: 'edited',
    });
  });

  it('applies a row from before either existed, which gains neither', async () => {
    const { destinationId: _gone, ...older } = salary;
    expect((await applyPage(handle.db, [pulled(older)], 1)).rejected).toBe(0);
    await editNote('s1');
    const stored = await handle.db.transactions.get('s1');
    expect(stored).toMatchObject({ note: 'edited' });
    expect(stored).not.toHaveProperty('destinationId');
    expect(stored).not.toHaveProperty('cashCount');
  });

  it('keeps a field a later build added, through an edit here: how an older build keeps ours', async () => {
    await applyPage(handle.db, [pulled({ ...salary, laterField: 'kept' })], 1);
    await editNote('s1');
    expect(await handle.db.transactions.get('s1')).toMatchObject({
      laterField: 'kept',
      destinationId: 'pm.cash',
    });
  });
});
