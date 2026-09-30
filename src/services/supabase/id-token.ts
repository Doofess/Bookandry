/**
 * Signing in with Google on bookandry.com's own address.
 *
 * Supabase's own OAuth flow sends people to Google by way of the project's
 * supabase.co address, and Google names whoever it will hand the account to:
 * "to continue to eanrighmesbmboergnhj.supabase.co" - a stranger's address on
 * the one screen where people are taught to check who they are signing in to.
 *
 * Here Google hands its answer straight back to this site instead: a signed
 * ID token, in the fragment of /auth/callback (a fragment never reaches any
 * server), which Supabase then checks - signature, audience, expiry, nonce -
 * and turns into a session. Google's page names bookandry.com, and no secret
 * is involved.
 *
 * The nonce ties a token to the sign-in this browser started: Google signs its
 * SHA-256 into the token, and only this browser holds the nonce itself, which
 * Supabase requires alongside. A token lifted from somewhere else cannot be
 * used to sign in. `state` does the same for the redirect.
 */

import { systemClock } from '@/lib/clock';
import { randomBytes, sha256Hex, toBase64Url } from '@/services/crypto/bytes';

/**
 * Where Google sends the person back. Registered on the Google OAuth client
 * (see the README's checklist): changing it breaks signing in until it is
 * registered again.
 */
export const CALLBACK_PATH = '/auth/callback';

/** The sign-in this browser started, kept for the trip to Google and back. */
export const PENDING_KEY = 'bookandry.signinRedirect';
/** A trip that takes longer than this is abandoned, not finished. */
const MAX_AGE_MS = 15 * 60_000;

type Pending = {
  readonly state: string;
  readonly nonce: string;
  readonly at: number;
};

/** What came back from Google, checked against what this browser started. */
export type Arrival =
  | { readonly ok: true; readonly token: string; readonly nonce: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unknown' };

/** The Google OAuth web client's public id. Absent: Supabase's own redirect is used instead. */
export function googleClientId(): string | undefined {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return id === undefined || id.length === 0 ? undefined : id;
}

function randomToken(): string {
  return toBase64Url(randomBytes(32));
}

/**
 * Record a new sign-in and return Google's address to go to. The caller
 * navigates there; nothing comes back to this page.
 */
export async function beginGoogleSignIn(
  clientId: string,
  { origin, nowMs, storage }: { origin: string; nowMs: number; storage: Storage },
): Promise<string> {
  const pending: Pending = { state: randomToken(), nonce: randomToken(), at: nowMs };
  storage.setItem(PENDING_KEY, JSON.stringify(pending));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: await sha256Hex(pending.nonce),
    state: pending.state,
    // Always the account chooser: on a shared computer, never quietly the
    // last Google account used.
    prompt: 'select_account',
  }).toString();
  return url.href;
}

function readPending(storage: Storage): Pending | undefined {
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<Pending>;
    if (typeof parsed.state !== 'string' || typeof parsed.nonce !== 'string' || typeof parsed.at !== 'number')
      return undefined;
    return parsed as Pending;
  } catch {
    return undefined;
  }
}

/**
 * At boot, before the router reads the address: if this is the return from
 * Google, take its answer out of the URL (and out of the history, so Back
 * never lands on a token) and check it against the sign-in this browser
 * started. `undefined`: not a return from Google.
 */
export function readArrival({
  location,
  storage,
  nowMs,
  replaceUrl,
}: {
  location: Pick<Location, 'pathname' | 'hash'>;
  storage: Storage;
  nowMs: number;
  replaceUrl: (url: string) => void;
}): Arrival | undefined {
  if (location.pathname !== CALLBACK_PATH) return undefined;
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  replaceUrl('/');
  let pending: Pending | undefined;
  try {
    pending = readPending(storage);
    storage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: there is no sign-in of ours to finish.
  }

  const error = params.get('error');
  // Closing Google's page is not an error to report.
  if (error === 'access_denied') return { ok: false, reason: 'cancelled' };
  const token = params.get('id_token');
  if (pending === undefined) return { ok: false, reason: 'unknown' };
  if (
    error !== null ||
    token === null ||
    params.get('state') !== pending.state ||
    nowMs - pending.at > MAX_AGE_MS ||
    nowMs < pending.at
  )
    return { ok: false, reason: 'unknown' };
  return { ok: true, token, nonce: pending.nonce };
}

let arrival: Arrival | undefined;

/** The browser's own version of readArrival, run once at boot (src/main.tsx). */
export function captureArrival(): void {
  try {
    arrival = readArrival({
      location: window.location,
      storage: localStorage,
      nowMs: systemClock.nowMs(),
      replaceUrl: (url) => {
        window.history.replaceState(null, '', url);
      },
    });
  } catch {
    arrival = undefined;
  }
}

/** Google's answer, once: finishing a sign-in twice is never right. */
export function takeArrival(): Arrival | undefined {
  const taken = arrival;
  arrival = undefined;
  return taken;
}
