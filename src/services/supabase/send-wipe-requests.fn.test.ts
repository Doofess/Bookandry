import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The mailer edge function (supabase/functions/send-wipe-requests), run here
 * with its Deno imports and environment stood in for. What matters: when an
 * email cannot go out, the request is removed if nobody was mailed yet (so
 * "Try again" is not refused by the hourly limit), and only cancelled once
 * someone has been.
 */

type Call = { readonly client: 'user' | 'admin'; readonly fn: string; readonly args?: unknown };

const state = vi.hoisted(
  (): {
    calls: { client: 'user' | 'admin'; fn: string; args?: unknown }[];
    emails: Record<string, string>;
  } => ({
    calls: [],
    emails: {},
  }),
);

vi.mock('npm:@supabase/server', () => ({
  createSupabaseContext: () => Promise.resolve({ data: { userClaims: { sub: 'u-alice' } }, error: null }),
}));

vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: (_url: string, key: string) => {
    const client = key === 'service-key' ? 'admin' : 'user';
    return {
      rpc: (fn: string, args?: unknown) => {
        state.calls.push({ client, fn, args });
        if (fn === 'request_wipe') {
          return Promise.resolve({
            data: {
              id: 'w1',
              requesterName: 'Alice',
              asks: [
                { userId: 'u-bob', token: 'b'.repeat(64) },
                { userId: 'u-carol', token: 'c'.repeat(64) },
              ],
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      auth: {
        admin: {
          getUserById: (id: string) =>
            Promise.resolve(
              state.emails[id] === undefined
                ? { data: { user: null }, error: { message: 'not found' } }
                : { data: { user: { email: state.emails[id] } }, error: null },
            ),
        },
      },
    };
  },
}));

const ENV: Record<string, string> = {
  RESEND_API_KEY: 'resend-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
};

const PATH = '../../../supabase/functions/send-wipe-requests/index.ts';
const load = async (): Promise<{ fetch: (req: Request) => Promise<Response> }> =>
  ((await import(/* @vite-ignore */ PATH)) as { default: { fetch: (req: Request) => Promise<Response> } })
    .default;

const request = (): Request =>
  new Request('https://fn.example/send-wipe-requests', {
    method: 'POST',
    headers: { origin: 'https://bookandry.com', authorization: 'Bearer user-jwt' },
    body: JSON.stringify({ language: 'en' }),
  });

let mailed: string[];
const resend = (outcomes: boolean[]): void => {
  mailed = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { body: string }) => {
      const ok = outcomes[mailed.length] ?? true;
      mailed.push((JSON.parse(init.body) as { to: string[] }).to[0] ?? '');
      return Promise.resolve(new Response('{}', { status: ok ? 200 : 500 }));
    }),
  );
};

const after = (): Call[] => state.calls.filter((c) => c.fn !== 'request_wipe');

beforeEach(() => {
  state.calls = [];
  state.emails = { 'u-bob': 'bob@example.com', 'u-carol': 'carol@example.com' };
  vi.stubGlobal('Deno', { env: { get: (name: string) => ENV[name] } });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('send-wipe-requests', () => {
  it('mails every other member and keeps the request', async () => {
    resend([true, true]);
    const response = await (await load()).fetch(request());
    expect(response.status).toBe(200);
    expect(mailed).toEqual(['bob@example.com', 'carol@example.com']);
    expect(after()).toEqual([]);
  });

  it('removes the request, as the mailer, when an address cannot be found', async () => {
    resend([]);
    delete state.emails['u-carol'];
    const response = await (await load()).fetch(request());
    expect(response.status).toBe(502);
    expect(mailed).toEqual([]);
    expect(after()).toEqual([{ client: 'admin', fn: 'discard_wipe', args: { p_id: 'w1' } }]);
  });

  it('removes the request when the very first email fails', async () => {
    resend([false]);
    const response = await (await load()).fetch(request());
    expect(response.status).toBe(502);
    expect(after()).toEqual([{ client: 'admin', fn: 'discard_wipe', args: { p_id: 'w1' } }]);
  });

  it('only cancels it once someone was mailed, so the hourly limit still counts it', async () => {
    resend([true, false]);
    const response = await (await load()).fetch(request());
    expect(response.status).toBe(502);
    expect(after()).toEqual([{ client: 'user', fn: 'cancel_wipe', args: undefined }]);
  });
});
