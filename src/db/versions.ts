import type { Transaction as DexieTransaction } from 'dexie';

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
];

export const CURRENT_DB_VERSION = SCHEMA_VERSIONS.reduce((max, v) => Math.max(max, v.version), 0);

/**
 * The EXPORT DOCUMENT format version - a different counter from the DB schema
 * version, deliberately. A pure index addition bumps `db.version(n)` without
 * changing the JSON shape at all, so conflating them would force pointless
 * export migrations. They will diverge; that is expected.
 */
export const CURRENT_DOC_VERSION = 1;
