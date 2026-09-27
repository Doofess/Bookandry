import type { Transaction as DexieTransaction } from 'dexie';

import { revFromIso } from '@/lib/rev';
import { isBuiltinPaymentMethod } from '@/types/domain';

import { readOrCreateDeviceId } from './sync/device';
import type { OutboxRow, SyncedTable, SyncStateRow } from './sync/tables';

/**
 * Schema versions as DATA, not as calls baked into a singleton.
 *
 * You cannot test an upgrade with one schema object: the test has to open at
 * version N, write rows, close, and reopen at N+1. Exposing the chain this way
 * from the start makes that possible; retrofitting it later is painful.
 */
export type SchemaVersion = {
  readonly version: number;
  readonly stores: Readonly<Record<string, string | null>>;
  /** Matches Dexie's own upgrade signature; the return value is ignored. */
  readonly upgrade?: (tx: DexieTransaction) => PromiseLike<unknown> | undefined;
};

/**
 * Index notes - each one is load-bearing:
 *
 * [profileId+isDeleted+seriesEnd]
 *   THE index. A recurring transaction stores one `date` but EMITS occurrences
 *   for years, so a range query on `date` for "this month" silently drops every
 *   series that started earlier. Each transaction is modelled as an interval
 *   [seriesStart, seriesEnd]; we range-scan the end and filter the start in
 *   memory over the small candidate set.
 *
 * [isDeleted+seriesEnd]
 *   The same, for the merged "All" view, avoiding N index walks plus a merge.
 *
 * deletedAt (plain)
 *   Exploits the rule that IndexedDB cannot index undefined: this index
 *   therefore contains ONLY soft-deleted rows, which makes the sweeper an index
 *   scan over ~0 rows instead of a table scan over thousands. It also backs
 *   "Recently deleted".
 *
 * [kind+isArchived+sortOrder]
 *   Category picker: active categories of one kind, already ordered, no JS sort.
 *
 * [profileId+isArchived]
 *   Payment-method picker: a profile's own methods plus the shared ones.
 *
 * &[transactionId+occurrenceDate]
 *   Enforces one-override-per-slot at the storage layer, so a duplicate write
 *   throws instead of silently producing two conflicting patches. Dexie's
 *   virtual-index rule gives `where('transactionId')` for free from this.
 *
 * kind, note, date and currency are deliberately NOT indexed: IndexedDB cannot
 * intersect two indexes anyway, so those filters run in memory over the already
 * windowed candidate set.
 */
export const SCHEMA_VERSIONS: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: {
      profiles: 'id, updatedAt',
      categories: 'id, [kind+isArchived+sortOrder], isArchived, updatedAt',
      paymentMethods: 'id, [profileId+isArchived], isArchived, updatedAt',
      transactions:
        'id, profileId, categoryId, paymentMethodId, deletedAt, updatedAt, [profileId+isDeleted+seriesEnd], [isDeleted+seriesEnd]',
      overrides: 'id, &[transactionId+occurrenceDate]',
      ratesTables: 'key, base, date, fetchedAt',
      ratesMeta: 'id',
      currencyLists: 'source',
      settings: 'id',
      meta: 'key',
    },
  },
  {
    /*
     * Change tracking for sync (src/db/sync/middleware.ts).
     *
     * [tbl+id] only, and deliberately no secondary index: see the middleware.
     */
    version: 2,
    stores: {
      syncState: '[tbl+id]',
      outbox: '[tbl+id]',
    },
    upgrade: seedChangeTracking,
  },
  {
    /* Where deleted rows' references went, for devices that kept using them. */
    version: 3,
    stores: { redirects: 'id' },
  },
];

/**
 * Give every row that existed before tracking a rev, and queue it for upload.
 *
 * Dated by the row's OWN `updatedAt`, not by the moment of the upgrade:
 * otherwise a device upgrading today would stamp its months-old copies as
 * brand new, and at first sign-in they would beat edits made elsewhere since.
 *
 * Two kinds of row are left at the implicit zero rev instead:
 * - built-ins nobody has touched (updatedAt === createdAt). Every install has
 *   identical ones; a pristine seed must never overwrite a real edit.
 * - the settings row, whose one synced field is decided at first sign-in.
 */
async function seedChangeTracking(tx: DexieTransaction): Promise<void> {
  const deviceId = await readOrCreateDeviceId(tx.table<{ key: string; value: unknown }, string>('meta'));
  const tables: readonly Exclude<SyncedTable, 'settings'>[] = [
    'profiles',
    'categories',
    'paymentMethods',
    'transactions',
    'overrides',
  ];

  const state: SyncStateRow[] = [];
  for (const tbl of tables) {
    const rows = (await tx.table(tbl).toArray()) as {
      id: string;
      createdAt: string;
      updatedAt: string;
      source?: string;
    }[];
    for (const row of rows) {
      const builtin =
        row.source === 'builtin' || (tbl === 'paymentMethods' && isBuiltinPaymentMethod(row.id));
      if (builtin && row.updatedAt === row.createdAt) continue;
      state.push({ tbl, id: row.id, rev: revFromIso(row.updatedAt, deviceId), deleted: 0 });
    }
  }

  await tx.table('syncState').bulkPut(state);
  await tx.table('outbox').bulkPut(state.map((r): OutboxRow => ({ tbl: r.tbl, id: r.id })));
}
