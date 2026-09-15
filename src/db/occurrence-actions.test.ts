import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Occurrence, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { materialize } from './materialize';
import { deleteTransaction, restoreOccurrence, skipOccurrence } from './occurrence-actions';
import { listRecentlyDeleted } from './repos/transactions';

const TODAY = d('2026-09-15');
const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const LATER = '2026-09-15T10:00:05.000Z' as IsoInstant;

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

async function seed(): Promise<Occurrence> {
  const tx = rent();
  await handle.db.transactions.add(tx);
  return occurrence(tx, '2026-09-10');
}

function occurrence(tx: Transaction, on: string, overrides: Parameters<typeof expandOccurrences>[1] = []) {
  const found = expandOccurrences(tx, overrides, d(on), d(on), {
    today: TODAY,
    includeSkipped: true,
  })[0];
  if (found === undefined) throw new Error(`no occurrence at ${on}`);
  return found;
}

const ids = () => counterIdFactory('ov');

describe('skipOccurrence', () => {
  it('writes a skip override rather than deleting anything', async () => {
    const target = await seed();

    await skipOccurrence(handle.db, target, NOW, ids());

    const rows = await handle.db.overrides.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ transactionId: 'rent', occurrenceDate: '2026-09-10', action: 'skip' });
  });

  it('leaves the series itself untouched', async () => {
    // The occurrence is generated from a rule, so there is nothing to delete -
    // and deleting the series would take every other month with it.
    const target = await seed();

    await skipOccurrence(handle.db, target, NOW, ids());

    await expect(handle.db.transactions.get('rent')).resolves.toMatchObject({ isDeleted: 0 });
  });

  it('hides the occurrence from an ordinary expansion', async () => {
    const target = await seed();
    await skipOccurrence(handle.db, target, NOW, ids());

    const overrides = await handle.db.overrides.toArray();
    const visible = expandOccurrences(rent(), overrides, d('2026-09-01'), d('2026-09-30'), {
      today: TODAY,
    });

    expect(visible).toHaveLength(0);
  });

  it('is idempotent', async () => {
    // Two taps, or two tabs. The unique [transactionId+occurrenceDate] index
    // would throw ConstraintError on a second insert.
    const target = await seed();

    await skipOccurrence(handle.db, target, NOW, ids());
    await skipOccurrence(handle.db, target, LATER, ids());

    await expect(handle.db.overrides.count()).resolves.toBe(1);
  });

  describe('when the occurrence was already edited', () => {
    const edited = async () => {
      const target = await seed();
      await handle.db.overrides.add({
        id: 'ov1',
        transactionId: 'rent',
        occurrenceDate: d('2026-09-10'),
        action: 'modify',
        patch: { note: 'with the fee', money: { ...MONEY, amountMinor: 9900 } },
        createdAt: NOW,
        updatedAt: NOW,
      });
      return target;
    };

    it('keeps the superseded edit on the skip row', async () => {
      /*
       * One override per slot, so the skip has to overwrite the edit. Dropping
       * the patch instead would silently discard work the user did on purpose,
       * and they would only find out after un-skipping.
       */
      const target = await edited();

      await skipOccurrence(handle.db, target, LATER, ids());

      const row = await handle.db.overrides.get('ov1');
      expect(row).toMatchObject({ action: 'skip', patch: { note: 'with the fee' } });
    });

    it('reuses the row id rather than deleting and inserting', async () => {
      const target = await edited();

      await skipOccurrence(handle.db, target, LATER, ids());

      await expect(handle.db.overrides.count()).resolves.toBe(1);
      await expect(handle.db.overrides.get('ov1')).resolves.toBeDefined();
    });

    it('restores the edit, not the series values, when un-skipped', async () => {
      const target = await edited();
      await skipOccurrence(handle.db, target, LATER, ids());

      await restoreOccurrence(handle.db, target, LATER, ids());

      const row = await handle.db.overrides.get('ov1');
      expect(row).toMatchObject({ action: 'modify', patch: { note: 'with the fee' } });
    });

    it('shows the edited amount while skipped, not the series amount', async () => {
      // A ghosted row displaying the series figure describes a different
      // transaction from the one the user is looking at.
      const target = await edited();
      await skipOccurrence(handle.db, target, LATER, ids());

      const overrides = await handle.db.overrides.toArray();
      const ghost = occurrence(rent(), '2026-09-10', overrides);

      expect(ghost.isSkipped).toBe(true);
      expect(ghost.money.amountMinor).toBe(9900);
    });
  });
});

describe('restoreOccurrence', () => {
  it('DELETES the skip row rather than recording an unskip', async () => {
    /*
     * A third state would pile tombstones against the unique index and start
     * throwing ConstraintError after a few skip/undo cycles. An occurrence that
     * is neither skipped nor modified is exactly one with no override.
     */
    const target = await seed();
    await skipOccurrence(handle.db, target, NOW, ids());

    await restoreOccurrence(handle.db, target, LATER, ids());

    await expect(handle.db.overrides.count()).resolves.toBe(0);
  });

  it('survives many skip/restore cycles', async () => {
    const target = await seed();

    for (let i = 0; i < 5; i += 1) {
      await skipOccurrence(handle.db, target, NOW, ids());
      await restoreOccurrence(handle.db, target, LATER, ids());
    }

    await expect(handle.db.overrides.count()).resolves.toBe(0);
  });

  it('does nothing when there is no override', async () => {
    const target = await seed();

    await expect(restoreOccurrence(handle.db, target, NOW, ids())).resolves.toBeDefined();
    await expect(handle.db.overrides.count()).resolves.toBe(0);
  });
});

describe('undo', () => {
  it('reverses a skip', async () => {
    const target = await seed();
    const action = await skipOccurrence(handle.db, target, NOW, ids());

    await action.undo(LATER);

    await expect(handle.db.overrides.count()).resolves.toBe(0);
  });

  it('reverses a delete, removing the key rather than blanking it', async () => {
    /*
     * `deletedAt` must be ABSENT, not present and undefined.
     *
     * IndexedDB cannot index undefined, so the `deletedAt` index contains only
     * soft-deleted rows - which is exactly what makes it the Recently deleted
     * query and the sweeper's query. A restored row that kept the key with an
     * undefined value would be fine in JS and wrong in the store.
     */
    await seed();
    const action = await deleteTransaction(handle.db, 'rent', NOW);

    await action.undo(LATER);

    const row = await handle.db.transactions.get('rent');
    expect(row).toMatchObject({ isDeleted: 0 });
    expect(Object.hasOwn(row ?? {}, 'deletedAt')).toBe(false);
    await expect(listRecentlyDeleted(handle.db)).resolves.toEqual([]);
  });

  it('stamps the row with when the UNDO happened', async () => {
    /*
     * Not with the delete's own timestamp. `updatedAt` decides the winner when
     * two devices' exports are merged, so an undo that reuses the delete's
     * instant loses to the delete it reversed.
     */
    await seed();
    const action = await deleteTransaction(handle.db, 'rent', NOW);

    await action.undo(LATER);

    await expect(handle.db.transactions.get('rent')).resolves.toMatchObject({ updatedAt: LATER });
  });
});

describe('deleteTransaction', () => {
  it('soft-deletes, leaving the row recoverable', async () => {
    await seed();

    await deleteTransaction(handle.db, 'rent', NOW);

    const row = await handle.db.transactions.get('rent');
    expect(row).toMatchObject({ isDeleted: 1, deletedAt: NOW });
  });

  it('hides it from expansion immediately', async () => {
    await seed();
    await deleteTransaction(handle.db, 'rent', NOW);

    const row = await handle.db.transactions.get('rent');
    expect(expandOccurrences(row!, [], d('2026-09-01'), d('2026-09-30'), { today: TODAY })).toEqual([]);
  });

  it('puts it in Recently deleted', async () => {
    // The toast's Undo is a convenience; the 24-hour window is the recovery
    // story, and it needs a screen to reach it from.
    await seed();
    await deleteTransaction(handle.db, 'rent', NOW);

    await expect(listRecentlyDeleted(handle.db)).resolves.toHaveLength(1);
  });

  it('keeps the overrides until the sweeper purges the row', async () => {
    // Cascading on soft delete would make undo lossy: the series would come
    // back with every per-occurrence edit gone.
    const target = await seed();
    await skipOccurrence(handle.db, target, NOW, ids());

    await deleteTransaction(handle.db, 'rent', NOW);

    await expect(handle.db.overrides.count()).resolves.toBe(1);
  });
});
