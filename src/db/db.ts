import Dexie, { type Table } from 'dexie';

import type { Category, Override, PaymentMethod, Profile, Settings, Transaction } from '@/types/domain';

import type { CurrencyListRow, RatesMeta, RateTableRow } from './rates-types';
import { SCHEMA_VERSIONS } from './versions';

export type MetaRow = { key: string; value: unknown };

export class GreenbackDB extends Dexie {
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

  constructor(name: string, options?: ConstructorParameters<typeof Dexie>[1], upTo = Infinity) {
    super(name, options);
    for (const v of SCHEMA_VERSIONS) {
      if (v.version > upTo) break;
      const version = this.version(v.version).stores(v.stores);
      if (v.upgrade) version.upgrade(v.upgrade);
    }
  }
}

/**
 * The application database.
 *
 * Constructed at module scope, which is why `fake-indexeddb/auto` must be a bare
 * setup-file specifier in Vitest: it has to execute before this line runs.
 */
export const db = new GreenbackDB('greenback');
