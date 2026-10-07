import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from '../db';
import { repairIntegrity, type RepairReport } from '../integrity';
import { LOCK_SYNC, withLock } from '../lock';
import { applyPage } from './apply';
import { eraseLocalData } from './erase';
import { acknowledge, collectOutgoing, type Outgoing } from './outbox';
import { SpaceWipedError, type PushResult, type SyncRecord, type SyncTransport } from './protocol';
import { rebaseStaleRows, type RebaseDeps, type RebaseReport } from './rebase';
import { deliveries, homeOf, storedHomeValue, type Spaces } from './route';
import { shareWith } from './spaces';
import { cursorKeyOf, epochKeyOf, PULLED_TO_HEAD_KEY } from './tables';
import { purgeExpiredDeletions } from '../repos/transactions';

export { PULLED_TO_HEAD_KEY } from './tables';

export type SyncOptions = {
  readonly now: IsoInstant;
  /** Rows per push and per pull page. */
  readonly batchSize?: number;
  /**
   * How to price rows that arrive in a base currency the household has since
   * left. Without it they are still found and reported, just not fixed.
   */
  readonly rebase?: Omit<RebaseDeps, 'now'>;
};

export type SyncReport = {
  readonly pushed: number;
  /** Pushed, but the server already had something newer; the pull brought it. */
  readonly stale: number;
  readonly applied: number;
  readonly skipped: number;
  readonly rejected: number;
  /** Undefined when no rate source was given. */
  readonly rebase: RebaseReport | undefined;
  readonly purged: number;
  readonly repair: RepairReport;
  /** A space this device pulled from before was erased, so this device was cleared. */
  readonly wiped: boolean;
};

/** One account's space, and the way to it. */
export type SyncSpace = { readonly id: string; readonly transport: SyncTransport };

/**
 * Every space a sync cycle keeps in step: this account's own, and each linked
 * account's (see route.ts for which rows live where).
 */
export type SyncSpaces = { readonly own: SyncSpace; readonly linked: readonly SyncSpace[] };

/** Standing in for the account's id when a caller passes one bare transport. */
const SELF = '~self';

const DEFAULT_BATCH = 500;
/**
 * A cycle that keeps finding more to push or pull is a bug or an attack, not a
 * busy household. Bounded so it fails loudly instead of spinning a phone's
 * battery flat.
 */
const MAX_ROUNDS = 1_000;

/**
 * One full sync: push what changed here, pull what changed elsewhere, then
 * make the result consistent and push the fixes.
 *
 * Push FIRST, so that a pull never has to decide between the server's copy and
 * a local edit the server has not seen yet - it only ever meets local edits
 * that the server has already ranked. Last-write-wins would get the same
 * answer either way; this order just means fewer rows cross the wire twice.
 *
 * Integrity repair runs only at the pull HEAD. Part-way through, a transaction
 * whose category arrives in the next page looks orphaned; repairing it then
 * would move it to the fallback for no reason, on this device alone.
 */
export function syncOnce(
  db: BookandryDB,
  target: SyncTransport | SyncSpaces,
  options: SyncOptions,
): Promise<SyncReport> {
  const batch = options.batchSize ?? DEFAULT_BATCH;
  const set: SyncSpaces = 'own' in target ? target : { own: { id: SELF, transport: target }, linked: [] };

  return withLock(LOCK_SYNC, async () => {
    // A linked account this device has never pulled from gets the household's
    // structure first, so its space holds everything its rows rely on.
    for (const space of set.linked) await shareWith(db, space.id);

    // Read before anything can clear them: a space with a cursor is one this
    // device has pulled from, and an erase of it must reach this device.
    const pulledBefore = new Set<string | undefined>();
    for (const space of [set.own, ...set.linked]) {
      const id = space === set.own ? undefined : space.id;
      if ((await db.meta.get(cursorKeyOf(id))) !== undefined) pulledBefore.add(id);
    }

    // A push into a space erased since this device last pulled is refused: the
    // pull below clears, and the second push sends what is left.
    let first = { pushed: 0, stale: 0 };
    try {
      first = await pushAll(db, set, batch);
    } catch (error) {
      if (!(error instanceof SpaceWipedError)) throw error;
    }

    let wiped = false;
    let applied = 0;
    let skipped = 0;
    let rejected = 0;
    // This account's own space first: its rows are the ones a person is
    // waiting to see on a new device.
    for (const space of [set.own, ...set.linked]) {
      const id = space === set.own ? undefined : space.id;
      let cursor = await readCursor(db, id);
      let known = await readEpoch(db, id);
      for (let round = 0; ; round += 1) {
        if (round >= MAX_ROUNDS) throw new Error('Sync pull did not reach the head');
        const page = await space.transport.pull(cursor, batch);
        if (page.epoch !== undefined && page.epoch > known) {
          if (pulledBefore.has(id)) {
            // Erased since this device last looked. One household erase raises
            // every member's space at once: clear once, then only start over.
            // Cleared BEFORE the new epoch is kept, so a crash in between
            // clears on the next sync instead of pushing the old data back.
            if (!wiped) await eraseLocalData(db);
            wiped = true;
            await db.meta.delete(cursorKeyOf(id));
            await db.meta.put({ key: epochKeyOf(id), value: page.epoch });
            known = page.epoch;
            cursor = 0;
            continue;
          }
          await db.meta.put({ key: epochKeyOf(id), value: page.epoch });
          known = page.epoch;
        }
        const report = await applyPage(db, page.records, page.cursor, id);
        applied += report.applied;
        skipped += report.skipped;
        rejected += report.rejected;
        cursor = page.cursor;
        if (!page.hasMore) break;
      }
    }
    await db.meta.put({ key: PULLED_TO_HEAD_KEY, value: options.now });

    // At the head, and still holding the sync lock: this device has now seen
    // every restore any other device made, so purging cannot undo one.
    const { purged } = await purgeExpiredDeletions(db, Date.parse(options.now));

    const rebase =
      options.rebase === undefined
        ? undefined
        : await rebaseStaleRows(db, { ...options.rebase, now: options.now });

    const repair = await repairIntegrity(db, options.now);
    // Repairs, and deletions decided while applying, are ordinary queued edits.
    const second = await pushAll(db, set, batch);

    return {
      pushed: first.pushed + second.pushed,
      stale: first.stale + second.stale,
      applied,
      skipped,
      rejected,
      rebase,
      purged,
      repair,
      wiped,
    };
  });
}

/**
 * Send every queued change to the space it lives in - several, for the
 * household's structure, a deletion or a move - and take it off the queue only
 * once every one of them has it.
 */
async function pushAll(
  db: BookandryDB,
  set: SyncSpaces,
  batch: number,
): Promise<{ pushed: number; stale: number }> {
  const spaces: Spaces = { own: set.own.id, all: [set.own.id, ...set.linked.map((s) => s.id)] };
  const transports = new Map([set.own, ...set.linked].map((s) => [s.id, s.transport]));
  let pushed = 0;
  let stale = 0;
  for (let round = 0; ; round += 1) {
    if (round >= MAX_ROUNDS) throw new Error('Sync push did not drain the outbox');
    const outgoing = await collectOutgoing(db, batch);
    if (outgoing.length === 0) return { pushed, stale };

    const plans: Plan[] = [];
    for (const o of outgoing) plans.push(await plan(db, o, spaces));
    const bySpace = new Map<string, SyncRecord[]>();
    for (const { sends } of plans) {
      for (const { space, record } of sends) {
        const list = bySpace.get(space) ?? [];
        list.push(record);
        bySpace.set(space, list);
      }
    }

    // Every answer, by space and row: a row is done when all its spaces answered.
    const answers = new Map<string, PushResult['status']>();
    for (const [space, records] of bySpace) {
      const transport = transports.get(space);
      if (transport === undefined) continue;
      const epoch = await readEpoch(db, space === set.own.id ? undefined : space);
      for (const r of await transport.push(records, epoch)) answers.set(answerKey(space, r), r.status);
    }

    const results: PushResult[] = [];
    const homes = new Map<string, string | undefined>();
    for (const { record, home, sends } of plans) {
      const statuses = sends.map((s) => answers.get(answerKey(s.space, s.record)));
      if (statuses.some((s) => s === undefined)) continue;
      const status = statuses.every((s) => s === 'stored') ? 'stored' : 'stale';
      results.push({ tbl: record.tbl, id: record.id, rev: record.rev, status });
      if (home !== false) homes.set(`${record.tbl}/${record.id}`, home);
    }

    await acknowledge(db, results, homes);
    pushed += results.filter((r) => r.status === 'stored').length;
    stale += results.filter((r) => r.status === 'stale').length;

    // Nothing acknowledged would mean the same batch forever.
    if (results.length === 0) throw new Error('Sync push was not acknowledged');
  }
}

const answerKey = (space: string, r: { tbl: string; id: string; rev: string }): string =>
  `${space}/${r.tbl}/${r.id}/${r.rev}`;

type Plan = {
  readonly record: SyncRecord;
  /**
   * Where the row lives once sent, to remember: undefined for this account's
   * own space, false to leave what was remembered (a deletion).
   */
  readonly home: string | undefined | false;
  readonly sends: readonly { readonly space: string; readonly record: SyncRecord }[];
};

async function plan(db: BookandryDB, outgoing: Outgoing, spaces: Spaces): Promise<Plan> {
  const { home: previous, ...record } = outgoing;
  if (record.deleted) return { record, home: false, sends: deliveries(record, spaces.own, previous, spaces) };
  const home = await homeOf(db, record.tbl, record.row, spaces);
  return {
    record,
    home: storedHomeValue(home, spaces),
    sends: deliveries(record, home, previous, spaces),
  };
}

async function readEpoch(db: BookandryDB, space: string | undefined): Promise<number> {
  const row = await db.meta.get(epochKeyOf(space));
  return typeof row?.value === 'number' ? row.value : 0;
}

async function readCursor(db: BookandryDB, space: string | undefined): Promise<number> {
  const row = await db.meta.get(cursorKeyOf(space));
  return typeof row?.value === 'number' ? row.value : 0;
}
