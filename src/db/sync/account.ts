import { DEMO_PREFIX } from '@/domain/demo';
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
 * only by its signed-in owner), so there is nothing for a person to type or
 * keep: the first device makes the key, every other device fetches it. Records
 * are still sealed with it, ids still blinded, revs still authenticated - but
 * the key's protection is the account's sign-in, not a secret only the person
 * knows. The README's threat model says what that means.
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

export type ConnectOptions = {
  /**
   * The person has seen that this device holds data from ANOTHER account and
   * chose to add it to this one. Without it, connecting refuses: see joinCheck.
   */
  readonly addExistingData?: boolean;
};

export type ConnectResult =
  | {
      readonly ok: true;
      /**
       * The account was set up before it held its own key - behind a sync
       * passphrase - and this device holds that key. Once it has synced
       * everything down, it moves the account over (rotateAccountKey).
       */
      readonly needsAccountKey: boolean;
    }
  /** This device holds another account's data; the person must choose. */
  | {
      readonly ok: false;
      readonly reason: 'foreign_data';
      readonly profiles: number;
      readonly transactions: number;
    }
  /** The server offered an OLDER key than this device already holds. */
  | { readonly ok: false; readonly reason: 'downgrade' }
  /**
   * Set up behind a sync passphrase, and this device never held that key.
   * Another device that does can move the account over; or this one can start
   * the synced copy over from what it has.
   */
  | { readonly ok: false; readonly reason: 'legacy_locked' };

/** The newest key version this device holds for the account, or 0. */
async function keyFloor(db: BookandryDB, userId: string): Promise<number> {
  const local = await loadKeys(db);
  return local?.userId === userId ? Math.max(0, ...local.byVersion.keys()) : 0;
}

/**
 * Which account the data on this device last synced with. Kept through
 * sign-out - that is its whole point - and gone only with the data itself.
 */
export const DATA_OWNER_KEY = 'syncDataOwner';

export type JoinCheck =
  /** Already this account's device: nothing to decide. */
  | { readonly kind: 'same' }
  /**
   * Nothing to hand over, or only data that never synced anywhere - which is
   * the data of whoever has been using this device, joining now.
   */
  | { readonly kind: 'fresh' }
  /** Data that last synced with a DIFFERENT account. */
  | { readonly kind: 'foreign'; readonly profiles: number; readonly transactions: number };

/**
 * Before joining: would this upload someone else's data?
 *
 * On a shared device, person A signs out and keeps the data; person B signs in
 * to B's account. Joining queues every row on the device for upload, so
 * without this B's account would silently receive A's whole ledger. The
 * person joining must decide, knowingly: add it, or remove it first.
 */
export async function joinCheck(db: BookandryDB, userId: string): Promise<JoinCheck> {
  const keys = await loadKeys(db);
  if (keys?.userId === userId) return { kind: 'same' };
  const owner = (await db.meta.get(DATA_OWNER_KEY))?.value;
  if (owner === undefined || owner === userId) return { kind: 'fresh' };
  const real = (id: string) => !id.startsWith(DEMO_PREFIX);
  const profiles = (await db.profiles.toCollection().primaryKeys()).filter(real).length;
  const transactions = (await db.transactions.toCollection().primaryKeys()).filter(real).length;
  return profiles + transactions === 0 ? { kind: 'fresh' } : { kind: 'foreign', profiles, transactions };
}

/**
 * Before this device first syncs with an account - fresh, or switching from
 * another account it was signed in to before.
 *
 * Its cursor belongs to the old account (or to nothing): following it would
 * skip the new account's early records. And its outbox only holds what the
 * old account had not acknowledged, so everything is queued again: the new
 * account has seen none of it. Merging, not replacing: nothing on this device
 * is lost, and rows the account already has at a newer rev win as always.
 *
 * Sample data never joins an account; it is removed first.
 */
async function prepareToJoin(db: BookandryDB, userId: string): Promise<void> {
  const existing = await loadKeys(db);
  if (existing?.userId === userId) return;
  if (await hasDemoData(db)) await removeDemoData(db);
  await forgetSyncIdentity(db);
  await requeueEverything(db);
  await db.meta.put({ key: DATA_OWNER_KEY, value: userId });
}

async function adopt(db: BookandryDB, userId: string, dataKey: Bytes, version: number): Promise<void> {
  try {
    await prepareToJoin(db, userId);
    await adoptKeyring(db, userId, await deriveKeyring(dataKey, version));
  } finally {
    dataKey.fill(0);
  }
}

const isAlreadySetUp = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && (error as { code: unknown }).code === 'already_set_up';

/**
 * Get this device the account's current key, making it if the account has
 * none yet. Called on every sign-in and whenever the account's key moves on;
 * safe to call again at any time.
 */
export async function connectDevice(
  db: BookandryDB,
  server: KeyServer,
  userId: string,
  options: ConnectOptions = {},
): Promise<ConnectResult> {
  const floor = await keyFloor(db, userId);
  const state = await server.getKeyState();
  // Keys only move forward. An older one than this device has held is a
  // server replaying a retired key - the one "sign out other devices" retired.
  if (state.keyVersion < floor) return { ok: false, reason: 'downgrade' };

  const entry = state.wraps.find((w) => w.kind === 'account' && w.keyVersion === state.keyVersion);
  const local = await loadKeys(db);
  if (state.keyVersion > 0 && local?.userId === userId && local.byVersion.has(state.keyVersion)) {
    return { ok: true, needsAccountKey: entry === undefined };
  }

  if (options.addExistingData !== true) {
    const check = await joinCheck(db, userId);
    if (check.kind === 'foreign') {
      return {
        ok: false,
        reason: 'foreign_data',
        profiles: check.profiles,
        transactions: check.transactions,
      };
    }
  }

  if (state.keyVersion === 0) {
    const dataKey = newDataKey();
    let version: number;
    try {
      version = await server.setupKeys([accountEntry(dataKey, 1)]);
    } catch (error) {
      dataKey.fill(0);
      // Another device got there first: its key is the account's. Fetch it.
      if (isAlreadySetUp(error))
        return connectDevice(db, server, userId, { ...options, addExistingData: true });
      throw error;
    }
    await adopt(db, userId, dataKey, version);
    return { ok: true, needsAccountKey: false };
  }

  if (entry !== undefined) {
    await adopt(db, userId, keyFromAccountEntry(entry), state.keyVersion);
    return { ok: true, needsAccountKey: false };
  }
  return { ok: false, reason: 'legacy_locked' };
}

/**
 * A brand-new data key, held by the account, replacing the current one.
 *
 * - "Sign out other devices": nothing written from now on can be read with a
 *   key a lost device still holds (the caller revokes their sessions too).
 * - Moving an account that was set up behind a passphrase over to an
 *   account-held key, from a device that has synced everything down first.
 * - Starting the synced copy over from this device, when the old key is out
 *   of reach.
 *
 * The server drops every record sealed under the old key; this device queues
 * everything it has to be sealed again, and the next sync re-uploads it.
 * Other devices meet the new key at their next sync and fetch it themselves.
 */
export async function rotateAccountKey(db: BookandryDB, server: KeyServer, userId: string): Promise<void> {
  const floor = await keyFloor(db, userId);
  const state = await server.getKeyState();
  if (state.keyVersion < floor)
    throw new RangeError('refusing to rotate from a key older than this device holds');

  const dataKey = newDataKey();
  const next = state.keyVersion + 1;
  try {
    const version =
      state.keyVersion === 0
        ? await server.setupKeys([accountEntry(dataKey, 1)])
        : await server.rotateKeys(state.keyVersion, [accountEntry(dataKey, next)]);
    await prepareToJoin(db, userId);
    await adoptKeyring(db, userId, await deriveKeyring(dataKey, version));
    await requeueEverything(db);
  } finally {
    dataKey.fill(0);
  }
}
