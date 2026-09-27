import { randomBytes, type Bytes } from './bytes';

/**
 * The recovery key: 128 random bits a person writes down or saves.
 *
 * Crockford base32 - digits and capitals minus I, L, O and U - because it is
 * made to be read off paper and typed back: no letter that looks like a digit.
 * 128 bits is 26 characters (the last carries two zero bits), plus ONE check
 * character (value mod 37, Crockford's own checksum), so a single mistyped
 * character is caught as a typo before it is ever tried as a key.
 *
 * Shown in groups of four: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXX.
 *
 * 128 bits needs no slow hash: nobody can guess it, so a fast key derivation
 * (HKDF, in wrap.ts) is enough. The passphrase is the one that needs Argon2id.
 */
export const RECOVERY_KEY_BYTES = 16;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHECK_ALPHABET = `${ALPHABET}*~$=U`;
const DATA_CHARS = 26;

export type RecoveryKey = { readonly bytes: Bytes; readonly display: string };

export function newRecoveryKey(): RecoveryKey {
  const bytes = randomBytes(RECOVERY_KEY_BYTES);
  return { bytes, display: formatRecoveryKey(bytes) };
}

function toBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

export function formatRecoveryKey(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_KEY_BYTES) throw new RangeError('recovery key must be 16 bytes');
  const value = toBigInt(bytes);
  let shifted = value << 2n; // 128 bits -> 130, a whole number of characters
  let chars = '';
  for (let i = 0; i < DATA_CHARS; i += 1) {
    chars = ALPHABET.charAt(Number(shifted & 31n)) + chars;
    shifted >>= 5n;
  }
  chars += CHECK_ALPHABET.charAt(Number(value % 37n));
  const groups: string[] = [];
  for (let at = 0; at < chars.length; at += 4) groups.push(chars.slice(at, at + 4));
  return groups.join('-');
}

export type RecoveryKeyError = 'length' | 'characters' | 'checksum';

/**
 * Read a recovery key the way people actually type one: any case, with or
 * without dashes and spaces, O for 0 and I or L for 1.
 */
export function parseRecoveryKey(
  input: string,
): { ok: true; bytes: Bytes } | { ok: false; error: RecoveryKeyError } {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replaceAll('O', '0').replace(/[IL]/g, '1');
  if (cleaned.length !== DATA_CHARS + 1) return { ok: false, error: 'length' };

  let shifted = 0n;
  for (const ch of cleaned.slice(0, DATA_CHARS)) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) return { ok: false, error: 'characters' };
    shifted = (shifted << 5n) | BigInt(digit);
  }
  if ((shifted & 3n) !== 0n) return { ok: false, error: 'checksum' };
  const value = shifted >> 2n;

  const check = CHECK_ALPHABET.indexOf(cleaned.charAt(DATA_CHARS));
  if (check < 0) return { ok: false, error: 'characters' };
  if (BigInt(check) !== value % 37n) return { ok: false, error: 'checksum' };

  const bytes = new Uint8Array(RECOVERY_KEY_BYTES);
  let v = value;
  for (let i = RECOVERY_KEY_BYTES - 1; i >= 0; i -= 1) {
    bytes[i] = Number(v & 255n);
    v >>= 8n;
  }
  return { ok: true, bytes };
}
