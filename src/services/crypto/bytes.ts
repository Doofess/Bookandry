/**
 * Byte helpers for the crypto layer.
 *
 * `Uint8Array<ArrayBuffer>` throughout, not the default `ArrayBufferLike`:
 * WebCrypto refuses views over a SharedArrayBuffer, and TypeScript 6 says so.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function concat(...parts: readonly Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * An unambiguous encoding of a list of fields: each one prefixed by its length.
 *
 * This is what every piece of authenticated context (AAD) and every derived
 * identifier is built from. Joining with a delimiter - "a|bc" - would let a
 * server construct a DIFFERENT list with the SAME bytes ("a|b" + "c"), and a
 * ciphertext authenticated for one row would verify as another. With lengths,
 * two different lists can never encode alike.
 */
export function lengthPrefixed(fields: readonly (string | Uint8Array)[]): Bytes {
  const parts: Uint8Array[] = [];
  for (const field of fields) {
    const bytes = typeof field === 'string' ? utf8(field) : field;
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length, false);
    parts.push(length, bytes);
  }
  return concat(...parts);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new RangeError('not base64url');
  const padded = text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Constant-time comparison, for anything that is compared as a secret. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Lowercase hex SHA-256 of a string: the form OpenID nonces are compared in. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
