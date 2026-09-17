import { beforeEach, describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';
import type { IsoInstant } from '@/types/money';

import { db } from './db';
import { materialize } from './materialize';
import { startSweeper, SWEEP_INTERVAL_MS, type SweepWaker } from './sweeper';

/**
 * The sweeper runs.
 *
 * That sentence is the whole point of this file. `sweepExpiredDeletions` was
 * written, tested, given a cross-tab lock and a dedicated index - and never
 * called from anywhere, so "recoverable for 24 hours, then deleted" was a
 * promise the UI made and the database never kept. Unit tests for the purge
 * itself all passed the entire time, because they called it directly.
 */

const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-17T12:00:00.000Z');

async function reset(): Promise<void> {
  await db.open();
  await db.transaction('rw', [db.transactions, db.overrides], async () => {
    await db.transactions.clear();
    await db.overrides.clear();
  });
}

async function addDeleted(id: string, deletedAtMs: number): Promise<void> {
  const at = new Date(deletedAtMs).toISOString() as IsoInstant;
  await db.transactions.put(
    materialize(
      {
        id,
        seriesRootId: id,
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.groceries',
        money: {
          amountMinor: 4500,
          currency: 'USD',
          baseCurrency: 'USD',
          baseAmountMinor: 4500,
          rateUsed: '1',
          rateDate: d('2026-09-01'),
          rateSource: 'manual',
        },
        recurrence: { type: 'one_time' },
        date: d('2026-09-01'),
        // materialize derives isDeleted from deletedAt; setting both by hand is
        // exactly the drift the derived column exists to prevent.
        deletedAt: at,
        createdAt: at,
        updatedAt: at,
      },
      [],
    ),
  );
}

/** The sweeper is fire-and-forget, so wait for its write rather than its promise. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if ((await db.transactions.count()) === 0) return;
  }
}

/** Stands in for `document`, which the node-side db project does not have. */
function fakeWaker(): SweepWaker & { wake: () => void } {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible',
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    wake: () => {
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(reset);

describe('startSweeper', () => {
  it('purges a tombstone past the recovery window, without being asked twice', async () => {
    await addDeleted('old', NOW - RECOVERY_WINDOW_MS - 1000);

    const handle = startSweeper(db, () => NOW);
    await settle();
    handle.stop();

    expect(await db.transactions.count()).toBe(0);
  });

  it('leaves a tombstone still inside the window alone', async () => {
    // The whole point of the 24 hours: undo has to still work.
    await addDeleted('fresh', NOW - 1000);

    const handle = startSweeper(db, () => NOW);
    await settle();
    handle.stop();

    expect(await db.transactions.count()).toBe(1);
  });

  it('runs once per interval, not once per tab focus', async () => {
    /*
     * `visibilitychange` fires every time the user flicks back to the tab. A
     * sweep on each of those is pointless work against IndexedDB on the exact
     * frame the user is looking at it.
     */
    let clock = NOW;
    const waker = fakeWaker();
    const handle = startSweeper(db, () => clock, { intervalMs: SWEEP_INTERVAL_MS, waker });
    await settle();

    await addDeleted('old', NOW - RECOVERY_WINDOW_MS - 1000);

    // Same minute: the sweeper should decline to run again.
    waker.wake();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await db.transactions.count()).toBe(1);

    // An hour later it takes its turn.
    clock = NOW + SWEEP_INTERVAL_MS;
    waker.wake();
    await settle();
    expect(await db.transactions.count()).toBe(0);

    handle.stop();
  });

  it('sweeps on a timer, not only when the tab is refocused', async () => {
    /*
     * The opposite miss from the one above.
     *
     * `visibilitychange` never fires on a desktop tab that is simply left open
     * and focused - the most ordinary way to leave a PWA running - so boot was
     * the only sweep such a session ever got. Tombstones aged out of the
     * 24-hour window and stayed in the database, still listed under "Recently
     * deleted", because `listRecentlyDeleted` filters on being deleted rather
     * than on age.
     */
    let clock = NOW;
    const waker = fakeWaker(); // deliberately never woken
    const handle = startSweeper(db, () => clock, { intervalMs: 20, waker });
    await settle();

    await addDeleted('old', NOW - RECOVERY_WINDOW_MS - 1000);
    clock = NOW + 60_000; // past the throttle, so the tick is allowed to run
    await settle();
    handle.stop();

    expect(await db.transactions.count()).toBe(0);
  });

  it('clears the timer when stopped', async () => {
    let clock = NOW;
    const handle = startSweeper(db, () => clock, { intervalMs: 20, waker: fakeWaker() });
    await settle();
    handle.stop();

    await addDeleted('old', NOW - RECOVERY_WINDOW_MS - 1000);
    clock = NOW + 60_000;
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(await db.transactions.count()).toBe(1);
  });

  it('stops listening when stopped', async () => {
    let clock = NOW;
    const waker = fakeWaker();
    const handle = startSweeper(db, () => clock, { intervalMs: SWEEP_INTERVAL_MS, waker });
    await settle();
    handle.stop();

    await addDeleted('old', NOW - RECOVERY_WINDOW_MS - 1000);
    clock = NOW + SWEEP_INTERVAL_MS;
    waker.wake();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(await db.transactions.count()).toBe(1);
  });
});
