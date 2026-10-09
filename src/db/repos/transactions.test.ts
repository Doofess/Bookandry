import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { d, MONEY } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Override, Recurrence } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  ALL_PROFILES,
  categoryFromHistory,
  findCandidates,
  findOverrides,
  listRecentlyDeleted,
  loadIncomeOccurrences,
  purgeExpiredDeletions,
  putTransaction,
  removeOverride,
  restoreDeleted,
  softDelete,
} from './transactions';

const ts = (s: string): IsoInstant => s as IsoInstant;
const NOW = ts('2026-09-15T10:00:00.000Z');

let handle: TestDb;

beforeEach(() => {
  handle = freshDb();
});

afterEach(async () => {
  await handle.dispose();
});

async function add(opts: {
  id: string;
  date: string;
  recurrence: Recurrence;
  profileId?: string;
  overrides?: Override[];
}) {
  return putTransaction(
    handle.db,
    {
      id: opts.id,
      profileId: opts.profileId ?? 'p1',
      kind: 'expense',
      categoryId: 'cat.groceries',
      money: MONEY,
      date: d(opts.date),
      recurrence: opts.recurrence,
      seriesRootId: opts.id,
      createdAt: NOW,
      updatedAt: NOW,
    },
    opts.overrides ?? [],
  );
}

describe('interval query', () => {
  it('returns a series that STARTED YEARS EARLIER but still runs', async () => {
    // The defect a date-based index would cause: querying September 2026 with
    // `where(date).between(...)` silently drops this row entirely.
    await add({ id: 'old', date: '2020-01-01', recurrence: { type: 'monthly', dayOfMonth: 1 } });

    const found = await findCandidates(handle.db, {
      profileId: 'p1',
      from: d('2026-09-01'),
      to: d('2026-09-30'),
    });
    expect(found.map((t) => t.id)).toEqual(['old']);
  });

  it('excludes a series that ended before the window', async () => {
    await add({
      id: 'ended',
      date: '2020-01-01',
      recurrence: { type: 'monthly', dayOfMonth: 1, endDate: d('2021-01-01') },
    });
    const found = await findCandidates(handle.db, {
      profileId: 'p1',
      from: d('2026-09-01'),
      to: d('2026-09-30'),
    });
    expect(found).toEqual([]);
  });

  it('excludes a series that starts after the window', async () => {
    await add({ id: 'future', date: '2027-01-01', recurrence: { type: 'monthly', dayOfMonth: 1 } });
    const found = await findCandidates(handle.db, {
      profileId: 'p1',
      from: d('2026-09-01'),
      to: d('2026-09-30'),
    });
    expect(found).toEqual([]);
  });

  it('RETURNS a long-ended series when an override moved an occurrence forward', async () => {
    // This is the half of the moved-in fix that lives in the DB layer. Without
    // seriesEnd widening in materialize(), the row is never a candidate and the
    // expansion-side fix can never run.
    const ov: Override = {
      id: 'ov1',
      transactionId: 'moved',
      occurrenceDate: d('2021-01-01'),
      action: 'modify',
      patch: { date: d('2026-09-20') },
      createdAt: NOW,
      updatedAt: NOW,
    };
    await handle.db.overrides.put(ov);
    await add({
      id: 'moved',
      date: '2020-01-01',
      recurrence: { type: 'monthly', dayOfMonth: 1, endDate: d('2021-01-01') },
      overrides: [ov],
    });

    const found = await findCandidates(handle.db, {
      profileId: 'p1',
      from: d('2026-09-01'),
      to: d('2026-09-30'),
    });
    expect(found.map((t) => t.id)).toEqual(['moved']);
  });

  it('scopes by profile, and merges every profile for the All view', async () => {
    await add({ id: 'a', date: '2026-09-01', recurrence: { type: 'one_time' }, profileId: 'p1' });
    await add({ id: 'b', date: '2026-09-02', recurrence: { type: 'one_time' }, profileId: 'p2' });

    const range = { from: d('2026-09-01'), to: d('2026-09-30') };
    expect((await findCandidates(handle.db, { ...range, profileId: 'p1' })).map((t) => t.id)).toEqual(['a']);
    expect(
      (await findCandidates(handle.db, { ...range, profileId: ALL_PROFILES })).map((t) => t.id).sort(),
    ).toEqual(['a', 'b']);
  });

  it('never returns soft-deleted rows', async () => {
    await add({ id: 'gone', date: '2026-09-01', recurrence: { type: 'one_time' } });
    await softDelete(handle.db, 'gone', NOW);

    const found = await findCandidates(handle.db, {
      profileId: 'p1',
      from: d('2026-09-01'),
      to: d('2026-09-30'),
    });
    expect(found).toEqual([]);
  });
});

describe('soft delete and recovery', () => {
  async function seedDeleted(deletedAt: string) {
    await add({ id: 'tx1', date: '2026-09-01', recurrence: { type: 'monthly', dayOfMonth: 1 } });
    await handle.db.overrides.put({
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-10-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await softDelete(handle.db, 'tx1', ts(deletedAt));
  }

  it('marks the row deleted without removing it', async () => {
    await seedDeleted('2026-09-15T10:00:00.000Z');
    const row = await handle.db.transactions.get('tx1');
    expect(row?.isDeleted).toBe(1);
    expect(row?.deletedAt).toBe('2026-09-15T10:00:00.000Z');
  });

  it('restores a soft-deleted row', async () => {
    await seedDeleted('2026-09-15T10:00:00.000Z');
    await restoreDeleted(handle.db, 'tx1', NOW);
    const row = await handle.db.transactions.get('tx1');
    expect(row?.isDeleted).toBe(0);
    expect(row?.deletedAt).toBeUndefined();
  });

  it('lists recently deleted rows', async () => {
    await seedDeleted('2026-09-15T10:00:00.000Z');
    expect((await listRecentlyDeleted(handle.db)).map((t) => t.id)).toEqual(['tx1']);
  });

  it('keeps a row inside the 24h recovery window', async () => {
    // The spec purged on toast expiry. A mis-swipe noticed ten minutes later
    // would have been unrecoverable, on a device with no backup.
    await seedDeleted('2026-09-15T10:00:00.000Z');
    const tenMinutesLater = Date.parse('2026-09-15T10:10:00.000Z');

    const result = await purgeExpiredDeletions(handle.db, tenMinutesLater);
    expect(result.purged).toBe(0);
    expect(await handle.db.transactions.get('tx1')).toBeDefined();
  });

  it('purges after the window AND CASCADES the overrides', async () => {
    // Without the cascade, every deleted recurring transaction leaks its
    // per-occurrence edits permanently. The spec never mentions it.
    await seedDeleted('2026-09-15T10:00:00.000Z');
    const twoDaysLater = Date.parse('2026-09-17T10:00:00.000Z');

    const result = await purgeExpiredDeletions(handle.db, twoDaysLater);
    expect(result).toEqual({ purged: 1, overridesRemoved: 1 });
    expect(await handle.db.transactions.get('tx1')).toBeUndefined();
    expect(await handle.db.overrides.count()).toBe(0);
  });

  it('leaves live rows and their overrides alone', async () => {
    await add({ id: 'live', date: '2026-09-01', recurrence: { type: 'one_time' } });
    await seedDeleted('2026-09-15T10:00:00.000Z');

    await purgeExpiredDeletions(handle.db, Date.parse('2026-09-17T10:00:00.000Z'));
    expect(await handle.db.transactions.get('live')).toBeDefined();
  });

  it('is a no-op when nothing has expired', async () => {
    await add({ id: 'live', date: '2026-09-01', recurrence: { type: 'one_time' } });
    expect(await purgeExpiredDeletions(handle.db, Date.now())).toEqual({
      purged: 0,
      overridesRemoved: 0,
    });
  });
});

describe('override lifecycle', () => {
  it('undoes a skip by DELETING the row, never by adding an unskip', async () => {
    // An "unskip" action would pile tombstones against the unique
    // [transactionId+occurrenceDate] index and start throwing ConstraintError
    // after a few skip/undo cycles.
    await add({ id: 'tx1', date: '2026-09-01', recurrence: { type: 'monthly', dayOfMonth: 1 } });

    const put = async () =>
      handle.db.overrides.put({
        id: 'ov1',
        transactionId: 'tx1',
        occurrenceDate: d('2026-10-01'),
        action: 'skip',
        createdAt: NOW,
        updatedAt: NOW,
      });

    await put();
    await removeOverride(handle.db, 'tx1', d('2026-10-01'));
    expect(await handle.db.overrides.count()).toBe(0);

    // Skip/undo repeatedly without accumulating anything.
    await put();
    await removeOverride(handle.db, 'tx1', d('2026-10-01'));
    await put();
    expect(await handle.db.overrides.count()).toBe(1);
  });

  it('enforces one override per slot at the storage layer', async () => {
    await add({ id: 'tx1', date: '2026-09-01', recurrence: { type: 'monthly', dayOfMonth: 1 } });
    await handle.db.overrides.put({
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-10-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });

    // A second override for the same slot must be rejected rather than silently
    // producing two conflicting patches.
    await expect(
      handle.db.overrides.add({
        id: 'ov2',
        transactionId: 'tx1',
        occurrenceDate: d('2026-10-01'),
        action: 'skip',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toThrow();
  });

  it('finds overrides for a set of transactions', async () => {
    await add({ id: 'tx1', date: '2026-09-01', recurrence: { type: 'monthly', dayOfMonth: 1 } });
    await handle.db.overrides.put({
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-10-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect((await findOverrides(handle.db, ['tx1'])).map((o) => o.id)).toEqual(['ov1']);
    expect(await findOverrides(handle.db, [])).toEqual([]);
  });
});

describe('findOverrides at scale', () => {
  /**
   * The two lookup strategies must be indistinguishable.
   *
   * Above OVERRIDE_LOOKUP_LIMIT the repo stops using `anyOf` - which walks the
   * index once per key, and measured as the single largest cost in loading a
   * dense month - and scans a table that is small by construction instead. A
   * fast path that returns different rows is not an optimisation.
   */
  it('returns the same rows either side of the threshold', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 260; i += 1) {
      const id = `t${String(i).padStart(3, '0')}`;
      ids.push(id);
      if (i % 10 === 0) {
        await handle.db.overrides.put({
          id: `o${String(i)}`,
          transactionId: id,
          occurrenceDate: d('2026-09-01'),
          action: 'skip',
          createdAt: NOW,
          updatedAt: NOW,
        });
      }
    }
    // An override belonging to a transaction NOT asked for must never come back.
    await handle.db.overrides.put({
      id: 'o-other',
      transactionId: 'not-requested',
      occurrenceDate: d('2026-09-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const viaScan = await findOverrides(handle.db, ids);
    const viaAnyOf = await findOverrides(handle.db, ids.slice(0, 100));

    expect(viaScan.map((o) => o.id).sort()).toEqual(
      Array.from({ length: 26 }, (_, i) => `o${String(i * 10)}`).sort(),
    );
    expect(viaScan.some((o) => o.transactionId === 'not-requested')).toBe(false);
    expect(viaAnyOf.map((o) => o.id).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `o${String(i * 10)}`).sort(),
    );
  });

  it('returns nothing for no ids, without touching the table', async () => {
    await handle.db.overrides.put({
      id: 'o1',
      transactionId: 't1',
      occurrenceDate: d('2026-09-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(await findOverrides(handle.db, [])).toEqual([]);
  });
});

describe('categoryFromHistory', () => {
  const save = (
    id: string,
    note: string,
    categoryId: string,
    updatedAt: string,
    kind: 'expense' | 'income' = 'expense',
  ) =>
    putTransaction(
      handle.db,
      {
        id,
        profileId: 'p1',
        kind,
        categoryId,
        money: MONEY,
        date: d('2026-09-01'),
        recurrence: { type: 'one_time' },
        seriesRootId: id,
        note,
        createdAt: ts(updatedAt),
        updatedAt: ts(updatedAt),
      },
      [],
    );

  it('files a name where it was filed before, ignoring case and spacing', async () => {
    await save('a', 'Claude Max Plan', 'cat.aiSoftware', '2026-09-01T10:00:00.000Z');
    expect(await categoryFromHistory(handle.db, 'expense', '  claude   max plan ')).toBe('cat.aiSoftware');
  });

  it('follows the latest choice, so a correction sticks', async () => {
    await save('old', 'Netflix', 'cat.subscriptions', '2026-08-01T10:00:00.000Z');
    await save('new', 'Netflix', 'cat.entertainment', '2026-09-01T10:00:00.000Z');
    expect(await categoryFromHistory(handle.db, 'expense', 'Netflix')).toBe('cat.entertainment');
  });

  it('ignores deleted rows, the other kind, and names it has never seen', async () => {
    await save('gone', 'Wolt', 'cat.dining', '2026-09-01T10:00:00.000Z');
    await softDelete(handle.db, 'gone', NOW);
    await save('in', 'Amazon', 'cat.refund', '2026-09-01T10:00:00.000Z', 'income');
    expect(await categoryFromHistory(handle.db, 'expense', 'Wolt')).toBeUndefined();
    expect(await categoryFromHistory(handle.db, 'expense', 'Amazon')).toBeUndefined();
    expect(await categoryFromHistory(handle.db, 'expense', 'Something new')).toBeUndefined();
    expect(await categoryFromHistory(handle.db, 'expense', '   ')).toBeUndefined();
  });
});

describe('loadIncomeOccurrences', () => {
  const incomeTx = (
    id: string,
    date: string,
    recurrence: Recurrence,
    kind: 'income' | 'expense' = 'income',
  ) => ({
    id,
    profileId: id === 'other' ? 'p2' : 'p1',
    kind,
    categoryId: 'cat.salary',
    money: MONEY,
    date: d(date),
    recurrence,
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const query = { from: d('2026-08-01'), to: d('2026-09-15'), today: d('2026-09-15') };

  it('is everyone’s income only, within the window', async () => {
    await putTransaction(handle.db, incomeTx('pay', '2026-07-10', { type: 'monthly', dayOfMonth: 10 }), []);
    await putTransaction(handle.db, incomeTx('other', '2026-09-01', { type: 'one_time' }), []);
    await putTransaction(handle.db, incomeTx('spend', '2026-09-02', { type: 'one_time' }, 'expense'), []);
    await putTransaction(handle.db, incomeTx('later', '2026-09-20', { type: 'one_time' }), []);

    const got = await loadIncomeOccurrences(handle.db, query);
    expect(got.map((o) => [o.seriesId, o.date]).sort()).toEqual([
      ['other', '2026-09-01'],
      ['pay', '2026-08-10'],
      ['pay', '2026-09-10'],
    ]);
  });

  it('applies an override to its own series only', async () => {
    const ov: Override = {
      id: 'ov',
      transactionId: 'pay',
      occurrenceDate: d('2026-09-10'),
      action: 'modify',
      patch: { destinationId: 'leumi', date: d('2026-09-12') },
      createdAt: NOW,
      updatedAt: NOW,
    };
    await handle.db.overrides.put(ov);
    await putTransaction(handle.db, incomeTx('pay', '2026-08-10', { type: 'monthly', dayOfMonth: 10 }), [ov]);
    await putTransaction(handle.db, incomeTx('other', '2026-08-10', { type: 'monthly', dayOfMonth: 10 }), []);

    const got = await loadIncomeOccurrences(handle.db, query);
    const pay = got.find((o) => o.seriesId === 'pay' && o.originalDate === '2026-09-10');
    expect(pay?.date).toBe('2026-09-12');
    expect(pay?.destinationId).toBe('leumi');
    const other = got.find((o) => o.seriesId === 'other' && o.originalDate === '2026-09-10');
    expect(other?.date).toBe('2026-09-10');
    expect(other?.destinationId).toBeUndefined();
  });
});
