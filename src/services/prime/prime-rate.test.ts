import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchBoiRate } from './prime-rate';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function answer(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

describe('the Bank of Israel rate, through the relay', () => {
  it('asks the relay, with no session and no key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    answer(200, { boiRate: '3.25', nextDecision: '2026-10-21', source: 'boi-api' });
    await expect(fetchBoiRate()).resolves.toEqual({ boiRate: '3.25', nextDecision: '2026-10-21' });
    expect(fetch).toHaveBeenCalledWith('https://project.supabase.co/functions/v1/prime-rate', {
      signal: undefined,
    });
  });

  it('fails rather than guess', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    answer(503, { error: 'unavailable' });
    await expect(fetchBoiRate()).rejects.toThrow('503');
    answer(200, { boiRate: 'lots' });
    await expect(fetchBoiRate()).rejects.toThrow('something else');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    await expect(fetchBoiRate()).rejects.toThrow('No relay');
  });
});
