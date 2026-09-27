import type { AuthError, SupabaseClient } from '@supabase/supabase-js';

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
  'invalid_credentials' | 'email_not_confirmed' | 'weak_password' | 'rate_limited' | 'offline' | 'unknown';

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
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return { ok: false, reason: 'rate_limited' };
    default:
      break;
  }
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

/** Leaves the page for Google; the session arrives with the redirect back. */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnUrl() },
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
