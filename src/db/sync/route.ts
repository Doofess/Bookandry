import { SHARED_OWNER } from '@/types/domain';

import type { BookandryDB } from '../db';
import type { SyncRecord } from './protocol';
import { EVERYWHERE, NOWHERE, REPLICATED_TABLES, type SyncedTable } from './tables';

/**
 * Which linked account's space a row lives in.
 *
 * Each account keeps its own data in its own space; linking lets the others
 * read and write it there. So a row goes where the person it belongs to is:
 *
 * - a transaction, a cash move, a card or an account: its `profileId`'s space - a member's
 *   profileId IS their account's id;
 * - an override: wherever its transaction is;
 * - a member's own row: their space;
 * - the household's structure (categories, the currency, merges) and its
 *   joint cards and accounts: every space, so that unlinking leaves each
 *   account a whole copy of what its own rows rely on.
 *
 * A person from before accounts could link (a profile made inside one
 * account) lives in the space that profile's row came from.
 */
export type Spaces = {
  /** This account's own space: its id. */
  readonly own: string;
  /** Every space this account reaches, its own included. */
  readonly all: readonly string[];
};

/** A space id, or EVERYWHERE. The own space is a space id like any other here. */
export type Home = string;

export async function homeOf(db: BookandryDB, tbl: SyncedTable, row: unknown, spaces: Spaces): Promise<Home> {
  if (REPLICATED_TABLES.has(tbl)) return EVERYWHERE;
  const r = row as Record<string, unknown>;
  switch (tbl) {
    case 'paymentMethods':
      return r['profileId'] === SHARED_OWNER ? EVERYWHERE : personHome(db, r['profileId'], spaces);
    case 'transactions':
      return personHome(db, r['profileId'], spaces);
    case 'cashMoves':
      // Like a transaction: the person's own space, never everywhere.
      return personHome(db, r['profileId'], spaces);
    case 'profiles':
      return personHome(db, r['id'], spaces);
    case 'overrides': {
      const id = r['transactionId'];
      const transaction = typeof id === 'string' ? await db.transactions.get(id) : undefined;
      if (transaction !== undefined) return personHome(db, transaction.profileId, spaces);
      return storedHome(db, 'transactions', id, spaces);
    }
    default:
      return spaces.own;
  }
}

async function personHome(db: BookandryDB, profileId: unknown, spaces: Spaces): Promise<Home> {
  if (typeof profileId === 'string' && spaces.all.includes(profileId)) return profileId;
  return storedHome(db, 'profiles', profileId, spaces);
}

/** Where a row was last seen living, if that space is still reachable; else here. */
async function storedHome(db: BookandryDB, tbl: SyncedTable, id: unknown, spaces: Spaces): Promise<Home> {
  if (typeof id !== 'string') return spaces.own;
  const home = (await db.syncState.get([tbl, id]))?.home;
  return home !== undefined && spaces.all.includes(home) ? home : spaces.own;
}

/** The spaces a home covers. */
export function spacesOf(home: Home, spaces: Spaces): readonly string[] {
  if (home === NOWHERE) return [];
  return home === EVERYWHERE ? spaces.all : [home];
}

/**
 * Where one outgoing record goes: a deletion to every space (it is gone
 * wherever it was), a live row to its home - and, when it has moved home (a
 * transaction given to someone else, a joint card made one person's), a
 * tombstone at the same rev to wherever it no longer lives. A device that
 * meets both keeps the live one: see applyPage.
 */
export type Delivery = { readonly space: string; readonly record: SyncRecord };

export function deliveries(
  record: SyncRecord,
  home: Home,
  previous: Home | undefined,
  spaces: Spaces,
): Delivery[] {
  if (record.deleted) return spaces.all.map((space) => ({ space, record }));
  const now = spacesOf(home, spaces);
  const before = spacesOf(previous ?? spaces.own, spaces);
  const tombstone: SyncRecord = { ...record, deleted: true, row: null };
  return [
    ...now.map((space) => ({ space, record })),
    ...before.filter((space) => !now.includes(space)).map((space) => ({ space, record: tombstone })),
  ];
}

/** What to store as a row's `home`: nothing for the account's own space. */
export function storedHomeValue(home: Home, spaces: Spaces): string | undefined {
  return home === spaces.own ? undefined : home;
}
