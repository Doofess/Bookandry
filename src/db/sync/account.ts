import type { Bytes } from '@/services/crypto/bytes';
import { deriveKeyring, newDataKey } from '@/services/crypto/keys';
import { accountEntry, keyFromAccountEntry, type WrappedKey } from '@/services/crypto/wrap';
import type { KeyState } from '@/services/supabase/transport';

import type { BookandryDB } from '../db';
import { hasDemoData, removeDemoData } from '../demo';
import { adoptKeyring, forgetSyncIdentity, loadKeys } from './keystore';
import { requeueEverything } from './rotate';

/**
 * Getting a device the account's data key: signing in is enough.
 *
 * The account holds its key itself (an 'account' entry in user_keys, readable
 * only by its signed-in owner), so there is nothing for a person to type,
 * keep or decide: the first device makes the key, every other device fetches
 * it. Records are still sealed with it and ids still blinded, but the key's
 * protection is the account's sign-in. The README's threat model says what
 * that means.
 *
 * The raw key exists in memory only inside these functions, long enough to
 * derive the non-extractable working keys, and is zeroed on the way out.
 *
 * The server is passed in, so the tests drive these against the real SQL.
 */
export type KeyServer = {
  getKeyState(): Promise<KeyState>;
  setupKeys(wraps: readonly WrappedKey[]): Promise<number>;
  rotateKeys(from: number, wraps: readonly WrappedKey[]): Promise<number>;
};

export type ConnectResult =
  | { readonly ok: true }
  /** The server offered an OLDER key than this device already holds. */
  | { readonly ok: false; readonly reason: 'downgrade' };

/**
 * Which account the data on this device belongs to. Set when a device first
 * joins an account and gone only with the data itself: a device whose session
 * has ended still knows whose data it holds, and keeps it behind the sign-in
 * screen rather than showing it to whoever picks the device up.
 */
export const DATA_OWNER_KEY = 'syncDataOwner';

/** The account this device's data belongs to, if any. */
export async function dataOwner(db: BookandryDB): Promise<string | undefined> {
  const value = (await db.meta.get(DATA_OWNER_KEY))?.value;
  return typeof value === 'string' ? value : undefined;
}

/** The newest key version this device holds for the account, or 0. */
async function keyFloor(db: BookandryDB, userId: string): Promise<number> {
  const local = await loadKeys(db);
  return local?.userId === userId ? Math.max(0, ...local.byVersion.keys()) : 0;
}

/**
 * Take a key into use, and make sure the account ends up with everything this
 * device has.
 *
 * - Joining: the device's cursor belongs to nothing, and the account has seen
 *   none of its rows. Everything is queued; rows the account already holds at
 *   a newer rev win as always, so nothing is lost either way. Sample data
 *   never joins an account; it is removed first.
 * - A newer key than this device held: the account moved to it elsewhere, and
 *   the server dropped every record sealed under the old one. Everything is
 *   queued again, so what only this device had comes back.
 * - The same version again, or an older one, with a DIFFERENT key: the
 *   account was started over (its server copy cleared). The old cursor points
 *   into a copy that is gone.
 */
async function adopt(db: BookandryDB, userId: string, dataKey: Bytes, version: number): Promise<void> {
  try {
    const existing = await loadKeys(db);
    if (existing?.userId !== userId) {
      if (await hasDemoData(db)) await removeDemoData(db);
      await forgetSyncIdentity(db);
      await db.meta.put({ key: DATA_OWNER_KEY, value: userId });
    } else if (version <= Math.max(...existing.byVersion.keys())) {
      await forgetSyncIdentity(db);
    }
    await requeueEverything(db);
    await adoptKeyring(db, userId, await deriveKeyring(dataKey, version));
  } finally {
    dataKey.fill(0);
  }
}

const codeOf = (error: unknown): unknown =>
  error instanceof Error && 'code' in error ? (error as { code: unknown }).code : undefined;

/**
 * Get this device the account's current key, making one if the account has
 * none. Called on every sign-in and whenever the account's key moves on; safe
 * to call again at any time.
 */
export async function connectDevice(
  db: BookandryDB,
  server: KeyServer,
  userId: string,
  attempt = 0,
): Promise<ConnectResult> {
  const state = await server.getKeyState();
  // Another device got there first (made the key, or replaced it): its key is
  // the account's. Fetch it. Bounded, so a server that keeps saying so cannot
  // spin this.
  const again = (error: unknown): Promise<ConnectResult> => {
    const code = codeOf(error);
    if (attempt < 3 && (code === 'already_set_up' || code === 'key_version_changed'))
      return connectDevice(db, server, userId, attempt + 1);
    throw error;
  };

  // An empty account - new, or its server copy cleared: this device fills it.
  if (state.keyVersion === 0) {
    const dataKey = newDataKey();
    let version: number;
    try {
      version = await server.setupKeys([accountEntry(dataKey, 1)]);
    } catch (error) {
      dataKey.fill(0);
      return again(error);
    }
    await adopt(db, userId, dataKey, version);
    return { ok: true };
  }

  // Keys only move forward. An older one than this device has held is a
  // server handing back a key it retired.
  if (state.keyVersion < (await keyFloor(db, userId))) return { ok: false, reason: 'downgrade' };

  const entry = state.wraps.find((w) => w.kind === 'account' && w.keyVersion === state.keyVersion);
  if (entry === undefined) {
    // No key the account holds: set up before accounts held their own keys,
    // behind a sync passphrase nobody is asked for any more. What is sealed
    // under it cannot be read here; this device starts the account's copy
    // over, and every device re-sends what it has when it meets the new key.
    try {
      await rotateAccountKey(db, server, userId);
    } catch (error) {
      return again(error);
    }
    return { ok: true };
  }

  const local = await loadKeys(db);
  if (local?.userId === userId && local.byVersion.has(state.keyVersion)) return { ok: true };
  await adopt(db, userId, keyFromAccountEntry(entry), state.keyVersion);
  return { ok: true };
}

/**
 * A brand-new data key, held by the account, replacing the current one. The
 * server drops every record sealed under the old key; this device queues
 * everything it has to be sealed again, and every other device does the same
 * when it meets the new key.
 */
export async function rotateAccountKey(db: BookandryDB, server: KeyServer, userId: string): Promise<void> {
  const floor = await keyFloor(db, userId);
  const state = await server.getKeyState();
  if (state.keyVersion < floor)
    throw new RangeError('refusing to rotate from a key older than this device holds');

  const dataKey = newDataKey();
  try {
    const version =
      state.keyVersion === 0
        ? await server.setupKeys([accountEntry(dataKey, 1)])
        : await server.rotateKeys(state.keyVersion, [accountEntry(dataKey, state.keyVersion + 1)]);
    await adopt(db, userId, dataKey.slice(), version);
  } finally {
    dataKey.fill(0);
  }
}
