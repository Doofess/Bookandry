import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { sendWipeRequests } from './send-wipe';

const client = (invoke: ReturnType<typeof vi.fn>) => ({ functions: { invoke } }) as never;
const httpError = (error: string, status: number) =>
  new FunctionsHttpError(new Response(JSON.stringify({ error }), { status }));

describe('sending the confirmation emails', () => {
  it('says how many were asked, and what was sent', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true, asked: 2 }, error: null });
    expect(await sendWipeRequests(client(invoke), 'he')).toEqual({ ok: true, asked: 2 });
    expect(invoke).toHaveBeenCalledWith('send-wipe-requests', {
      body: { language: 'he' },
    });
  });

  it('passes the known refusals through', async () => {
    for (const code of ['not_linked', 'wipe_pending', 'too_many_wipe_requests'] as const) {
      const invoke = vi.fn().mockResolvedValue({ data: null, error: httpError(code, 400) });
      expect(await sendWipeRequests(client(invoke), 'en')).toEqual({ ok: false, error: code });
    }
  });

  it('calls any other answer a failed send', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: httpError('weird', 502) });
    expect(await sendWipeRequests(client(invoke), 'en')).toEqual({
      ok: false,
      error: 'email_failed',
    });
    const empty = vi.fn().mockResolvedValue({ data: {}, error: null });
    expect(await sendWipeRequests(client(empty), 'en')).toEqual({ ok: false, error: 'email_failed' });
  });

  it('calls a network failure offline', async () => {
    expect(await sendWipeRequests(client(vi.fn().mockRejectedValue(new TypeError('net'))), 'en')).toEqual({
      ok: false,
      error: 'offline',
    });
    const fetchFailed = vi
      .fn()
      .mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError('net')) });
    expect(await sendWipeRequests(client(fetchFailed), 'en')).toEqual({
      ok: false,
      error: 'offline',
    });
  });
});
