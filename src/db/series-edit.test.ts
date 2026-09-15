import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { planSeriesEdit, type EditScope } from '@/domain/series-edit';
import { d, MONEY, skip } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { materialize } from './materialize';
import { findOverrides } from './repos/transactions';
import { applySeriesEdit, createTransaction } from './series-edit';

const TODAY = d('2026-09-15');
const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

const rent = (): Transaction =>
  materialize({
    id: 'rent',
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.rent',
    money: MONEY,
    recurrence: { type: 'monthly', dayOfMonth: 10 },
    date: d('2026-03-10'),
    seriesRootId: 'rent',
    createdAt: NOW,
    updatedAt: NOW,
  });

async function edit(scope: EditScope, at: string, patch = {}) {
  const tx = await handle.db.transactions.get('rent');
  if (!tx) throw new Error('no transaction');
  const overrides = await findOverrides(handle.db, ['rent']);

  const result = planSeriesEdit({
    transaction: tx,
    overrides,
    scope,
    at: d(at),
    patch,
    today: TODAY,
    now: NOW,
    newId: counterIdFactory('split'),
  });
  if (!result.ok) throw new Error(result.error.kind);
  await applySeriesEdit(handle.db, result.plan);
  return result.plan;
}

describe('applySeriesEdit', () => {
  beforeEach(async () => {
    await handle.db.transactions.put(rent());
  });

  it('produces exactly two rows for a split, with the right boundaries', async () => {
    await edit('future', '2026-06-10', { note: 'New rent' });

    const rows = await handle.db.transactions.orderBy('id').toArray();
    expect(rows).toHaveLength(2);

    const original = rows.find((r) => r.id === 'rent');
    const continuation = rows.find((r) => r.id !== 'rent');
    expect(original?.recurrence).toMatchObject({ endDate: '2026-05-10' });
    expect(continuation).toMatchObject({ date: '2026-06-10', note: 'New rent', splitFromId: 'rent' });
  });

  it('re-materialises seriesEnd for both halves', async () => {
    await edit('future', '2026-06-10');
    const rows = await handle.db.transactions.toArray();

    const original = rows.find((r) => r.id === 'rent');
    const continuation = rows.find((r) => r.id !== 'rent');
    // seriesEnd is what the interval query range-scans; a stale one hides the
    // row from the feed entirely.
    expect(original?.seriesEnd).toBe('2026-05-10');
    expect(continuation?.seriesEnd).toBe('9999-12-31');
    expect(continuation?.seriesStart).toBe('2026-06-10');
  });

  it('moves a future override onto the continuation', async () => {
    await handle.db.overrides.put({ ...skip('rent', d('2026-07-10')), id: 'o-future' });
    await handle.db.overrides.put({ ...skip('rent', d('2026-04-10')), id: 'o-past' });

    await edit('future', '2026-06-10');

    const continuation = (await handle.db.transactions.toArray()).find((r) => r.id !== 'rent');
    expect((await handle.db.overrides.get('o-future'))?.transactionId).toBe(continuation?.id);
    // The past one belongs to the original and must not move.
    expect((await handle.db.overrides.get('o-past'))?.transactionId).toBe('rent');
  });

  it('widens seriesEnd when a re-homed override moves an occurrence past the end', async () => {
    // The override is written BEFORE the split, so materialising the
    // continuation against a stale override list would leave this occurrence
    // outside every interval query.
    await handle.db.overrides.put({
      id: 'o-moved',
      transactionId: 'rent',
      occurrenceDate: d('2026-07-10'),
      action: 'modify',
      patch: { date: d('2027-02-01') },
      createdAt: NOW,
      updatedAt: NOW,
    });

    await edit('future', '2026-06-10', {});

    const continuation = (await handle.db.transactions.toArray()).find((r) => r.id !== 'rent');
    expect(continuation?.seriesEnd).toBe('9999-12-31');
    expect((await handle.db.overrides.get('o-moved'))?.transactionId).toBe(continuation?.id);
  });

  it('rolls back completely when a write fails mid-flight', async () => {
    const original = handle.db.transactions.put.bind(handle.db.transactions);
    let calls = 0;
    handle.db.transactions.put = ((row: Transaction) => {
      calls += 1;
      // Fail on the SECOND write: the original has been closed, the
      // continuation has not been inserted. Every occurrence from the split
      // point onward would be lost.
      if (calls === 2) return Promise.reject(new Error('disk full'));
      return original(row);
    }) as unknown as typeof original;

    try {
      await expect(edit('future', '2026-06-10')).rejects.toThrow('disk full');
    } finally {
      handle.db.transactions.put = original;
    }

    const rows = await handle.db.transactions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recurrence).toMatchObject({ dayOfMonth: 10 });
    expect(rows[0]?.recurrence).not.toHaveProperty('endDate', '2026-05-10');
  });

  it('writes one override and no new row for a single-occurrence edit', async () => {
    await edit('one', '2026-06-10', { note: 'Just this one' });

    expect(await handle.db.transactions.count()).toBe(1);
    const overrides = await handle.db.overrides.toArray();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.occurrenceDate).toBe('2026-06-10');
  });

  it('edits the whole series in place', async () => {
    await edit('all', '2026-06-10', { note: 'Everywhere' });

    expect(await handle.db.transactions.count()).toBe(1);
    expect((await handle.db.transactions.get('rent'))?.note).toBe('Everywhere');
  });
});

describe('createTransaction — תשלומים', () => {
  const fridge = (installments: number) => ({
    id: 'fridge',
    profileId: 'p1',
    kind: 'expense' as const,
    categoryId: 'cat.shopping',
    money: { ...MONEY, amountMinor: 359_000, baseAmountMinor: 359_000 },
    recurrence: { type: 'monthly' as const, dayOfMonth: 8, installments },
    date: d('2026-05-08'),
    seriesRootId: 'fridge',
    createdAt: NOW,
    updatedAt: NOW,
  });

  it('splits a total into payments that sum to it EXACTLY', async () => {
    const result = await createTransaction(handle.db, {
      draft: fridge(12),
      installmentTotalMinor: 359_000,
      now: NOW,
      newId: counterIdFactory('ov'),
    });

    const regular = result.transaction.money.amountMinor;
    const first =
      result.firstPaymentOverride?.action === 'modify'
        ? (result.firstPaymentOverride.patch.money?.amountMinor ?? 0)
        : 0;

    // Interest-free means the payments must land on the total, to the agora.
    expect(first + regular * 11).toBe(359_000);
    expect(first).toBeGreaterThan(regular);
  });

  it('puts the remainder on the FIRST payment, per the card-issuer convention', async () => {
    const result = await createTransaction(handle.db, {
      draft: { ...fridge(3), money: { ...MONEY, amountMinor: 100_000, baseAmountMinor: 100_000 } },
      installmentTotalMinor: 100_000,
      now: NOW,
      newId: counterIdFactory('ov'),
    });

    expect(result.transaction.money.amountMinor).toBe(33_333);
    const first =
      result.firstPaymentOverride?.action === 'modify'
        ? result.firstPaymentOverride.patch.money?.amountMinor
        : undefined;
    expect(first).toBe(33_334);
  });

  it('writes no override when the split is exact', async () => {
    const result = await createTransaction(handle.db, {
      draft: { ...fridge(12), money: { ...MONEY, amountMinor: 360_000, baseAmountMinor: 360_000 } },
      installmentTotalMinor: 360_000,
      now: NOW,
      newId: counterIdFactory('ov'),
    });

    // 360,000 / 12 divides cleanly, so there is no remainder to carry and an
    // override would be a row that says nothing.
    expect(result.firstPaymentOverride).toBeUndefined();
    expect(await handle.db.overrides.count()).toBe(0);
    expect(result.transaction.money.amountMinor).toBe(30_000);
  });

  it('anchors the override to the first occurrence', async () => {
    const result = await createTransaction(handle.db, {
      draft: fridge(12),
      installmentTotalMinor: 359_000,
      now: NOW,
      newId: counterIdFactory('ov'),
    });
    expect(result.firstPaymentOverride?.occurrenceDate).toBe('2026-05-08');
    expect(await handle.db.overrides.count()).toBe(1);
  });

  it('leaves an ordinary transaction alone', async () => {
    const result = await createTransaction(handle.db, {
      draft: { ...fridge(12), recurrence: { type: 'one_time' } },
      now: NOW,
      newId: counterIdFactory('ov'),
    });
    expect(result.transaction.money.amountMinor).toBe(359_000);
    expect(result.firstPaymentOverride).toBeUndefined();
  });

  it('writes the row and its override together or not at all', async () => {
    const original = handle.db.overrides.add.bind(handle.db.overrides);
    handle.db.overrides.add = (() => Promise.reject(new Error('boom'))) as unknown as typeof original;

    try {
      await expect(
        createTransaction(handle.db, {
          draft: fridge(12),
          installmentTotalMinor: 359_000,
          now: NOW,
          newId: counterIdFactory('ov'),
        }),
      ).rejects.toThrow('boom');
    } finally {
      handle.db.overrides.add = original;
    }

    // A series saved without its remainder silently charges the wrong total.
    expect(await handle.db.transactions.count()).toBe(0);
  });
});
