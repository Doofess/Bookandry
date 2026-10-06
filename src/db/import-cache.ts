import type { FoundAccount, FoundCard } from '@/domain/import-cards';
import type { FoundRow } from '@/domain/import-check';
import type { WireTotal } from '@/domain/import-wire';

import type { BookandryDB } from './db';

/**
 * Files "Add with AI" has already read, by their SHA-256: the same statement
 * picked or shared again costs nothing to read twice. Kept in `meta`, which
 * never leaves this device, for 30 days, and cleared with the device.
 */

const PREFIX = 'importCache:';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * What a read holds. 2: cards and bank accounts too. A read from before they
 * were looked for is read again - a card list read then was "nothing found".
 * 3: loans as loans, and a one-card statement's card on every row - a
 * statement read before was read with its loans as instalments.
 */
const VERSION = 3;

export type CachedRead = {
  readonly v: number;
  readonly at: number;
  /** Rows and cards as read, every one with `file` 0: the caller puts its own index back. */
  readonly rows: readonly FoundRow[];
  readonly totals: readonly WireTotal[];
  readonly cards: readonly FoundCard[];
  readonly accounts: readonly FoundAccount[];
};

export async function cachedRead(
  db: BookandryDB,
  hash: string,
  nowMs: number,
): Promise<CachedRead | undefined> {
  const row = await db.meta.get(`${PREFIX}${hash}`);
  const value = row?.value as CachedRead | undefined;
  if (value?.v !== VERSION || nowMs - value.at > KEEP_MS) return undefined;
  return value;
}

export async function rememberRead(
  db: BookandryDB,
  hash: string,
  read: {
    readonly rows: readonly FoundRow[];
    readonly totals: readonly WireTotal[];
    readonly cards: readonly FoundCard[];
    readonly accounts: readonly FoundAccount[];
  },
  nowMs: number,
): Promise<void> {
  const value: CachedRead = {
    v: VERSION,
    at: nowMs,
    rows: read.rows.map((row) => ({ ...row, file: 0, otherRead: undefined })),
    totals: read.totals,
    cards: read.cards.map((card) => ({ ...card, file: 0, otherRead: undefined })),
    accounts: read.accounts.map((account) => ({ ...account, file: 0, otherRead: undefined })),
  };
  await db.meta.put({ key: `${PREFIX}${hash}`, value });
}

/** Reads older than 30 days, gone. */
export async function sweepImportCache(db: BookandryDB, nowMs: number): Promise<void> {
  const old = await db.meta
    .where('key')
    .startsWith(PREFIX)
    .filter((row) => nowMs - ((row.value as CachedRead | undefined)?.at ?? 0) > KEEP_MS)
    .primaryKeys();
  await db.meta.bulkDelete(old);
}
