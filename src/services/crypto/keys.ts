import { lengthPrefixed, randomBytes, toBase64Url, utf8, type Bytes } from './bytes';

/**
 * The household's data key, and what is derived from it.
 *
 * The data key is 32 random bytes, made once when sync is set up. It never
 * leaves a device in the clear: the server stores it only wrapped (see
 * wrap.ts), and on a device it exists as raw bytes only for the moment it
 * takes to derive the two working keys below, which are non-extractable -
 * the browser will use them but will not hand their bytes to any script.
 *
 * Two keys, not one, because they do two different jobs: `enc` encrypts rows,
 * `blind` turns (table, id) into an opaque record id. Using one key for both
 * would tie the secrecy of the ids to the secrecy of the contents.
 */
export const DATA_KEY_BYTES = 32;

export type Keyring = {
  /** Which data key this is. Rotation makes a new one; every record says which. */
  readonly version: number;
  /** AES-256-GCM, encrypt/decrypt only. */
  readonly enc: CryptoKey;
  /** HMAC-SHA-256, sign only: blinds record ids. */
  readonly blind: CryptoKey;
};

export function newDataKey(): Bytes {
  return randomBytes(DATA_KEY_BYTES);
}

const HKDF_SALT = utf8('bookandry/keyring/v1');

export async function deriveKeyring(dataKey: Bytes, version: number): Promise<Keyring> {
  if (dataKey.length !== DATA_KEY_BYTES) throw new RangeError('data key must be 32 bytes');
  const root = await crypto.subtle.importKey('raw', dataKey, 'HKDF', false, ['deriveKey']);
  const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: utf8(info) });

  const enc = await crypto.subtle.deriveKey(
    hkdf('bookandry/enc/v1'),
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const blind = await crypto.subtle.deriveKey(
    hkdf('bookandry/rid/v1'),
    root,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  return { version, enc, blind };
}

/**
 * The id the SERVER sees for a row: HMAC(table, id), base64url.
 *
 * Without it the server would learn the table of every record and, from the
 * UUIDv7 ids, the moment every row was created - a timeline of a household's
 * spending, in plaintext, next to the ciphertext. Deterministic, so the same
 * row always lands on the same server record; keyed, so nobody without the
 * data key can compute or reverse it.
 */
export async function blindRecordId(keyring: Keyring, tbl: string, id: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', keyring.blind, lengthPrefixed(['bookandry/rid/v1', tbl, id]));
  return toBase64Url(new Uint8Array(mac));
}
