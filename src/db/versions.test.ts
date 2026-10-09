import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { d, MONEY } from '@/domain/test-factories';
import type { IsoInstant } from '@/types/money';

import { BookandryDB } from './db';
import { materialize } from './materialize';

const NOW = '2026-10-09T10:00:00.000Z' as IsoInstant;

describe('upgrading an install from before the cash tab', () => {
  it('adds an empty cash-moves table, leaves every row where it was, and records new moves for the account', async () => {
    const factory = new IDBFactory();
    const before = new BookandryDB('before-cash', { indexedDB: factory, IDBKeyRange }, 3, NOW);
    await before.open();
    await before.transactions.put(
      materialize({
        id: 't.old',
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.groceries',
        paymentMethodId: 'pm.cash',
        money: MONEY,
        recurrence: { type: 'one_time' },
        date: d('2026-09-01'),
        seriesRootId: 't.old',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    expect(before.verno).toBe(3);
    before.close();

    const after = new BookandryDB('before-cash', { indexedDB: factory, IDBKeyRange }, Infinity, NOW);
    await after.open();
    expect(after.verno).toBe(4);
    expect(await after.cashMoves.count()).toBe(0);
    expect((await after.transactions.get('t.old'))?.paymentMethodId).toBe('pm.cash');

    await after.cashMoves.put({
      id: 'm1',
      profileId: 'p1',
      kind: 'start',
      amountMinor: 50_000,
      date: d('2026-10-01'),
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const mine = await after.cashMoves
      .where('[profileId+isDeleted+date]')
      .between(['p1', 0, ''], ['p1', 0, '￿'])
      .toArray();
    expect(mine.map((m) => m.id)).toEqual(['m1']);
    expect(await after.outbox.get(['cashMoves', 'm1'])).toBeDefined();
    after.close();
  });

  it('pulls every space again from the start, keeping each cursor so the device still counts as syncing', async () => {
    const factory = new IDBFactory();
    const before = new BookandryDB('cursors', { indexedDB: factory, IDBKeyRange }, 3, NOW);
    await before.open();
    await before.meta.bulkPut([
      { key: 'syncCursor', value: 42 },
      { key: 'syncCursor:bob', value: 7 },
      { key: 'syncEpoch:bob', value: 3 },
    ]);
    before.close();

    const after = new BookandryDB('cursors', { indexedDB: factory, IDBKeyRange }, Infinity, NOW);
    await after.open();
    expect(await after.meta.get('syncCursor')).toEqual({ key: 'syncCursor', value: 0 });
    expect(await after.meta.get('syncCursor:bob')).toEqual({ key: 'syncCursor:bob', value: 0 });
    // Only the cursors: the erase counter is not a place in the pull.
    expect((await after.meta.get('syncEpoch:bob'))?.value).toBe(3);
    after.close();
  });
});
