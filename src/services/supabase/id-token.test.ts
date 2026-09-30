import { describe, expect, it } from 'vitest';

import { sha256Hex } from '@/services/crypto/bytes';

import { beginIdSignIn, PENDING_KEY, readArrival } from './id-token';

const ORIGIN = 'https://bookandry.com';
const NOW = 1_800_000_000_000;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function stored(storage: Storage): { state: string; nonce: string } {
  return JSON.parse(storage.getItem(PENDING_KEY) ?? '{}') as { state: string; nonce: string };
}

/** Start a sign-in, then come back to the callback with what the provider would send. */
async function roundTrip(
  provider: 'google' | 'apple',
  answer: (pending: { state: string }) => Record<string, string>,
  { returnAt = NOW, path = '/auth/callback' } = {},
) {
  const storage = memoryStorage();
  await beginIdSignIn(provider, 'client-1', { origin: ORIGIN, nowMs: NOW, storage });
  const pending = stored(storage);
  const replaced: string[] = [];
  const arrival = readArrival({
    location: { pathname: path, hash: `#${new URLSearchParams(answer(pending)).toString()}` },
    storage,
    nowMs: returnAt,
    replaceUrl: (url) => replaced.push(url),
  });
  return { arrival, pending, storage, replaced };
}

describe('starting a sign-in', () => {
  it("sends Google back to this site, never to Supabase's address", async () => {
    const storage = memoryStorage();
    const url = new URL(await beginIdSignIn('google', 'client-1', { origin: ORIGIN, nowMs: NOW, storage }));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://bookandry.com/auth/callback');
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.href).not.toContain('supabase');
  });

  it('sends Apple back to the Worker, which takes its POST', async () => {
    const storage = memoryStorage();
    const url = new URL(
      await beginIdSignIn('apple', 'com.bookandry.web', { origin: ORIGIN, nowMs: NOW, storage }),
    );
    expect(url.origin).toBe('https://appleid.apple.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://bookandry.com/auth/apple');
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('scope')).toBe('name email');
  });

  it('gives the provider only the hash of the nonce; the nonce itself stays here', async () => {
    const storage = memoryStorage();
    const url = new URL(await beginIdSignIn('google', 'client-1', { origin: ORIGIN, nowMs: NOW, storage }));
    const { nonce, state } = stored(storage);
    expect(url.searchParams.get('nonce')).toBe(await sha256Hex(nonce));
    expect(url.href).not.toContain(nonce);
    expect(url.searchParams.get('state')).toBe(state);
  });

  it('is new every time', async () => {
    const storage = memoryStorage();
    await beginIdSignIn('google', 'c', { origin: ORIGIN, nowMs: NOW, storage });
    const first = stored(storage);
    await beginIdSignIn('google', 'c', { origin: ORIGIN, nowMs: NOW, storage });
    expect(stored(storage).nonce).not.toBe(first.nonce);
    expect(stored(storage).state).not.toBe(first.state);
  });
});

describe('coming back', () => {
  it('hands over the token with the nonce, and wipes both from the address and storage', async () => {
    const { arrival, pending, storage, replaced } = await roundTrip('google', (p) => ({
      id_token: 'tok',
      state: p.state,
    }));
    expect(arrival).toEqual({ ok: true, provider: 'google', token: 'tok', nonce: pending.nonce });
    expect(replaced).toEqual(['/']);
    expect(storage.getItem(PENDING_KEY)).toBeNull();
  });

  it('remembers which provider it was', async () => {
    const { arrival } = await roundTrip('apple', (p) => ({ id_token: 'tok', state: p.state }));
    expect(arrival).toMatchObject({ ok: true, provider: 'apple' });
  });

  it('refuses an answer to a sign-in this browser did not start', async () => {
    const { arrival } = await roundTrip('google', () => ({ id_token: 'tok', state: 'someone-elses' }));
    expect(arrival).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses an answer that arrives with nothing started at all', () => {
    const arrival = readArrival({
      location: { pathname: '/auth/callback', hash: '#id_token=tok&state=s' },
      storage: memoryStorage(),
      nowMs: NOW,
      replaceUrl: () => undefined,
    });
    expect(arrival).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses a trip that took too long', async () => {
    const { arrival } = await roundTrip('google', (p) => ({ id_token: 'tok', state: p.state }), {
      returnAt: NOW + 16 * 60_000,
    });
    expect(arrival).toEqual({ ok: false, reason: 'unknown' });
  });

  it('treats closing the provider page as a cancellation, not an error', async () => {
    const google = await roundTrip('google', (p) => ({ error: 'access_denied', state: p.state }));
    expect(google.arrival).toEqual({ ok: false, reason: 'cancelled' });
    const apple = await roundTrip('apple', (p) => ({ error: 'user_cancelled_authorize', state: p.state }));
    expect(apple.arrival).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('reports any other provider error', async () => {
    const { arrival } = await roundTrip('google', (p) => ({ error: 'server_error', state: p.state }));
    expect(arrival).toEqual({ ok: false, reason: 'unknown' });
  });

  it('ignores every other address, leaving it and the pending sign-in alone', async () => {
    const { arrival, storage, replaced } = await roundTrip(
      'google',
      (p) => ({ id_token: 't', state: p.state }),
      {
        path: '/settings',
      },
    );
    expect(arrival).toBeUndefined();
    expect(replaced).toEqual([]);
    expect(storage.getItem(PENDING_KEY)).not.toBeNull();
  });
});
