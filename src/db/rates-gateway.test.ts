import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { RatesError, type RateTable } from '@/services/rates/types';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Currency, LocalDate } from '@/types/money';

import { quoteRate, type QuoteDeps } from './rates-gateway';
import { getRatesMeta, putRateTable } from './repos/rates';

const TODAY = d('2026-09-15');
const NOW_MS = Date.UTC(2026, 8, 15, 10);
const HOUR = 60 * 60 * 1000;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

function table(over: Partial<RateTable> = {}): RateTable {
  return {
    source: 'frankfurter',
    base: 'ILS',
    requestedDate: 'latest',
    rates: { EUR: 0.25, USD: 0.27 },
    rateDates: { EUR: d('2026-09-15'), USD: d('2026-09-15') },
    fetchedAt: '2026-09-15T09:00:00.000Z',
    ...over,
  };
}

/** A chain that records what it was asked for and answers with a fixed table. */
function chain(result: RateTable | Error = table()) {
  const calls: { base: Currency; date: LocalDate | 'latest' }[] = [];
  const fetchTable = vi.fn(async (base: Currency, date: LocalDate | 'latest') => {
    calls.push({ base, date });
    if (result instanceof Error) throw result;
    return Promise.resolve(result);
  });
  return { calls, fetchTable: fetchTable as unknown as QuoteDeps['fetchTable'] };
}

const deps = (over: Partial<QuoteDeps> = {}): QuoteDeps => ({
  nowMs: NOW_MS,
  today: TODAY,
  // Pinned, so the backoff assertions below are exact rather than +/-20%.
  random: () => 0.5,
  ...over,
});

describe('quoteRate', () => {
  it('fetches when the cache is empty, and stores what it fetched', async () => {
    const net = chain();

    const quote = await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    expect(quote).toMatchObject({ rate: '4', rateSource: 'frankfurter', origin: 'network' });
    // Stored, or every keystroke that reopens the sheet hits the network again.
    await expect(handle.db.ratesTables.count()).resolves.toBe(1);
  });

  it('serves a fresh cache without touching the network', async () => {
    await putRateTable(handle.db, table(), NOW_MS);
    const net = chain();

    const quote = await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    expect(quote).toMatchObject({ origin: 'cache' });
    expect(net.calls).toHaveLength(0);
  });

  it('asks for `latest`, never for today', async () => {
    /*
     * The ECB publishes around 16:00 CET, so a historical request for today
     * returns an empty array for most of the working day - and Frankfurter
     * returns that with HTTP 200, which a naive caller reads as success.
     */
    const net = chain();
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    expect(net.calls[0]).toEqual({ base: 'ILS', date: 'latest' });
  });

  it('asks for the date itself when it is in the past', async () => {
    const net = chain({
      ...table({ requestedDate: d('2026-03-01'), rateDates: { EUR: d('2026-03-01') } }),
    });

    await quoteRate(handle.db, 'EUR', 'ILS', d('2026-03-01'), deps({ fetchTable: net.fetchTable }));

    expect(net.calls[0]).toEqual({ base: 'ILS', date: '2026-03-01' });
  });

  it('refetches a latest table older than its 12-hour window', async () => {
    await putRateTable(handle.db, table(), NOW_MS - 13 * HOUR);
    const net = chain();

    const quote = await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    expect(quote).toMatchObject({ origin: 'network' });
  });

  it('never refetches a historical table: those are immutable', async () => {
    await putRateTable(
      handle.db,
      table({ requestedDate: d('2026-03-01'), rateDates: { EUR: d('2026-03-01') } }),
      NOW_MS - 365 * 24 * HOUR,
    );
    const net = chain();

    const quote = await quoteRate(
      handle.db,
      'EUR',
      'ILS',
      d('2026-03-01'),
      deps({ fetchTable: net.fetchTable }),
    );

    expect(quote).toMatchObject({ origin: 'cache', rateDate: '2026-03-01' });
    expect(net.calls).toHaveLength(0);
  });

  it('is undefined for an identity pair', async () => {
    // `convertMinor` short-circuits from === to without consulting a rate, so
    // a fabricated quote of 1 here would put a made-up rateSource into the
    // audit trail of every single-currency row in the database.
    await expect(quoteRate(handle.db, 'ILS', 'ILS', TODAY, deps())).resolves.toBeUndefined();
  });
});

describe('when the network fails', () => {
  const offline = () => chain(new RatesError('offline', 'frankfurter', true));

  it('falls back to a stale cached rate rather than nothing', async () => {
    await putRateTable(handle.db, table(), NOW_MS - 30 * 24 * HOUR);
    const net = offline();

    const quote = await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    // Labelled, with its own date, so the field can say how old it is.
    expect(quote).toMatchObject({ origin: 'stale', rateDate: '2026-09-15' });
  });

  it('returns undefined rather than inventing a rate', async () => {
    // There is no rateUsed = 1 path. An unreachable network with an empty
    // cache means the form asks the user, which is the entire rates design.
    const net = offline();

    await expect(
      quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable })),
    ).resolves.toBeUndefined();
  });

  it('does not throw into the caller', async () => {
    const net = chain(new TypeError('Failed to fetch'));

    await expect(
      quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable })),
    ).resolves.toBeUndefined();
  });

  it('does NOT arm the gate when the caller cancelled', async () => {
    /*
     * The rate field aborts its lookup on every dependency change - a currency
     * switch, a date edit, closing the sheet - and each of those would
     * otherwise count as a provider failure. Three edits and rate lookups are
     * locked out for fifteen minutes with a perfectly good network, which the
     * user experiences as the app quietly forgetting how to fetch rates.
     */
    const net = chain(new RatesError('cancelled', 'frankfurter', false));

    await expect(
      quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable })),
    ).resolves.toBeUndefined();

    const meta = await getRatesMeta(handle.db);

    expect(meta.consecutiveFailures).toBe(0);
    expect(meta.nextAttemptAt).toBeUndefined();
  });

  it('arms the backoff gate', async () => {
    const net = offline();
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    const meta = await getRatesMeta(handle.db);

    expect(meta.consecutiveFailures).toBe(1);
    // First step is one minute, and `random: () => 0.5` makes the jitter 1.0x.
    expect(meta.nextAttemptAt).toBe('2026-09-15T10:01:00.000Z');
  });

  it('does not knock again while the gate is closed', async () => {
    const net = offline();
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));
    await quoteRate(
      handle.db,
      'EUR',
      'ILS',
      TODAY,
      deps({ fetchTable: net.fetchTable, nowMs: NOW_MS + 30_000 }),
    );

    /*
     * Without this gate an offline PWA retries on every keystroke that changes
     * the currency, each attempt costing a six-second timeout - so the form
     * appears to hang while doing nothing useful.
     */
    expect(net.fetchTable).toHaveBeenCalledTimes(1);
  });

  it('tries again once the gate has passed', async () => {
    const net = offline();
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));
    await quoteRate(
      handle.db,
      'EUR',
      'ILS',
      TODAY,
      deps({ fetchTable: net.fetchTable, nowMs: NOW_MS + 2 * 60_000 }),
    );

    expect(net.fetchTable).toHaveBeenCalledTimes(2);
  });

  it('locks out only the provider that returned 429', async () => {
    const net = chain(new RatesError('rate_limited', 'frankfurter', true, 3 * HOUR));
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    const meta = await getRatesMeta(handle.db);

    // Backing off the whole chain would punish the second provider for the
    // first one's quota - precisely what a fallback exists to handle.
    expect(meta.lockouts).toEqual({ frankfurter: '2026-09-15T13:00:00.000Z' });
  });

  it('passes the lockout set down to the chain', async () => {
    const limited = chain(new RatesError('rate_limited', 'frankfurter', true, 3 * HOUR));
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: limited.fetchTable }));

    const net = chain();
    await quoteRate(
      handle.db,
      'EUR',
      'ILS',
      TODAY,
      deps({ fetchTable: net.fetchTable, nowMs: NOW_MS + 2 * 60_000 }),
    );

    expect(net.fetchTable).toHaveBeenCalledWith(
      'ILS',
      'latest',
      expect.objectContaining({ lockedOut: new Set(['frankfurter']) }),
    );
  });

  it('clears the gate on the next success', async () => {
    const net = offline();
    await quoteRate(handle.db, 'EUR', 'ILS', TODAY, deps({ fetchTable: net.fetchTable }));

    const ok = chain();
    await quoteRate(
      handle.db,
      'EUR',
      'ILS',
      TODAY,
      deps({ fetchTable: ok.fetchTable, nowMs: NOW_MS + 2 * 60_000 }),
    );

    const meta = await getRatesMeta(handle.db);

    // Leaving a stale gate behind would silently suppress the NEXT fetch even
    // though this one just succeeded.
    expect(meta.nextAttemptAt).toBeUndefined();
    expect(meta.consecutiveFailures).toBe(0);
  });
});
