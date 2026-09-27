import type {
  DBCore,
  DBCoreMutateRequest,
  DBCoreMutateResponse,
  DBCoreTable,
  DBCoreTransaction,
  Middleware,
} from 'dexie';

import { nextRev, type Rev } from '@/lib/rev';

import { isSyncedTable, type OutboxRow, type SyncedTable, type SyncStateRow } from './tables';

/**
 * Change tracking for sync, as ONE Dexie middleware.
 *
 * Every write to a synced table - from any of the dozen modules that write,
 * through any of Dexie's shapes (add, put, update, modify, delete, bulkDelete,
 * Collection.delete, clear) - records in the same IndexedDB transaction:
 *
 *   syncState[tbl, id] = the row's new rev, and whether it is now a deletion
 *   outbox[tbl, id]    = present, meaning "not yet acknowledged by the server"
 *
 * The domain rows, their types, the export format and the import merge are
 * untouched. The alternative - a `_rev` field on every row - would have leaked
 * into export files and broken the byte-stable round trip, and a
 * "tombstone-aware delete helper" would have been one more rule a dozen call
 * sites had to remember.
 *
 * Two things make this possible, both proven in the Phase 0 spikes:
 *
 * 1. Scope. IndexedDB only lets a transaction touch the stores it was opened
 *    with, and callers declare their own lists. `transaction()` below appends
 *    `syncState` and `outbox` to every read-write transaction that includes a
 *    synced table - the same trick Dexie uses for its own Y.js update tables.
 * 2. Keys. `clear()` and range deletes arrive as `deleteRange` with no keys, so
 *    the keys are read first, inside the same transaction, before they are gone.
 *
 * Neither side table has a secondary index. A `dirty` index made a 4,000-row
 * import 170x slower in fake-indexeddb, where overwriting rows under an index of
 * identical values is quadratic; presence in `outbox` says the same thing.
 */

/**
 * Transactions whose writes must NOT be tracked: rows arriving FROM sync, and
 * the seeds every install writes identically. Keyed by the IDBTransaction,
 * which is exactly the `req.trans` this middleware sees.
 */
const untracked = new WeakSet<object>();

/** Stop tracking writes made in this transaction. See `withoutTracking` in db.ts. */
export function markUntracked(idbtrans: object): void {
  untracked.add(idbtrans);
}

export type TrackingContext = {
  readonly nowMs: () => number;
  /** Loaded before the database resolves `open()`; undefined only before that. */
  readonly deviceId: () => string | undefined;
};

type Change = { readonly id: string; readonly deleted: boolean };

export function changeTracking(context: TrackingContext): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'bookandry-change-tracking',
    create(down) {
      const names = new Set(down.schema.tables.map((t) => t.name));
      // A database opened below the version that has the side tables - the
      // v1-only upgrade tests - has nothing to track into.
      if (!names.has('syncState') || !names.has('outbox')) return {};

      const syncState = down.table('syncState');
      const outbox = down.table('outbox');

      return {
        transaction(stores, mode, options) {
          const needs = mode === 'readwrite' && stores.some(isSyncedTable) && !stores.includes('syncState');
          return down.transaction(needs ? [...stores, 'syncState', 'outbox'] : stores, mode, options);
        },

        table(name) {
          const table = down.table(name);
          if (!isSyncedTable(name)) return table;
          return {
            ...table,
            mutate: (req) => track(name, table, req),
          };
        },
      };

      async function track(
        tbl: SyncedTable,
        table: DBCoreTable,
        req: DBCoreMutateRequest,
      ): Promise<DBCoreMutateResponse> {
        if (untracked.has(req.trans)) return table.mutate(req);

        // Learn what a range delete will remove before it removes it.
        const rangeKeys =
          req.type === 'deleteRange'
            ? (
                await table.query({
                  trans: req.trans,
                  query: { index: table.schema.primaryKey, range: req.range },
                  values: false,
                })
              ).result
            : [];

        // Settings sync one field; read the old row to see whether it changed.
        const settingsBefore =
          tbl === 'settings' && (req.type === 'put' || req.type === 'add')
            ? await table.getMany({ trans: req.trans, keys: keysOf(table, req.values) })
            : undefined;

        const res = await table.mutate(req);
        const changes = changesOf(req, res, rangeKeys, settingsBefore);
        if (changes.length > 0) await record(req.trans, tbl, changes);
        return res;
      }

      async function record(
        trans: DBCoreTransaction,
        tbl: SyncedTable,
        changes: readonly Change[],
      ): Promise<void> {
        const deviceId = context.deviceId();
        if (deviceId === undefined) {
          // Never silent: an untracked user write is a change that would never
          // reach any other device, and nothing would ever say so.
          throw new Error('Change tracking wrote before the device id was loaded');
        }

        const previous = (await syncState.getMany({
          trans,
          keys: changes.map((c) => [tbl, c.id]),
        })) as (SyncStateRow | undefined)[];

        const now = context.nowMs();
        const rows: SyncStateRow[] = changes.map((c, i) => ({
          tbl,
          id: c.id,
          rev: nextRev(previous[i]?.rev as Rev | undefined, now, deviceId),
          deleted: c.deleted ? 1 : 0,
        }));

        await syncState.mutate({ type: 'put', trans, values: rows });
        await outbox.mutate({
          type: 'put',
          trans,
          values: rows.map((r): OutboxRow => ({ tbl: r.tbl, id: r.id })),
        });
      }
    },
  };
}

function keysOf(table: DBCoreTable, values: readonly unknown[]): unknown[] {
  const extract = table.schema.primaryKey.extractKey;
  if (extract === null) throw new Error(`${table.name}: outbound keys are not supported by change tracking`);
  return values.map((v): unknown => extract(v));
}

/**
 * The rows a successful mutation changed, one entry per id (the LAST write to
 * an id in a request wins, as it does in the table).
 */
function changesOf(
  req: DBCoreMutateRequest,
  res: DBCoreMutateResponse,
  rangeKeys: readonly unknown[],
  settingsBefore: readonly unknown[] | undefined,
): Change[] {
  const byId = new Map<string, Change>();
  const failed = (i: number): boolean => Object.hasOwn(res.failures, i);

  switch (req.type) {
    case 'add':
    case 'put': {
      const keys = res.results ?? [];
      req.values.forEach((value, i) => {
        if (failed(i)) return;
        if (settingsBefore !== undefined && !syncedSettingsChanged(settingsBefore[i], value)) return;
        byId.set(String(keys[i]), { id: String(keys[i]), deleted: false });
      });
      break;
    }
    case 'delete':
      req.keys.forEach((key, i) => {
        if (!failed(i)) byId.set(String(key), { id: String(key), deleted: true });
      });
      break;
    case 'deleteRange':
      for (const key of rangeKeys) byId.set(String(key), { id: String(key), deleted: true });
      break;
  }

  return [...byId.values()];
}

/**
 * Only `defaultCurrency` syncs, so only a change to it is a change.
 *
 * A row appearing for the first time IS one - but the default row every
 * install creates is written untracked (`ensureSettings`), so a fresh device
 * never announces a currency it did not choose.
 */
function syncedSettingsChanged(before: unknown, after: unknown): boolean {
  const currencyOf = (row: unknown): unknown =>
    row !== null && typeof row === 'object'
      ? (row as { defaultCurrency?: unknown }).defaultCurrency
      : undefined;
  return before === undefined || currencyOf(before) !== currencyOf(after);
}
