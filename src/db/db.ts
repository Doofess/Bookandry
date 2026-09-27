import Dexie, { type Table } from 'dexie';

import { systemClock } from '@/lib/clock';
import type { Category, Override, PaymentMethod, Profile, Settings, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import type { CurrencyListRow, RatesMeta, RateTableRow } from './rates-types';
import { buildSeedCategories, buildSeedPaymentMethods } from './seed';
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
