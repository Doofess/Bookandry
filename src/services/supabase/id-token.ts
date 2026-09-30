/**
 * Signing in with Google or Apple on bookandry.com's own address.
 *
 * Supabase's own OAuth flow sends people to Google by way of the project's
 * supabase.co address, and Google names whoever it will hand the account to:
 * "to continue to eanrighmesbmboergnhj.supabase.co" - a stranger's address on
 * the one screen where people are taught to check who they are signing in to.
 *
 * Here the provider hands its answer straight back to this site instead: a
 * signed ID token, which Supabase then checks (signature, audience, expiry,
 * nonce) and turns into a session. Google's page names bookandry.com, and no
 * secret is needed anywhere - Apple's OAuth flow would need a client secret
 * that expires every six months; this one does not.
 *
 *  - Google returns to /auth/callback with the token in the URL fragment,
 *    which never reaches any server.
 *  - Apple insists on POSTing its answer when it is asked for an email, so it
 *    returns to /auth/apple, where the Worker (src/services/cloudflare/worker.ts) turns the POST
 *    into the same /auth/callback fragment.
 *
 * The nonce ties a token to the sign-in this browser started: the provider
 * signs its SHA-256 into the token, and only this browser holds the nonce
 * itself, which Supabase requires alongside. A token lifted from somewhere
 * else cannot be used to sign in. `state` does the same for the redirect.
 */

import { systemClock } from '@/lib/clock';
import { randomBytes, sha256Hex, toBase64Url } from '@/services/crypto/bytes';

import { APPLE_RETURN_PATH, CALLBACK_PATH } from './auth-paths';

export type IdProvider = 'google' | 'apple';

export { APPLE_RETURN_PATH, CALLBACK_PATH };

/** The sign-in this browser started, kept for the trip to the provider and back. */
export const PENDING_KEY = 'bookandry.signinRedirect';
/** A trip that takes longer than this is abandoned, not finished. */
const MAX_AGE_MS = 15 * 60_000;

type Pending = {
  readonly provider: IdProvider;
  readonly state: string;
  readonly nonce: string;
  readonly at: number;
};

/** What came back from the provider, checked against what this browser started. */
export type Arrival =
  | { readonly ok: true; readonly provider: IdProvider; readonly token: string; readonly nonce: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unknown' };

/** The public client id each provider knows this site by. Absent: that provider is not offered this way. */
export function idClientId(provider: IdProvider): string | undefined {
  const id =
    provider === 'google' ? import.meta.env.VITE_GOOGLE_CLIENT_ID : import.meta.env.VITE_APPLE_CLIENT_ID;
  return id === undefined || id.length === 0 ? undefined : id;
}

function randomToken(): string {
  return toBase64Url(randomBytes(32));
}

/**
 * Record a new sign-in and return the provider's address to go to. The
 * caller navigates there; nothing comes back to this page.
 */
export async function beginIdSignIn(
  provider: IdProvider,
  clientId: string,
  { origin, nowMs, storage }: { origin: string; nowMs: number; storage: Storage },
): Promise<string> {
  const pending: Pending = { provider, state: randomToken(), nonce: randomToken(), at: nowMs };
  storage.setItem(PENDING_KEY, JSON.stringify(pending));
  const hashedNonce = await sha256Hex(pending.nonce);

  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${origin}${CALLBACK_PATH}`,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: hashedNonce,
      state: pending.state,
      // Always the account chooser: on a shared computer, never quietly the
      // last Google account used.
      prompt: 'select_account',
    }).toString();
    return url.href;
  }

  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}${APPLE_RETURN_PATH}`,
    response_type: 'code id_token',
    // Asking for the email is what makes Apple POST its answer (form_post);
    // without it, the token would carry no email at all.
    response_mode: 'form_post',
    scope: 'name email',
    nonce: hashedNonce,
    state: pending.state,
  }).toString();
  return url.href;
}

function readPending(storage: Storage): Pending | undefined {
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<Pending>;
    if (
      (parsed.provider !== 'google' && parsed.provider !== 'apple') ||
      typeof parsed.state !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.at !== 'number'
    )
      return undefined;
    return parsed as Pending;
  } catch {
    return undefined;
  }
}

/**
 * At boot, before the router reads the address: if this is the return from a
 * provider, take its answer out of the URL (and out of the history, so Back
 * never lands on a token) and check it against the sign-in this browser
 * started. `undefined`: not a return from a provider.
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
  // Google: access_denied. Apple: user_cancelled_authorize. Closing the
  // provider's page is not an error to report.
  if (error === 'access_denied' || error === 'user_cancelled_authorize')
    return { ok: false, reason: 'cancelled' };
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
  return { ok: true, provider: pending.provider, token, nonce: pending.nonce };
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

/** The provider's answer, once: finishing a sign-in twice is never right. */
export function takeArrival(): Arrival | undefined {
  const taken = arrival;
  arrival = undefined;
  return taken;
}
