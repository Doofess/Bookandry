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
  'cashMoves',
  'settings',
  'redirects',
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

/**
 * Where the next pull resumes, in `meta`. Written with the page it follows.
 *
 * Its presence also means "this device syncs", which is what the sweeper asks
 * before purging anything on its own.
 */
export const SYNC_CURSOR_KEY = 'syncCursor';

/**
 * Where the next pull from a linked account's space resumes. The account's
 * own space keeps SYNC_CURSOR_KEY, so a device that synced before accounts
 * could link carries straight on.
 */
export function cursorKeyOf(space: string | undefined): string {
  return space === undefined ? SYNC_CURSOR_KEY : `${SYNC_CURSOR_KEY}:${space}`;
}

/**
 * A space's erase counter, as this device last saw it (see
 * 20261008000000_wipes.sql). Recorded on every pull, by the space's own id -
 * the account's user id for its own space - and kept through signing out and
 * through an erase: its presence is how a device knows it holds that space's
 * data, cursor or not.
 */
export const SYNC_EPOCH_KEY = 'syncEpoch';

export function epochKeyOf(space: string): string {
  return `${SYNC_EPOCH_KEY}:${space}`;
}

/** Present after a sync cleared this device, until a sync finishes and reports it. */
export const SYNC_WIPED_KEY = 'syncWiped';

/** When this device last saw everything the server had. */
export const PULLED_TO_HEAD_KEY = 'syncPulledToHeadAt';

/**
 * A row's `home` when it lives in every linked account's space: the
 * household's structure (categories, the currency, merges) and its joint
 * cards and accounts. Unlinking leaves each account its own copy.
 */
export const EVERYWHERE = '*';

/** A row's `home` before its first push: it lives in no space yet. */
export const NOWHERE = '';

/** Tables whose every row lives in every linked account's space. */
export const REPLICATED_TABLES: ReadonlySet<SyncedTable> = new Set<SyncedTable>([
  'categories',
  'settings',
  'redirects',
]);

/** Side-table row: the newest rev this device knows for a synced row. */
export type SyncStateRow = {
  readonly tbl: SyncedTable;
  readonly id: string;
  readonly rev: string;
  /** 1 when that newest rev is a deletion. */
  readonly deleted: 0 | 1;
  /**
   * The space the row lives in, when it is not this account's own: a linked
   * account's id, EVERYWHERE, or NOWHERE for a row made here and never sent.
   * Absent means the account's own space - which is every row that existed
   * before accounts could link.
   */
  readonly home?: string;
};

/** Present means "changed here and not yet acknowledged by the server". */
export type OutboxRow = { readonly tbl: SyncedTable; readonly id: string };
