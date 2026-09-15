import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertLocalDate } from '@/lib/dates';

import { erapiProvider } from './erapi';
import { frankfurterProvider } from './frankfurter';
import { backoffDelayMs, fetchRateTable } from './provider-chain';
import { RatesError } from './types';

const d = assertLocalDate;

/** Recorded from the real API on 2026-09-15, including the mixed dates. */
const FRANKFURTER_ROWS = [
  { date: '2026-09-15', base: 'USD', quote: 'AED', rate: 3.6725 },
  { date: '2026-09-15', base: 'USD', quote: 'EUR', rate: 0.86406 },
  { date: '2026-09-15', base: 'USD', quote: 'ILS', rate: 3.0491 },
  // ANG really is stamped four days earlier in the same payload.
  { date: '2026-09-11', base: 'USD', quote: 'ANG', rate: 1.79 },
];

function mockFetch(handler: (url: string) => { status?: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const { status = 200, body } = handler(input);
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('frankfurter provider', () => {
  it('parses the flat array shape the API actually returns', () => {
    mockFetch(() => ({ body: FRANKFURTER_ROWS }));
    return frankfurterProvider.getTable('USD', 'latest', new AbortController().signal).then((table) => {
      expect(table.base).toBe('USD');
      expect(table.rates['ILS']).toBe(3.0491);
      expect(table.source).toBe('frankfurter');
    });
  });

  it('keeps PER-QUOTE dates rather than flattening to one', async () => {
    // A single `date` field would mis-stamp every snapshot built from a quote
    // that lags, which is most of the long tail.
    mockFetch(() => ({ body: FRANKFURTER_ROWS }));
    const table = await frankfurterProvider.getTable('USD', 'latest', new AbortController().signal);
    expect(table.rateDates['ILS']).toBe('2026-09-15');
    expect(table.rateDates['ANG']).toBe('2026-09-11');
  });

  it('uses /v2/rates, never /v2/latest, which does not exist', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        calls.push(input);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(FRANKFURTER_ROWS) });
      }),
    );
    await frankfurterProvider.getTable('USD', 'latest', new AbortController().signal);
    expect(calls[0]).toContain('/v2/rates?');
    expect(calls[0]).not.toContain('/v2/latest');
    // The .app host 301s without CORS headers, so it must never be used.
    expect(calls[0]).toContain('api.frankfurter.dev');
  });

  it('passes a historical date as a query parameter', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        calls.push(input);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(FRANKFURTER_ROWS) });
      }),
    );
    await frankfurterProvider.getTable('USD', d('2026-03-12'), new AbortController().signal);
    expect(calls[0]).toContain('date=2026-03-12');
  });

  it('treats an EMPTY ARRAY WITH HTTP 200 as no-data-for-date', async () => {
    // res.ok is useless here: the API answers 200 with [] for a date it has no
    // data for, so a naive implementation would report an empty rate table.
    mockFetch(() => ({ status: 200, body: [] }));
    await expect(
      frankfurterProvider.getTable('USD', d('1970-01-05'), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'no_data_for_date' });
  });

  it('maps 422 to unsupported_currency and 429 to rate_limited', async () => {
    mockFetch(() => ({ status: 422, body: { message: 'invalid currency' } }));
    await expect(
      frankfurterProvider.getTable('ZZZ', 'latest', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unsupported_currency', retryable: false });

    mockFetch(() => ({ status: 429, body: {} }));
    await expect(
      frankfurterProvider.getTable('USD', 'latest', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('rejects a non-array payload', async () => {
    mockFetch(() => ({ body: { base: 'USD', rates: { ILS: 3.05 } } }));
    await expect(
      frankfurterProvider.getTable('USD', 'latest', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'malformed' });
  });

  it('lists currencies from the catalog', async () => {
    mockFetch(() => ({
      body: [
        { iso_code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
        { iso_code: 'USD', name: 'US Dollar', symbol: '$' },
      ],
    }));
    const list = await frankfurterProvider.listCurrencies(new AbortController().signal);
    expect(list.map((c) => c.code)).toEqual(['ILS', 'USD']);
    expect(list[0]?.symbol).toBe('₪');
  });
});

describe('er-api provider', () => {
  const SUCCESS = {
    result: 'success',
    base_code: 'USD',
    time_last_update_utc: 'Tue, 15 Sep 2026 00:02:31 +0000',
    rates: { USD: 1, ILS: 3.046651, EUR: 0.864 },
  };

  it('parses a successful response', async () => {
    mockFetch(() => ({ body: SUCCESS }));
    const table = await erapiProvider.getTable('USD', 'latest', new AbortController().signal);
    expect(table.rates['ILS']).toBe(3.046651);
    expect(table.rateDates['ILS']).toBe('2026-09-15');
    expect(table.source).toBe('erapi');
  });

  it('detects an ERROR DELIVERED WITH HTTP 200', async () => {
    // This is the whole reason the fallback is written the way it is. With
    // `if (!res.ok) throw`, this response passes, data.rates is undefined, and
    // the next line throws a TypeError - so the fallback crashes exactly when
    // it is needed.
    mockFetch(() => ({ status: 200, body: { result: 'error', 'error-type': 'unsupported-code' } }));
    await expect(erapiProvider.getTable('XYZ', 'latest', new AbortController().signal)).rejects.toMatchObject(
      { code: 'unsupported_currency' },
    );
  });

  it('treats an unknown error-type as malformed', async () => {
    mockFetch(() => ({ status: 200, body: { result: 'error', 'error-type': 'quota-reached' } }));
    await expect(erapiProvider.getTable('USD', 'latest', new AbortController().signal)).rejects.toMatchObject(
      { code: 'malformed' },
    );
  });

  it('REFUSES a historical request rather than substituting today', async () => {
    // Silently returning today's rate for a March date would make the ledger
    // non-reproducible, and nothing would ever surface the substitution.
    mockFetch(() => ({ body: SUCCESS }));
    await expect(
      erapiProvider.getTable('USD', d('2026-03-12'), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'no_data_for_date' });
  });

  it('declares the attribution its terms require', () => {
    expect(erapiProvider.attribution?.href).toContain('exchangerate-api.com');
  });

  it('rejects a payload with no rates object', async () => {
    mockFetch(() => ({ body: { result: 'success' } }));
    await expect(erapiProvider.getTable('USD', 'latest', new AbortController().signal)).rejects.toMatchObject(
      { code: 'malformed' },
    );
  });

  it('tolerates an unparseable update timestamp', async () => {
    mockFetch(() => ({ body: { ...SUCCESS, time_last_update_utc: 'not a date' } }));
    const table = await erapiProvider.getTable('USD', 'latest', new AbortController().signal);
    expect(table.rates['ILS']).toBe(3.046651);
    expect(table.rateDates['ILS']).toBeUndefined();
  });
});

describe('provider chain', () => {
  it('falls back to er-api when frankfurter fails', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        if (call === 1) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ result: 'success', rates: { ILS: 3.046651 }, time_last_update_utc: '' }),
        });
      }),
    );

    const table = await fetchRateTable('USD', 'latest');
    expect(table.source).toBe('erapi');
  });

  it('never uses er-api for a HISTORICAL date, even when frankfurter fails', async () => {
    // Skipping it is the point: a wrong-date rate is worse than no rate.
    mockFetch(() => ({ status: 500, body: {} }));
    await expect(fetchRateTable('USD', d('2026-03-12'))).rejects.toBeInstanceOf(RatesError);

    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.every((c) => !String(c[0]).includes('er-api'))).toBe(true);
  });

  it('throws when every provider fails', async () => {
    mockFetch(() => ({ status: 500, body: {} }));
    await expect(fetchRateTable('USD', 'latest')).rejects.toBeInstanceOf(RatesError);
  });

  it('skips a provider that is locked out after a 429', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        calls.push(input);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ result: 'success', rates: { ILS: 3.046651 }, time_last_update_utc: '' }),
        });
      }),
    );

    const table = await fetchRateTable('USD', 'latest', { lockedOut: new Set(['frankfurter']) });

    expect(table.source).toBe('erapi');
    // The locked-out provider must not be contacted at all: a 429 lockout that
    // still issues the request is not a lockout.
    expect(calls.every((c) => !c.includes('frankfurter'))).toBe(true);
  });

  it('prefers frankfurter when both are available', async () => {
    mockFetch(() => ({ body: FRANKFURTER_ROWS }));
    const table = await fetchRateTable('USD', 'latest');
    expect(table.source).toBe('frankfurter');
  });
});

describe('backoff', () => {
  it('grows with consecutive failures and is capped', () => {
    const noJitter = () => 0.5;
    expect(backoffDelayMs(1, noJitter)).toBe(60_000);
    expect(backoffDelayMs(2, noJitter)).toBe(300_000);
    expect(backoffDelayMs(3, noJitter)).toBe(900_000);
    expect(backoffDelayMs(99, noJitter)).toBe(43_200_000);
  });

  it('applies bounded jitter so retries do not synchronise', () => {
    expect(backoffDelayMs(1, () => 0)).toBe(48_000);
    expect(backoffDelayMs(1, () => 1)).toBe(72_000);
  });

  it('treats zero failures as the first step', () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(60_000);
  });
});
