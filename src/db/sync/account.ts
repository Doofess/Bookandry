import { DecryptError } from '@/services/crypto/aead';
import type { Bytes } from '@/services/crypto/bytes';
import { DEFAULT_ARGON, type ArgonParams } from '@/services/crypto/kdf';
import { deriveKeyring, newDataKey } from '@/services/crypto/keys';
import { newRecoveryKey, parseRecoveryKey, type RecoveryKeyError } from '@/services/crypto/recovery-key';
import { unwrapDataKey, wrapDataKey, type Factor, type WrappedKey } from '@/services/crypto/wrap';
import type { KeyState } from '@/services/supabase/transport';

import type { BookandryDB } from '../db';
import { hasDemoData, removeDemoData } from '../demo';
import { adoptKeyring, forgetSyncIdentity, loadKeys } from './keystore';
import { requeueEverything } from './rotate';

/**
 * Setting up, unlocking and re-keying sync: the steps behind the account
 * screens, with the screens left out.
 *
 * Two secrets, in the words the UI uses:
 *
 *  - the SYNC PASSPHRASE, chosen by the person, stretched with Argon2id;
 *  - the RECOVERY KEY, 128 random bits the app makes and the person saves.
 *
 * Either one unlocks the data key on a new device. The raw data key exists in
 * memory only inside these functions - long enough to wrap or to derive the
 * non-extractable working keys - and is zeroed on the way out.
 *
 * The server is passed in, so the tests drive these against the real SQL.
 */
export type KeyServer = {
  getKeyState(): Promise<KeyState>;
  setupKeys(wraps: readonly WrappedKey[]): Promise<number>;
  putWrap(wrap: WrappedKey): Promise<void>;
  rotateKeys(from: number, wraps: readonly WrappedKey[]): Promise<number>;
};

export type AccountOptions = {
  /** Tests only: fast, weak stretching. Production never passes these. */
  readonly argon?: ArgonParams;
  readonly allowWeakKdf?: boolean;
};

/** What the person types to unlock: their passphrase, or their recovery key. */
export type Secret =
  | { readonly kind: 'passphrase'; readonly passphrase: string }
  | { readonly kind: 'recovery'; readonly text: string };

export type UnlockResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'wrong' | 'no_passphrase' | 'not_set_up' }
  | { readonly ok: false; readonly reason: 'malformed'; readonly detail: RecoveryKeyError };

export type SyncKeyStatus =
  /** The account has never set up sync: this device can be the first. */
  | 'not_set_up'
  /** Set up, but this device does not hold the current key. */
  | 'locked'
  | 'unlocked';

export async function keyStatus(db: BookandryDB, server: KeyServer, userId: string): Promise<SyncKeyStatus> {
  const state = await server.getKeyState();
  if (state.keyVersion === 0) return 'not_set_up';
  const local = await loadKeys(db);
  return local?.userId === userId && local.byVersion.has(state.keyVersion) ? 'unlocked' : 'locked';
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
 * Sample data never joins an account; it is removed first, and the join
 * screen says so.
 */
async function prepareToJoin(db: BookandryDB, userId: string): Promise<void> {
  const existing = await loadKeys(db);
  if (existing?.userId === userId) return;
  if (await hasDemoData(db)) await removeDemoData(db);
  await forgetSyncIdentity(db);
  await requeueEverything(db);
}

function passphraseFactor(passphrase: string, options: AccountOptions): Factor {
  return { kind: 'passphrase', passphrase, params: options.argon ?? DEFAULT_ARGON };
}

/**
 * First device on the account: make the data key and both ways in.
 *
 * Returns the recovery key for the person to save - the ONLY time it exists
 * in the clear. Throws the server's `already_set_up` if another device got
 * there first; that device's key is the account's, and this one unlocks.
 */
export async function setUpSync(
  db: BookandryDB,
  server: KeyServer,
  userId: string,
  passphrase: string,
  options: AccountOptions = {},
): Promise<{ readonly recoveryKey: string }> {
  const dataKey = newDataKey();
  const recovery = newRecoveryKey();
  try {
    const ctx = { userId };
    const wraps = [
      await wrapDataKey(dataKey, 1, { kind: 'recovery', bytes: recovery.bytes }, ctx),
      await wrapDataKey(dataKey, 1, passphraseFactor(passphrase, options), ctx),
    ];
    const version = await server.setupKeys(wraps);
    await prepareToJoin(db, userId);
    await adoptKeyring(db, userId, await deriveKeyring(dataKey, version));
    return { recoveryKey: recovery.display };
  } finally {
    dataKey.fill(0);
    recovery.bytes.fill(0);
  }
}

type Opened = { readonly dataKey: Bytes; readonly state: KeyState };

/** The raw data key for the CURRENT version, from a secret - or why not. */
async function openWith(
  server: KeyServer,
  userId: string,
  secret: Secret,
  options: AccountOptions,
): Promise<Opened | Exclude<UnlockResult, { ok: true }>> {
  const state = await server.getKeyState();
  if (state.keyVersion === 0) return { ok: false, reason: 'not_set_up' };
  const current = (kind: WrappedKey['kind']) =>
    state.wraps.find((w) => w.kind === kind && w.keyVersion === state.keyVersion);

  let factor: Factor;
  let wrapped: WrappedKey | undefined;
  if (secret.kind === 'recovery') {
    const parsed = parseRecoveryKey(secret.text);
    if (!parsed.ok) return { ok: false, reason: 'malformed', detail: parsed.error };
    factor = { kind: 'recovery', bytes: parsed.bytes };
    wrapped = current('recovery');
  } else {
    wrapped = current('passphrase');
    if (wrapped === undefined) return { ok: false, reason: 'no_passphrase' };
    factor = passphraseFactor(secret.passphrase, options);
  }
  if (wrapped === undefined) return { ok: false, reason: 'wrong' };

  try {
    const dataKey = await unwrapDataKey(wrapped, factor, { userId }, { allowWeakKdf: options.allowWeakKdf });
    return { dataKey, state };
  } catch (error) {
    // A wrong secret and a tampered wrap look the same, on purpose.
    if (error instanceof DecryptError) return { ok: false, reason: 'wrong' };
    throw error;
  } finally {
    if (factor.kind === 'recovery') factor.bytes.fill(0);
  }
}

/** A new device (or one left behind by a rotation) takes the account's key. */
export async function unlock(
  db: BookandryDB,
  server: KeyServer,
  userId: string,
  secret: Secret,
  options: AccountOptions = {},
): Promise<UnlockResult> {
  const opened = await openWith(server, userId, secret, options);
  if ('ok' in opened) return opened;
  try {
    await prepareToJoin(db, userId);
    await adoptKeyring(db, userId, await deriveKeyring(opened.dataKey, opened.state.keyVersion));
    return { ok: true };
  } finally {
    opened.dataKey.fill(0);
  }
}

/**
 * A fresh recovery key, replacing the old one - which stops working the
 * moment this returns. Proven with the passphrase or the current recovery key.
 */
export async function replaceRecoveryKey(
  server: KeyServer,
  userId: string,
  secret: Secret,
  options: AccountOptions = {},
): Promise<UnlockResult | { readonly ok: true; readonly recoveryKey: string }> {
  const opened = await openWith(server, userId, secret, options);
  if ('ok' in opened) return opened;
  const recovery = newRecoveryKey();
  try {
    await server.putWrap(
      await wrapDataKey(
        opened.dataKey,
        opened.state.keyVersion,
        { kind: 'recovery', bytes: recovery.bytes },
        { userId },
      ),
    );
    return { ok: true, recoveryKey: recovery.display };
  } finally {
    opened.dataKey.fill(0);
    recovery.bytes.fill(0);
  }
}

/**
 * A new sync passphrase. The old one stops unlocking new devices - but a
 * device that already unlocked keeps its keys, which is why "I lost a
 * device" is rotation, not this. The UI says so.
 */
export async function changePassphrase(
  server: KeyServer,
  userId: string,
  secret: Secret,
  next: string,
  options: AccountOptions = {},
): Promise<UnlockResult> {
  const opened = await openWith(server, userId, secret, options);
  if ('ok' in opened) return opened;
  try {
    await server.putWrap(
      await wrapDataKey(opened.dataKey, opened.state.keyVersion, passphraseFactor(next, options), { userId }),
    );
    return { ok: true };
  } finally {
    opened.dataKey.fill(0);
  }
}

/**
 * "I lost a device": a brand-new data key, so nothing written from now on can
 * be read with anything the lost device holds.
 *
 * Proven with a current secret. Makes a new recovery key (the old one opened
 * the old key, and may be written down next to the lost device) and wraps the
 * new key under `passphrase` - the current one again, or a new one. The server
 * drops every record; this device queues everything to be sealed again, and
 * the next sync re-uploads it. Other devices stop at the barrier until they
 * unlock with the new key.
 *
 * Signing the lost device out of the account is the caller's other half.
 */
export async function rotateDataKey(
  db: BookandryDB,
  server: KeyServer,
  userId: string,
  secret: Secret,
  passphrase: string,
  options: AccountOptions = {},
): Promise<UnlockResult | { readonly ok: true; readonly recoveryKey: string }> {
  const opened = await openWith(server, userId, secret, options);
  if ('ok' in opened) return opened;
  opened.dataKey.fill(0); // proof only; the old key is not needed again

  const from = opened.state.keyVersion;
  const dataKey = newDataKey();
  const recovery = newRecoveryKey();
  try {
    const ctx = { userId };
    const wraps = [
      await wrapDataKey(dataKey, from + 1, { kind: 'recovery', bytes: recovery.bytes }, ctx),
      await wrapDataKey(dataKey, from + 1, passphraseFactor(passphrase, options), ctx),
    ];
    const version = await server.rotateKeys(from, wraps);
    await adoptKeyring(db, userId, await deriveKeyring(dataKey, version));
    await requeueEverything(db);
    return { ok: true, recoveryKey: recovery.display };
  } finally {
    dataKey.fill(0);
    recovery.bytes.fill(0);
  }
}
