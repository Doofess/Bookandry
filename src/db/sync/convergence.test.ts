import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createCategory, deleteCategory, renameCategory } from '@/db/repos/categories';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings } from '@/db/repos/settings';
import { d, MONEY, skip } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { freshDb } from '@/test/db-harness';
import { MemorySyncServer } from '@/test/memory-sync-server';
import type { IsoInstant } from '@/types/money';

import { syncOnce } from './engine';

/*
 * The property the whole engine exists for: whatever two people do on two
 * devices, in whatever order, with syncs whenever they happen - once both
 * devices have synced, they hold the same data, and so does the server.
 *
 * fast-check generates the histories, including the nasty ones: two edits in
 * the same millisecond, the same occurrence edited on both sides, a category
 * deleted on one device while the other files things under it, a sync in the
 * middle of all of it. When it finds a history that does not converge it
 * shrinks it to the smallest one that still fails.
 */

const TX_IDS = ['t1', 't2', 't3'] as const;
const CAT_IDS = ['c1', 'c2'] as const;
const SLOT_DATES = ['2026-10-01', '2026-11-01'] as const;

type Op =
  | { kind: 'putTx'; id: string; note: string; cat: string | null }
  | { kind: 'deleteTx'; id: string }
  | { kind: 'putCat'; id: string; name: string }
  | { kind: 'deleteCat'; id: string }
  | { kind: 'putOverride'; slot: string; tag: string }
  | { kind: 'deleteOverrides'; slot: string }
  | { kind: 'sync' };

type Step = { device: 0 | 1; op: Op; ms: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('putTx' as const),
    id: fc.constantFrom(...TX_IDS),
    note: fc.constantFrom('a', 'b', 'c'),
    cat: fc.option(fc.constantFrom(...CAT_IDS), { nil: null }),
  }),
  fc.record({ kind: fc.constant('deleteTx' as const), id: fc.constantFrom(...TX_IDS) }),
  fc.record({
    kind: fc.constant('putCat' as const),
    id: fc.constantFrom(...CAT_IDS),
    name: fc.constantFrom('X', 'Y', 'Z'),
  }),
  fc.record({ kind: fc.constant('deleteCat' as const), id: fc.constantFrom(...CAT_IDS) }),
  fc.record({
    kind: fc.constant('putOverride' as const),
    slot: fc.constantFrom(...SLOT_DATES),
    tag: fc.string({ minLength: 1, maxLength: 3 }),
  }),
  fc.record({ kind: fc.constant('deleteOverrides' as const), slot: fc.constantFrom(...SLOT_DATES) }),
  fc.constant({ kind: 'sync' as const }),
);

const stepArb: fc.Arbitrary<Step> = fc.record({
  device: fc.constantFrom(0 as const, 1 as const),
  op: opArb,
  // Zero on purpose: two writes in the same millisecond is where rev
  // counters and device tie-breaks earn their keep.
  ms: fc.constantFrom(0, 1, 250, 5_000),
});

const SEED_TIME = '2026-01-01T00:00:00.000Z' as IsoInstant;

async function run(steps: readonly Step[]): Promise<void> {
  let clock = Date.parse('2026-09-27T10:00:00.000Z');
  const now = (): IsoInstant => instantFromMs(clock);
  const server = new MemorySyncServer();
  const handles = [freshDb(Infinity, SEED_TIME), freshDb(Infinity, SEED_TIME)];
  const dbs = handles.map((h) => h.db);
  let overrideCounter = 0;

  try {
    for (const db of dbs) {
      db.syncNowMs = () => clock;
      await db.open();
      await ensureSettings(db, now());
    }
    // A shared starting point: one profile and one recurring series.
    await createProfile(
      dbs[0]!,
      'p1',
      {
        name: 'Dana',
        avatar: 'fox',
        openingBalanceMinor: 0,
        openingBalanceCurrency: 'USD',
        openingBalanceDate: d('2026-01-01'),
      } as never,
      now(),
    );
    await dbs[0]!.transactions.put(tx('rent', now(), null, 'monthly'));
    await syncOnce(dbs[0]!, server.transport(), { now: now() });
    await syncOnce(dbs[1]!, server.transport(), { now: now() });

    for (const step of steps) {
      clock += step.ms;
      await apply(dbs[step.device]!, step.op, now(), server, () => `ov-${String((overrideCounter += 1))}`);
    }

    // Everyone syncs until quiet.
    for (let i = 0; i < 3; i += 1) {
      clock += 1;
      await syncOnce(dbs[0]!, server.transport(), { now: now() });
      await syncOnce(dbs[1]!, server.transport(), { now: now() });
    }

    const [first, second] = [await dump(dbs[0]!), await dump(dbs[1]!)];
    expect(second).toEqual(first);
    for (const db of dbs) expect(await db.outbox.count()).toBe(0);

    /*
     * Converging is not enough: two devices that both deleted everything also
     * agree. An occurrence someone edited and nobody cleared must still be
     * edited at the end - whichever side won the slot, a side DID win it.
     */
    const cleared = new Set(steps.flatMap((s) => (s.op.kind === 'deleteOverrides' ? [s.op.slot] : [])));
    const edited = new Set(steps.flatMap((s) => (s.op.kind === 'putOverride' ? [s.op.slot] : [])));
    const held = new Set(
      (first as { overrides: { occurrenceDate: string }[] }).overrides.map((o) => o.occurrenceDate),
    );
    for (const slot of edited) if (!cleared.has(slot)) expect(held.has(slot), `slot ${slot} lost`).toBe(true);

    // And the server holds exactly the live rows the devices hold.
    const serverLive = server
      .snapshot()
      .filter((r) => !r.deleted && r.tbl === 'transactions')
      .map((r) => r.id)
      .sort();
    expect(serverLive).toEqual((first as { transactions: { id: string }[] }).transactions.map((t) => t.id));
  } finally {
    for (const h of handles) await h.dispose();
  }
}

function tx(id: string, at: IsoInstant, cat: string | null, recurring?: 'monthly') {
  return materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: cat ?? 'cat.groceries',
    money: MONEY,
    recurrence: recurring === 'monthly' ? { type: 'monthly', dayOfMonth: 1 } : { type: 'one_time' },
    date: d('2026-09-01'),
    seriesRootId: id,
    createdAt: at,
    updatedAt: at,
  });
}

async function apply(
  db: BookandryDB,
  op: Op,
  at: IsoInstant,
  server: MemorySyncServer,
  nextOverrideId: () => string,
): Promise<void> {
  switch (op.kind) {
    case 'putTx': {
      // Filing under a category this device does not have is how the real
      // app could never do it - so only when it exists here.
      const cat = op.cat !== null && (await db.categories.get(op.cat)) !== undefined ? op.cat : null;
      await db.transactions.put({ ...tx(op.id, at, cat), note: op.note });
      return;
    }
    case 'deleteTx':
      await db.transactions.delete(op.id);
      return;
    case 'putCat':
      if ((await db.categories.get(op.id)) === undefined) {
        await createCategory(db, op.id, { name: op.name, kind: 'expense', icon: 'tag' }, at);
      } else {
        await renameCategory(db, op.id, op.name, at);
      }
      return;
    case 'deleteCat':
      if ((await db.categories.get(op.id)) !== undefined) await deleteCategory(db, op.id, {}, at);
      return;
    case 'putOverride': {
      if ((await db.transactions.get('rent')) === undefined) return;
      const date = d(op.slot);
      // Replace this device's own override in the slot, as the app does.
      await db.overrides.where('[transactionId+occurrenceDate]').equals(['rent', date]).delete();
      await db.overrides.put({
        ...skip('rent', date),
        id: nextOverrideId(),
        note: op.tag,
        createdAt: at,
        updatedAt: at,
      } as never);
      return;
    }
    case 'deleteOverrides':
      await db.overrides
        .where('[transactionId+occurrenceDate]')
        .equals(['rent', d(op.slot)])
        .delete();
      return;
    case 'sync':
      await syncOnce(db, server.transport(), { now: at });
      return;
  }
}

async function dump(db: BookandryDB): Promise<unknown> {
  const sort = <T extends { id: string }>(rows: T[]): T[] => rows.sort((x, y) => x.id.localeCompare(y.id));
  return {
    profiles: sort(await db.profiles.toArray()),
    categories: sort(await db.categories.toArray()),
    transactions: sort(await db.transactions.toArray()),
    overrides: sort(await db.overrides.toArray()),
    redirects: sort(await db.redirects.toArray()),
  };
}

describe('convergence', () => {
  it('any history on two devices ends with both holding the same data', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { minLength: 1, maxLength: 25 }), (steps) => run(steps)),
      { numRuns: 150 },
    );
  }, 300_000);
});
