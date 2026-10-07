/**
 * An emailed delete request's token, kept for this visit while its person signs in.
 *
 * Signing in can leave the page (Google's round trip) and creating an account
 * goes through the first-run steps; either way the app comes back to the feed,
 * and this brings the request back up. Session storage: it never outlives
 * the tab, and never reaches another one.
 */
// 'greenback.*', like every stored identifier: the app's name before it was Bookandry.
const KEY = 'greenback.pendingWipe';
const TOKEN = /^[0-9a-f]{64}$/;

export function rememberPendingWipe(token: string): void {
  if (!TOKEN.test(token)) return;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Private mode with storage off: the link in the email still works.
  }
}

export function pendingWipe(): string | undefined {
  try {
    const value = sessionStorage.getItem(KEY);
    return value !== null && TOKEN.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function forgetPendingWipe(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

export function isWipeToken(value: string): boolean {
  return TOKEN.test(value);
}
