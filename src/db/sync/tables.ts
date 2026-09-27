/**
 * Which tables sync, and which stay on this device.
 *
 * Every table is on exactly one list; a test in `middleware.test.ts` fails the day
 * a new table is added without a decision. Forgetting would be silent in the
 * worst way: an unclassified user table simply never leaves the device, and
 * nobody notices until they sign in on a second one.
 */

/** User data. Every write here is tracked and, once signed in, synced. */
export const SYNCED_TABLES = [
  'profiles',
  'categories',
  'paymentMethods',
  'transactions',
  'overrides',
  'settings',
] as const;

/**
 * Device-local. Rate caches are re-fetchable, `meta` holds this device's own
 * bookkeeping (its device id, later its key), and the two sync tables describe
 * this device's view of the sync - syncing them would be circular.
 */
export const LOCAL_TABLES = [
  'ratesTables',
  'ratesMeta',
  'currencyLists',
  'meta',
  'syncState',
  'outbox',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

const SYNCED = new Set<string>(SYNCED_TABLES);

export function isSyncedTable(name: string): name is SyncedTable {
  return SYNCED.has(name);
}

/**
 * The settings row syncs ONE field.
 *
 * `defaultCurrency` defines what every stored base amount means, so every
 * device must agree on it. Language, theme and the active profile are how this
 * person likes this screen; syncing them would let a theme change on the phone
 * carry a stale currency along and undo a currency change made on the laptop.
 */
export const SYNCED_SETTINGS_FIELDS = ['defaultCurrency'] as const;

/** Side-table row: the newest rev this device knows for a synced row. */
export type SyncStateRow = {
  readonly tbl: SyncedTable;
  readonly id: string;
  readonly rev: string;
  /** 1 when that newest rev is a deletion. */
  readonly deleted: 0 | 1;
};

/** Present means "changed here and not yet acknowledged by the server". */
export type OutboxRow = { readonly tbl: SyncedTable; readonly id: string };
