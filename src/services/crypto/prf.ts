import { utf8, type Bytes } from './bytes';

/**
 * Passkey unlock through the WebAuthn PRF extension.
 *
 * A PRF-capable passkey returns a secret derived from (the credential, a salt
 * we choose). Same passkey + same salt = same secret, on any device the passkey
 * syncs to, and it never exists anywhere else - which is what lets one
 * biometric prompt both sign in and unlock, with nothing to remember.
 *
 * The salt is a fixed, public app constant. It is not a secret; its job is to
 * make the output specific to this app and this purpose.
 */
export const PRF_SALT: Bytes = utf8('bookandry/prf/v1');

/** The `extensions` member for navigator.credentials.create / get. */
export function prfExtension(): { prf: { eval: { first: Bytes } } } {
  return { prf: { eval: { first: PRF_SALT } } };
}

/** The PRF output from a credential, if the authenticator produced one. */
export function prfOutputOf(credential: { getClientExtensionResults(): unknown }): Bytes | undefined {
  const results = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer | ArrayBufferView } };
  };
  const first = results.prf?.results?.first;
  if (first === undefined) return undefined;
  const bytes =
    first instanceof ArrayBuffer
      ? new Uint8Array(first)
      : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return new Uint8Array(bytes); // a copy we own, backed by a plain ArrayBuffer
}

/**
 * The credential JSON as it may be SENT to the server - with every PRF result
 * removed.
 *
 * Found in Phase 0: Supabase's passkey serializer sends the browser's
 * client-extension results to its server verbatim. The PRF output is the
 * passkey's unlock secret; if it went along, the server could unwrap the data
 * key and end-to-end encryption would be over. The server needs none of it -
 * the signature does not cover client extension results - so it is stripped
 * here, in ONE function every outgoing credential passes through, and a test
 * holds the line.
 */
export function withoutPrf<T>(credentialJson: T): T {
  const copy = structuredClone(credentialJson) as T & { clientExtensionResults?: Record<string, unknown> };
  if (copy.clientExtensionResults !== undefined) {
    const { prf: _prf, ...rest } = copy.clientExtensionResults;
    copy.clientExtensionResults = rest;
  }
  return copy;
}
