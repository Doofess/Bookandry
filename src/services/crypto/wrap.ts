import { open, seal } from './aead';
import { fromBase64Url, lengthPrefixed, randomBytes, toBase64Url, utf8, type Bytes } from './bytes';
import { isAcceptableArgon, stretchPassphrase, type ArgonParams } from './kdf';

/**
 * The data key, wrapped: what the server stores so a new device can unlock.
 *
 * One wrap per way in - each passkey, the recovery key, the passphrase - each
 * the data key encrypted under a key-encryption key (KEK) only that way in can
 * produce. The server holds all of them and can open none.
 *
 * Every wrap is bound to its user, its kind, its id and the data-key version
 * by authenticated context: a wrap copied onto another account, or presented
 * as a different kind of factor, fails to open rather than opening wrong.
 */
export type WrapKind = 'passkey' | 'recovery' | 'passphrase' | 'account';

export type WrappedKey = {
  readonly kind: WrapKind;
  /** The passkey's credential id; 'recovery' / 'passphrase' / 'account' for the others. */
  readonly id: string;
  readonly keyVersion: number;
  /** base64url. For KDF input; public. */
  readonly salt: string;
  readonly iv: string;
  readonly ct: string;
  /** Present only for a passphrase, whose KEK is stretched. */
  readonly kdf?: ArgonParams;
};

export type WrapContext = { readonly userId: string };

const SALT_BYTES = 16;

function wrapAad(ctx: WrapContext, kind: WrapKind, id: string, keyVersion: number): Bytes {
  return lengthPrefixed(['bookandry/wrap/v1', ctx.userId, kind, id, String(keyVersion)]);
}

async function kekFromBytes(secret: Bytes, salt: Bytes, info: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * The KEK for one factor.
 *
 * A recovery key or a passkey's PRF output is already 128-256 random bits, so
 * HKDF is enough. A passphrase is something a person chose, so it is stretched
 * with Argon2id first - and its parameters travel with the wrap.
 */
export type Factor =
  | { readonly kind: 'recovery'; readonly bytes: Bytes }
  | { readonly kind: 'passkey'; readonly credentialId: string; readonly prfOutput: Bytes }
  | { readonly kind: 'passphrase'; readonly passphrase: string; readonly params: ArgonParams };

function factorId(factor: Factor): string {
  return factor.kind === 'passkey' ? factor.credentialId : factor.kind;
}

async function kekFor(factor: Factor, salt: Bytes): Promise<CryptoKey> {
  switch (factor.kind) {
    case 'recovery':
      return kekFromBytes(factor.bytes, salt, 'bookandry/kek/recovery/v1');
    case 'passkey':
      return kekFromBytes(factor.prfOutput, salt, 'bookandry/kek/passkey/v1');
    case 'passphrase':
      return kekFromBytes(
        await stretchPassphrase(factor.passphrase, salt, factor.params),
        salt,
        'bookandry/kek/passphrase/v1',
      );
  }
}

export async function wrapDataKey(
  dataKey: Bytes,
  keyVersion: number,
  factor: Factor,
  ctx: WrapContext,
): Promise<WrappedKey> {
  const salt = randomBytes(SALT_BYTES);
  const id = factorId(factor);
  const sealed = await seal(await kekFor(factor, salt), dataKey, wrapAad(ctx, factor.kind, id, keyVersion));
  return {
    kind: factor.kind,
    id,
    keyVersion,
    salt: toBase64Url(salt),
    iv: toBase64Url(sealed.iv),
    ct: toBase64Url(sealed.ct),
    ...(factor.kind === 'passphrase' ? { kdf: factor.params } : {}),
  };
}

/**
 * Open a wrap with a factor. Throws DecryptError for a wrong passphrase, a
 * wrong recovery key, the wrong passkey or a tampered wrap - identically.
 *
 * A passphrase wrap whose stored Argon2id parameters are below the floor is
 * refused. This app never makes one, so such a wrap was made by a bug or by
 * someone else - and a passphrase stretched that little is guessable offline
 * by anyone holding the server's copy. Better to say so than to quietly
 * accept it. `allowWeakKdf` exists so tests can run in milliseconds.
 *
 * Parameters above the ceiling are refused too, before any stretching: they
 * arrive from the server, and they cost memory before the wrap can be checked.
 * They are not in the authenticated context because they need not be - a
 * changed parameter or salt stretches to a different key, which fails to open.
 */
export async function unwrapDataKey(
  wrapped: WrappedKey,
  factor: Factor,
  ctx: WrapContext,
  options: { allowWeakKdf?: boolean } = {},
): Promise<Bytes> {
  if (wrapped.kind !== factor.kind || wrapped.id !== factorId(factor)) {
    throw new RangeError('this wrap belongs to a different factor');
  }
  const salt = fromBase64Url(wrapped.salt);
  if (salt.length !== SALT_BYTES) throw new RangeError('refusing a wrap with a malformed salt');
  let effective = factor;
  if (factor.kind === 'passphrase') {
    const params = wrapped.kdf;
    if (params === undefined || !isAcceptableArgon(params, options.allowWeakKdf)) {
      throw new RangeError('refusing a passphrase wrap with missing, weak or excessive KDF parameters');
    }
    // The wrap's parameters, not the caller's: they are what it was made with.
    effective = { ...factor, params };
  }
  return open(
    await kekFor(effective, salt),
    { iv: fromBase64Url(wrapped.iv), ct: fromBase64Url(wrapped.ct) },
    wrapAad(ctx, wrapped.kind, wrapped.id, wrapped.keyVersion),
  );
}

/**
 * The account's own copy of the data key - not a wrap at all.
 *
 * Sync no longer asks people for a passphrase or a recovery key: signing in is
 * enough, so the account itself holds the key, readable only by its signed-in
 * owner (row-level security on user_keys). The key travels as plain base64url
 * because there is nothing to wrap it with that the server does not also
 * hold; dressing it in a wrap would only pretend otherwise.
 */
export const ACCOUNT_ENTRY_ID = 'account';

export function accountEntry(dataKey: Bytes, keyVersion: number): WrappedKey {
  if (dataKey.length !== DATA_KEY_LENGTH) throw new RangeError('data key must be 32 bytes');
  return { kind: 'account', id: ACCOUNT_ENTRY_ID, keyVersion, salt: '', iv: '', ct: toBase64Url(dataKey) };
}

export function keyFromAccountEntry(entry: WrappedKey): Bytes {
  if (entry.kind !== 'account') throw new RangeError('not an account key entry');
  const key = fromBase64Url(entry.ct);
  if (key.length !== DATA_KEY_LENGTH) throw new RangeError('account key entry is not 32 bytes');
  return key;
}

const DATA_KEY_LENGTH = 32;
