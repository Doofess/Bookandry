import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { ServerError, type Rpc } from './transport';

/**
 * The Supabase client, loaded only when it is needed.
 *
 * An account is optional, and most people using a local-first app never make
 * one - so supabase-js (~50 KB gzipped) is a dynamic import, fetched the
 * first time someone opens the account screens or comes back already signed
 * in, never on a plain cold start.
 *
 * Only PUBLIC configuration lives in the bundle: the project URL and the
 * publishable key, which are designed to be public and are useless without
 * row-level security, which denies everything but a user's own rows. No
 * service-role key, no OAuth client secret, ever - those live in the Supabase
 * dashboard and nowhere else.
 */

type Config = { readonly url: string; readonly key: string };

function config(): Config | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url === undefined || !url.startsWith('https://') || key === undefined || key.length === 0)
    return undefined;
  return { url, key };
}

/** Where supabase-js keeps the session. Its presence means "was signed in". */
export const AUTH_STORAGE_KEY = 'bookandry.auth';

/** Builds without the environment (tests, a fork) simply have no accounts. */
export function accountsAvailable(): boolean {
  return config() !== undefined;
}

export function supabaseOrigin(): string | undefined {
  const c = config();
  return c === undefined ? undefined : new URL(c.url).origin;
}

let client: Promise<SupabaseClient> | undefined;

export function getSupabase(): Promise<SupabaseClient> {
  const c = config();
  if (c === undefined) return Promise.reject(new Error('accounts are not configured in this build'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(c.url, c.key, {
      auth: {
        // PKCE: the code in the redirect is useless without the verifier this
        // browser kept, so an intercepted redirect is not a stolen session.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
      },
    }),
  );
  return client;
}

/**
 * Whether it is worth loading the client at boot: a stored session, or an
 * OAuth / email-link redirect waiting in the URL to be exchanged for one.
 */
export function shouldLoadAtBoot(): boolean {
  if (!accountsAvailable()) return false;
  try {
    if (localStorage.getItem(AUTH_STORAGE_KEY) !== null) return true;
  } catch {
    // Storage blocked: no stored session to find.
  }
  const params = new URLSearchParams(window.location.search);
  return params.has('code') || window.location.hash.includes('access_token');
}

export function rpcFor(supabase: SupabaseClient): Rpc {
  return async (fn, args) => {
    const response: { data: unknown; error: { message: string } | null } = await supabase.rpc(fn, args);
    if (response.error !== null) throw new ServerError(response.error.message);
    return response.data;
  };
}

export type { Session };
