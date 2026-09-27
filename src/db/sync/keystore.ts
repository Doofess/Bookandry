import type { Keyring } from '@/services/crypto/keys';

import type { BookandryDB } from '../db';
import type { Keys } from './codec';
import { SYNC_CURSOR_KEY } from './tables';

/**
 * This device's working keys, in `meta`.
 *
 * Stored as CryptoKey objects, which IndexedDB keeps by structured clone and
 * which stay non-extractable across a reload (proven in the Phase 0 spikes):
 * a script running in this page can USE them, but cannot read their bytes and
 * carry them off. That limits what an XSS can take away - not what it can do
 * while it runs here, which is what the CSP is for.
 *
 * The raw data key is never stored. Anything that needs it again - adding a
 * passkey, changing the passphrase - unwraps it again from a factor.
 */
export const KEYS_KEY = 'syncKeys';

type StoredKeys = {
  readonly userId: string;
  readonly current: number;
  readonly rings: readonly Keyring[];
};

export type LoadedKeys = Keys & { readonly userId: string };

export async function saveKeys(
  db: BookandryDB,
  userId: string,
  rings: readonly Keyring[],
  current: number,
): Promise<void> {
  if (!rings.some((r) => r.version === current))
    throw new RangeError('the current key version must be among the rings');
  const stored: StoredKeys = { userId, current, rings };
  await db.meta.put({ key: KEYS_KEY, value: stored });
}

export async function loadKeys(db: BookandryDB): Promise<LoadedKeys | undefined> {
  const row = await db.meta.get(KEYS_KEY);
  const stored = row?.value as StoredKeys | undefined;
  if (stored === undefined) return undefined;
  const byVersion = new Map(stored.rings.map((r) => [r.version, r]));
  const current = byVersion.get(stored.current);
  if (current === undefined) return undefined;
  return { userId: stored.userId, current, byVersion };
}

/**
 * Take a newer data key into use, keeping the older ones to read with until
 * everything has been re-sealed.
 */
export async function adoptKeyring(db: BookandryDB, userId: string, ring: Keyring): Promise<void> {
  const existing = await loadKeys(db);
  const older = existing?.userId === userId ? [...existing.byVersion.values()] : [];
  const rings = [ring, ...older.filter((r) => r.version !== ring.version)];
  await saveKeys(db, userId, rings, ring.version);
}

/** After a rotation has re-sealed everything, the old keys are dead weight. */
export async function dropOlderKeys(db: BookandryDB): Promise<void> {
  const keys = await loadKeys(db);
  if (keys === undefined) return;
  await saveKeys(db, keys.userId, [keys.current], keys.current.version);
}

/**
 * Forget everything that ties this device to an account: keys and cursor.
 * Signing out calls this; whether the local DATA stays is the user's choice
 * and a separate step.
 */
export async function forgetSyncIdentity(db: BookandryDB): Promise<void> {
  await db.transaction('rw', [db.meta], async () => {
    await db.meta.bulkDelete([KEYS_KEY, SYNC_CURSOR_KEY]);
  });
}
