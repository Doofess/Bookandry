import type { AuthError, SupabaseClient } from '@supabase/supabase-js';

import { systemClock } from '@/lib/clock';

import { beginGoogleSignIn, googleClientId, type Arrival } from './id-token';

/**
 * Signing in and out: proving who you are to the server. Distinct from
 * UNLOCKING, which gives this device the data key (src/db/sync/account.ts)
 * and which the server takes no part in.
 *
 * Every failure is mapped to a small set the UI has a sentence for. The
 * mapping never distinguishes "no such account" from "wrong password" -
 * Supabase does not either, and telling a stranger which emails have
 * accounts is a leak.
 */
export type AuthFailure =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'wrong_code'
  | 'passkey_unavailable'
  | 'passkey_exists'
  | 'cancelled'
  | 'offline'
  | 'unknown';

export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly reason: AuthFailure };

function failure(error: AuthError | Error): AuthResult {
  const code = 'code' in error ? error.code : undefined;
  switch (code) {
    case 'invalid_credentials':
    case 'user_not_found':
      return { ok: false, reason: 'invalid_credentials' };
    case 'email_not_confirmed':
      return { ok: false, reason: 'email_not_confirmed' };
    case 'weak_password':
      return { ok: false, reason: 'weak_password' };
    case 'passkey_disabled':
    case 'webauthn_credential_not_found':
    case 'webauthn_verification_failed':
      return { ok: false, reason: 'passkey_unavailable' };
    case 'ERROR_CEREMONY_ABORTED':
      return { ok: false, reason: 'cancelled' };
    case 'webauthn_credential_exists':
      return { ok: false, reason: 'passkey_exists' };
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return { ok: false, reason: 'rate_limited' };
    default:
      break;
  }
  // The browser's own passkey prompt, closed or timed out: not an error to report.
  if (error.name === 'NotAllowedError' || error.name === 'AbortError')
    return { ok: false, reason: 'cancelled' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, reason: 'offline' };
  if (error.name === 'AuthRetryableFetchError') return { ok: false, reason: 'offline' };
  return { ok: false, reason: 'unknown' };
}

/** Where a confirmation or reset email, or Google, sends the person back to. */
export function returnUrl(): string {
  return `${window.location.origin}/settings`;
}

/**
 * A new account. With email confirmation on (it must be - see the setup
 * checklist in the README), no session comes back: the person confirms
 * from their inbox first.
 */
export async function signUpWithEmail(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult & { readonly confirm?: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: returnUrl() },
  });
  if (error !== null) return failure(error);
  return { ok: true, confirm: data.session === null };
}

export async function signInWithEmail(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error === null ? { ok: true } : failure(error);
}

/**
 * Leaves the page for Google. The session is made on the way back
 * (finishGoogleSignIn), from the ID token Google returns to this site - see
 * id-token.ts for why not Supabase's own redirect. A build with no Google
 * client id falls back to that redirect, which works but names the
 * supabase.co address on Google's page.
 */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<AuthResult> {
  const clientId = googleClientId();
  if (clientId === undefined) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl() },
    });
    return error === null ? { ok: true } : failure(error);
  }
  const url = await beginGoogleSignIn(clientId, {
    origin: window.location.origin,
    nowMs: systemClock.nowMs(),
    storage: localStorage,
  });
  window.location.assign(url);
  return { ok: true };
}

/** Google's ID token, and the nonce only this browser holds, exchanged for a session. */
export async function finishGoogleSignIn(
  supabase: SupabaseClient,
  arrival: Extract<Arrival, { ok: true }>,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: arrival.token,
    nonce: arrival.nonce,
  });
  return error === null ? { ok: true } : failure(error);
}

export async function sendPasswordReset(supabase: SupabaseClient, email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
  return error === null ? { ok: true } : failure(error);
}

export async function setNewPassword(supabase: SupabaseClient, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password });
  return error === null ? { ok: true } : failure(error);
}

/**
 * `local` signs this device out. `others` signs out every OTHER session,
 * the half of "I lost a device" that rotation cannot do on its own.
 */
export async function signOut(supabase: SupabaseClient, scope: 'local' | 'others'): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut({ scope });
  return error === null ? { ok: true } : failure(error);
}

// ---------------------------------------------------------------------------
// Two-step sign-in: a code from an authenticator app
// ---------------------------------------------------------------------------

/**
 * Where this session stands. `needsCode`: the account has codes turned on and
 * this session has not given one yet - the server serves it nothing until it
 * does (see the second_step migration).
 */
export type SecondStep = { readonly enabled: boolean; readonly needsCode: boolean };

export async function secondStep(supabase: SupabaseClient): Promise<SecondStep> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error !== null) throw error;
  return {
    enabled: data.nextLevel === 'aal2',
    needsCode: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2',
  };
}

async function verifiedTotp(supabase: SupabaseClient): Promise<string | undefined> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error !== null) throw error;
  // `totp` lists only verified factors; half-finished ones are in `all`.
  return data.totp[0]?.id;
}

/** Check the code for the account's authenticator app, raising this session to aal2. */
export async function verifyCode(supabase: SupabaseClient, code: string): Promise<AuthResult> {
  const factorId = await verifiedTotp(supabase);
  if (factorId === undefined) return { ok: false, reason: 'unknown' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return error === null ? { ok: true } : codeFailure(error);
}

export type Enrollment = {
  readonly factorId: string;
  /** An image source for the QR code. */
  readonly qr: string;
  /** The same secret as text, for typing into an app on this very phone. */
  readonly secret: string;
};

/**
 * Start turning codes on. Any half-finished attempt is dropped first - a
 * factor stays unverified until a code proves the app has it, and a person who
 * closed the sheet halfway should simply be able to start again.
 */
export async function startEnrollment(supabase: SupabaseClient): Promise<Enrollment> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError !== null) throw listError;
  for (const f of factors.all)
    if (f.factor_type === 'totp' && f.status !== 'verified')
      await supabase.auth.mfa.unenroll({ factorId: f.id });

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Bookandry' });
  if (error !== null) throw error;
  const qr = data.totp.qr_code.startsWith('data:')
    ? data.totp.qr_code
    : `data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`;
  return { factorId: data.id, qr, secret: data.totp.secret };
}

/** Finish turning codes on: the first code proves the app has the secret. */
export async function finishEnrollment(
  supabase: SupabaseClient,
  factorId: string,
  code: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return error === null ? { ok: true } : codeFailure(error);
}

/** Turn codes off. Needs a session that has given a code (aal2). */
export async function turnOffCodes(supabase: SupabaseClient): Promise<AuthResult> {
  const factorId = await verifiedTotp(supabase);
  if (factorId === undefined) return { ok: true };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error !== null) return failure(error);
  // The session keeps saying aal2 until it is refreshed.
  await supabase.auth.refreshSession();
  return { ok: true };
}

function codeFailure(error: AuthError | Error): AuthResult {
  const code = 'code' in error ? error.code : undefined;
  if (
    code === 'mfa_verification_failed' ||
    code === 'mfa_challenge_expired' ||
    code === 'invalid_credentials'
  )
    return { ok: false, reason: 'wrong_code' };
  return failure(error);
}

// ---------------------------------------------------------------------------
// Passkeys: signing in with the device's own lock
// ---------------------------------------------------------------------------

/** Whether this browser can use passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/**
 * The browser asks which passkey; the account follows from it. No email to
 * type: the passkey knows whose it is.
 */
export async function signInWithPasskey(supabase: SupabaseClient): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPasskey();
  return error === null ? { ok: true } : failure(error);
}

export async function addPasskey(supabase: SupabaseClient): Promise<AuthResult> {
  const { error } = await supabase.auth.registerPasskey();
  return error === null ? { ok: true } : failure(error);
}

export type Passkey = { readonly id: string; readonly name: string | undefined; readonly createdAt: string };

export async function listPasskeys(supabase: SupabaseClient): Promise<readonly Passkey[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error !== null) throw error;
  return data.map((p) => ({ id: p.id, name: p.friendly_name ?? undefined, createdAt: p.created_at }));
}

export async function removePasskey(supabase: SupabaseClient, id: string): Promise<AuthResult> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
  return error === null ? { ok: true } : failure(error);
}
