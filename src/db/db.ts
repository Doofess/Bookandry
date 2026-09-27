import Dexie, { type Table } from 'dexie';

import { systemClock } from '@/lib/clock';
import type { Category, Override, PaymentMethod, Profile, Settings, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import type { CurrencyListRow, RatesMeta, RateTableRow } from './rates-types';
import { buildSeedCategories, buildSeedPaymentMethods } from './seed';
import { readOrCreateDeviceId } from './sync/device';
import { changeTracking, markUntracked } from './sync/middleware';
import type { OutboxRow, SyncStateRow } from './sync/tables';
import { SCHEMA_VERSIONS } from './versions';

export type MetaRow = { key: string; value: unknown };

export class BookandryDB extends Dexie {
  declare profiles: Table<Profile, string>;
  declare categories: Table<Category, string>;
  declare paymentMethods: Table<PaymentMethod, string>;
  declare transactions: Table<Transaction, string>;
  declare overrides: Table<Override, string>;
  declare ratesTables: Table<RateTableRow, string>;
  declare ratesMeta: Table<RatesMeta, string>;
  declare currencyLists: Table<CurrencyListRow, string>;
  declare settings: Table<Settings, string>;
  declare meta: Table<MetaRow, string>;
  declare syncState: Table<SyncStateRow, [string, string]>;
  declare outbox: Table<OutboxRow, [string, string]>;

  /** This install's id, for rev tie-breaks. Loaded before `open()` resolves. */
  deviceId: string | undefined = undefined;

  /**
   * The clock change tracking stamps revs with. A field rather than a
   * constructor argument so a test can move time between two writes.
   */
  syncNowMs: () => number = () => systemClock.nowMs();

  constructor(
    name: string,
    options?: ConstructorParameters<typeof Dexie>[1],
    upTo = Infinity,
    /** Injectable so seeded rows are byte-stable in tests and export fixtures. */
    seedNow: IsoInstant = systemClock.nowIso(),
  ) {
    super(name, options);
    for (const v of SCHEMA_VERSIONS) {
      if (v.version > upTo) break;
      const version = this.version(v.version).stores(v.stores);
      if (v.upgrade) version.upgrade(v.upgrade);
    }

    this.use(changeTracking({ nowMs: () => this.syncNowMs(), deviceId: () => this.deviceId }));

    /*
     * Before anything else can write: Dexie holds every other operation until
     * this resolves, so no tracked write can happen without a device id.
     */
    this.on('ready', async () => {
      this.deviceId = await this.transaction('rw', this.meta, () => readOrCreateDeviceId(this.meta));
    });

    /**
     * Seed inside the v1 upgrade transaction, never from a React effect.
     *
     * React 19's StrictMode double-invokes effects in development, so an
     * effect-based seed ships 24 duplicate categories to anyone who opens the
     * app twice - and because the ids are deterministic, the duplicates would
     * only appear on a machine where they were not.
     *
     * `populate` fires exactly once, for a database that did not exist, and
     * rolls back with the upgrade if anything throws.
     */
    this.on('populate', (tx) => {
      /*
       * Untracked: every install writes these identical rows. Recorded as
       * edits, a brand-new device would push pristine seeds with a newer rev
       * than an archive or rename made on another device, and undo it.
       */
      markUntracked(tx.idbtrans);
      const t = tx as unknown as BookandryDB;
      void t.categories.bulkAdd(buildSeedCategories(seedNow));
      void t.paymentMethods.bulkAdd(buildSeedPaymentMethods(seedNow));
    });
  }
}

/**
 * The application database.
 *
 * Constructed at module scope, which is why `fake-indexeddb/auto` must be a bare
 * setup-file specifier in Vitest: it has to execute before this line runs.
 *
 * The STORED name is still 'greenback', the app's name before it became
 * Bookandry, and it must stay that way. IndexedDB finds a database by name, so
 * renaming it would open an empty one on every existing install: the app would
 * start at the first-run wizard and the user's data would sit, orphaned and
 * invisible, under the old name. The same goes for the 'gb.boot' mirror and the
 * 'greenback.*' lock names - identifiers, not branding.
 */
export const db = new BookandryDB('greenback');

/**
 * Run `fn` in a read-write transaction whose writes are NOT change-tracked.
 *
 * For writes that are not edits: rows applied FROM sync (tracking them would
 * echo every pull straight back to the server) and rows every install creates
 * identically. Everything else must go through the normal, tracked path.
 */
export function withoutTracking<T>(
  database: BookandryDB,
  tables: readonly Table[],
  fn: () => Promise<T>,
): Promise<T> {
  return database.transaction('rw', [...tables], async (tx) => {
    markUntracked(tx.idbtrans);
    return fn();
  });
}
