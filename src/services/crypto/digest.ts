/**
 * A file's fingerprint: its SHA-256, as hex.
 *
 * Not key material - "Add with AI" uses it to know a file it has already read
 * (and not pay to read it again), and to send a duplicate image once. It lives
 * here because every `crypto.subtle` call does.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
