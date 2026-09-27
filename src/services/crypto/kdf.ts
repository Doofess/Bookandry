import { utf8, type Bytes } from './bytes';

/**
 * Argon2id for the sync passphrase - the one secret a person chooses, and so
 * the one an attacker holding the server's copy could try to guess offline.
 *
 * Memory-hard on purpose: 64 MiB per guess makes a GPU farm about as slow as a
 * phone. Measured in Phase 0: 0.3 s on a desktop, 1.6 s with the CPU throttled
 * 6x. Parameters are stored with each wrapped key, so they can be raised later
 * without breaking keys wrapped under the old ones.
 */
export type ArgonParams = {
  readonly alg: 'argon2id';
  /** KiB. */
  readonly m: number;
  readonly t: number;
  readonly p: number;
};

export const DEFAULT_ARGON: ArgonParams = { alg: 'argon2id', m: 65_536, t: 3, p: 1 };

/** Below this the parameters are a formality, not a defence. */
const MIN_ARGON: ArgonParams = { alg: 'argon2id', m: 19_456, t: 2, p: 1 };

/**
 * Above this a phone runs out of memory or patience. The parameters come back
 * from the server with the wrap, and they are used BEFORE anything can be
 * authenticated - a stretch has to happen to get the key that would check
 * them - so a server that rewrote them to 4 GiB could crash every unlock.
 * Four times today's default leaves room to strengthen it later.
 */
const MAX_ARGON: ArgonParams = { alg: 'argon2id', m: 262_144, t: 8, p: 4 };

export function isAcceptableArgon(params: ArgonParams, allowWeak = false): boolean {
  const { m, t, p } = params;
  // The type promises argon2id; the server's copy promises nothing.
  if ((params.alg as string) !== 'argon2id' || ![m, t, p].every(Number.isSafeInteger)) return false;
  if (m > MAX_ARGON.m || t > MAX_ARGON.t || p > MAX_ARGON.p) return false;
  if (allowWeak) return m >= 8 * p && t >= 1 && p >= 1;
  return m >= MIN_ARGON.m && t >= MIN_ARGON.t && p >= 1;
}

/**
 * NFKC, so the same passphrase typed on a phone and on a laptop - where a
 * keyboard may produce a precomposed "é" on one and "e" + combining accent on
 * the other - derives the same key. Surrounding whitespace is kept: it is part
 * of what the person chose, and trimming it silently would be a guess.
 */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize('NFKC');
}

export async function stretchPassphrase(
  passphrase: string,
  salt: Bytes,
  params: ArgonParams,
): Promise<Bytes> {
  // Loaded on first use: only typing a sync passphrase needs Argon2id, and
  // its WebAssembly has no business in every cold start.
  const { argon2id } = await import('hash-wasm');
  const out = await argon2id({
    password: utf8(normalizePassphrase(passphrase)),
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: 32,
    outputType: 'binary',
  });
  return new Uint8Array(out);
}
