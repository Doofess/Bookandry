import { randomBytes, type Bytes } from './bytes';

/**
 * AES-256-GCM, the only cipher in this app.
 *
 * A fresh random 96-bit IV per encryption. For one household's key that is far
 * inside the safe bound (a collision is a 2^-32 event only after ~2^48
 * encryptions under one key; a household writes thousands). Key rotation
 * resets the count anyway.
 *
 * `open` throws on ANY mismatch - wrong key, altered ciphertext, altered IV,
 * altered context - and says nothing about which. Callers treat a throw as
 * "this record is not ours to trust", never as something to retry around.
 */
export const IV_BYTES = 12;

export type Sealed = { readonly iv: Bytes; readonly ct: Bytes };

export async function seal(key: CryptoKey, plaintext: Bytes, aad: Bytes): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext),
  );
  return { iv, ct };
}

export async function open(key: CryptoKey, sealed: Sealed, aad: Bytes): Promise<Bytes> {
  if (sealed.iv.length !== IV_BYTES) throw new DecryptError();
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv, additionalData: aad }, key, sealed.ct),
    );
  } catch {
    throw new DecryptError();
  }
}

/** Deliberately uninformative: which check failed is nobody's business. */
export class DecryptError extends Error {
  constructor() {
    super('Could not decrypt');
    this.name = 'DecryptError';
  }
}
