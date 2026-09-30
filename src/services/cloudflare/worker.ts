// Relative, and to a file with no imports of its own: the Worker is bundled
// by wrangler, which knows nothing of the app's '@/' alias.
import { APPLE_RETURN_PATH, CALLBACK_PATH } from '../supabase/auth-paths';

/**
 * The only code bookandry.com runs on the server - and it runs for one path.
 *
 * Everything else is static files (wrangler.jsonc: `run_worker_first` lists
 * only /auth/apple). Sign in with Apple, asked for the person's email, will
 * only POST its answer back, and static files cannot take a POST. This turns
 * that POST into the same address Google returns to - /auth/callback, with
 * the answer in the fragment - where the app checks it (id-token.ts).
 *
 * Nothing is kept, checked or logged here. The token is useless without the
 * nonce the browser that started the sign-in holds, and the app refuses an
 * answer to a sign-in it did not start (`state`); forwarding a forged POST
 * gets its sender nowhere.
 */
type Env = { readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> } };

/** Only what the app reads. Apple's `code` and `user` are not needed and not passed on. */
const FORWARDED = ['id_token', 'state', 'error'] as const;

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export async function appleReturn(request: Request): Promise<Response> {
  if (request.method !== 'POST') return seeOther('/');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return seeOther(`${CALLBACK_PATH}#error=invalid_request`);
  }
  const out = new URLSearchParams();
  for (const name of FORWARDED) {
    const value = form.get(name);
    if (typeof value === 'string') out.set(name, value);
  }
  return seeOther(`${CALLBACK_PATH}#${out.toString()}`);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === APPLE_RETURN_PATH) return appleReturn(request);
    return env.ASSETS.fetch(request);
  },
};
