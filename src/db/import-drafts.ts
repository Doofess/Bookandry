import type { FoundAccount, FoundCard } from '@/domain/import-cards';

import type { BookandryDB } from './db';

/**
 * Cards and bank accounts "Smart import" found only part of, kept until the
 * person fills in the rest or deletes them - never with the reading they came
 * from, which is gone once the sheet closes, the page reloads or the rest of
 * what was found is added. Kept in `meta`, on this device, and cleared with it.
 */

const PREFIX = 'importDraft:';

/** A card or an account, as a reading found it. */
export type FoundMethod =
  | { readonly kind: 'card'; readonly found: FoundCard }
  | { readonly kind: 'account'; readonly found: FoundAccount };

export type UnfinishedMethod = {
  /** Which card or account it is: the same one read again replaces it, not a second. */
  readonly key: string;
  /** When it was first found, for the order they are listed in. */
  readonly at: number;
  /** Who it was read for: the "For" of the reading it came from. */
  readonly owner: string;
} & FoundMethod;

/**
 * A card by its last four digits, an account by its bank, branch and number -
 * what stays the same from one reading of it to the next. Without them, only
 * that one reading is the same card.
 */
export function unfinishedKey(method: FoundMethod): string {
  if (method.kind === 'card') {
    return method.found.lastDigits === undefined
      ? `card:${method.found.id}`
      : `card:${method.found.lastDigits}`;
  }
  const { bank, branch, number } = method.found;
  return number === undefined
    ? `account:${method.found.id}`
    : `account:${bank ?? ''}-${branch ?? ''}-${number}`;
}

/** Keep these until they are finished or deleted. One kept already is replaced by the newer reading. */
export async function keepUnfinished(
  db: BookandryDB,
  methods: readonly FoundMethod[],
  owner: string,
  nowMs: number,
): Promise<UnfinishedMethod[]> {
  return db.transaction('rw', db.meta, async () => {
    const kept: UnfinishedMethod[] = [];
    for (const method of methods) {
      const key = unfinishedKey(method);
      const earlier = (await db.meta.get(`${PREFIX}${key}`))?.value as UnfinishedMethod | undefined;
      const entry = { ...method, key, at: earlier?.at ?? nowMs, owner } as UnfinishedMethod;
      await db.meta.put({ key: `${PREFIX}${key}`, value: entry });
      kept.push(entry);
    }
    return kept;
  });
}

/** Everything still to finish, oldest first. */
export async function listUnfinished(db: BookandryDB): Promise<UnfinishedMethod[]> {
  const rows = await db.meta.where('key').startsWith(PREFIX).toArray();
  return rows
    .map((row) => row.value as UnfinishedMethod)
    .sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

/** Finished, or deleted by the person: gone. */
export async function dropUnfinished(db: BookandryDB, key: string): Promise<void> {
  await db.meta.delete(`${PREFIX}${key}`);
}

/** Undo of a delete: back as it was. */
export async function restoreUnfinished(db: BookandryDB, entry: UnfinishedMethod): Promise<void> {
  await db.meta.put({ key: `${PREFIX}${entry.key}`, value: entry });
}
