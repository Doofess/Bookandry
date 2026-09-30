import { describe, expect, it, vi } from 'vitest';

import worker, { appleReturn } from './worker';

function post(fields: Record<string, string>): Request {
  return new Request('https://bookandry.com/auth/apple', {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
}

describe("Apple's answer", () => {
  it('becomes the callback fragment the app reads, with only what it reads', async () => {
    const response = await appleReturn(
      post({ id_token: 'a.b.c', state: 's1', code: 'c0de', user: '{"name":{"firstName":"Dana"}}' }),
    );
    expect(response.status).toBe(303);
    const location = response.headers.get('Location') ?? '';
    expect(location.startsWith('/auth/callback#')).toBe(true);
    const params = new URLSearchParams(location.split('#')[1]);
    expect(Object.fromEntries(params)).toEqual({ id_token: 'a.b.c', state: 's1' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('passes a cancellation on, for the app to stay quiet about', async () => {
    const response = await appleReturn(post({ error: 'user_cancelled_authorize', state: 's1' }));
    expect(response.headers.get('Location')).toBe('/auth/callback#state=s1&error=user_cancelled_authorize');
  });

  it('sends anything but a POST home', async () => {
    const response = await appleReturn(new Request('https://bookandry.com/auth/apple'));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
  });
});

describe('the worker', () => {
  it('leaves every other path to the static files', async () => {
    const assets = { fetch: vi.fn(() => Promise.resolve(new Response('index'))) };
    const response = await worker.fetch(new Request('https://bookandry.com/settings'), { ASSETS: assets });
    expect(await response.text()).toBe('index');
    expect(assets.fetch).toHaveBeenCalledOnce();
  });

  it('handles /auth/apple itself', async () => {
    const assets = { fetch: vi.fn(() => Promise.resolve(new Response('index'))) };
    const response = await worker.fetch(post({ id_token: 't', state: 's' }), { ASSETS: assets });
    expect(response.status).toBe(303);
    expect(assets.fetch).not.toHaveBeenCalled();
  });
});
