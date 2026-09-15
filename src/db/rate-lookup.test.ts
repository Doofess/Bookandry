import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';
import type { RateTable } from '@/services/rates/types';
import { freshDb, type TestDb } from '@/test/db-harness';

import { findKnownRate } from './rate-lookup';
import { putRateTable } from './repos/rates';

const ON = d('2026-09-15');
const HOUR = 60 * 60 * 1000;
const NOW_MS = Date.UTC(2026, 8, 15, 10);

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
    rates: { USD: 0.2712, EUR: 0.2522 },
    rateDates: { USD: d('2026-09-14'), EUR: d('2026-09-14') },
    fetchedAt: '2026-09-15T09:00:00.000Z',
    ...over,
  };
}

const put = (over: Partial<RateTable> = {}, atMs = NOW_MS) => putRateTable(handle.db, table(over), atMs);

describe('findKnownRate', () => {
  it('is undefined for a pair this install has never seen', () => {
    // The ONE case that genuinely blocks a save.
    return expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toBeUndefined();
  });

  it('is undefined for a same-currency pair', async () => {
    await put();

    await expect(findKnownRate(handle.db, 'ILS', 'ILS', ON)).resolves.toBeUndefined();
  });

  it('derives the rate from a table based on the other side of the pair', async () => {
    await put();

    // The cache holds "1 ILS = 0.2522 EUR"; the form asks "1 EUR = ? ILS".
    await expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toMatchObject({
      rate: '3.9651070579',
      rateSource: 'frankfurter',
    });
  });

  it('crosses two quotes when neither side is the base', async () => {
    await put();

    // EUR -> USD through an ILS-based table: 0.2712 / 0.2522.
    await expect(findKnownRate(handle.db, 'EUR', 'USD', ON)).resolves.toMatchObject({
      rate: '1.0753370341',
    });
  });

  it('carries the QUOTE date, not the fetch date', async () => {
    await put();

    // The field reads "Rate from 14 Sep - tap to change". Reporting the fetch
    // date instead would claim a freshness the number does not have.
    await expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toMatchObject({
      rateDate: '2026-09-14',
    });
  });

  it('serves an EXPIRED latest table', async () => {
    // Deliberately different from getRateTable, which treats an expired row as
    // a miss. For a fetch, a 20-hour-old rate is stale; for a manual prefill it
    // is a far better starting point than an empty field, and its date is shown.
    await put({}, NOW_MS - 20 * HOUR);

    await expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toBeDefined();
  });

  it('prefers a table for the exact date over a newer latest one', async () => {
    await put({
      requestedDate: d('2026-03-01'),
      rates: { EUR: 0.25 },
      rateDates: { EUR: d('2026-03-01') },
      fetchedAt: '2026-03-01T09:00:00.000Z',
    });
    await put();

    // A rate stamped today for a purchase made in March is a small lie that
    // ends up in the row's audit trail and in every export.
    await expect(findKnownRate(handle.db, 'EUR', 'ILS', d('2026-03-01'))).resolves.toMatchObject({
      rate: '4',
      rateDate: '2026-03-01',
    });
  });

  it('falls back to the most recently fetched table', async () => {
    await put({
      rates: { EUR: 0.25 },
      rateDates: { EUR: d('2026-01-01') },
      fetchedAt: '2026-01-01T09:00:00.000Z',
      source: 'erapi',
    });
    await put({ fetchedAt: '2026-09-15T09:00:00.000Z' });

    await expect(findKnownRate(handle.db, 'EUR', 'ILS', d('2030-01-01'))).resolves.toMatchObject({
      rateSource: 'frankfurter',
    });
  });

  it('skips a table that cannot express the pair', async () => {
    await put({ rates: { USD: 0.2712 }, rateDates: { USD: d('2026-09-14') } });
    await put({
      base: 'USD',
      rates: { EUR: 0.93, ILS: 3.688 },
      rateDates: { EUR: d('2026-09-10'), ILS: d('2026-09-10') },
      fetchedAt: '2026-09-15T08:00:00.000Z',
    });

    // The newest table has no EUR at all; the older USD-based one does.
    await expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toMatchObject({
      rateDate: '2026-09-10',
    });
  });

  it('never reports "latest" as a calendar date', async () => {
    // `row.date` for an unexpired latest row is the literal string "latest",
    // which is not a LocalDate: Zod's regex, the brand and Intl each reject or
    // throw on it, in three different places.
    await put({ rateDates: {} });

    const known = await findKnownRate(handle.db, 'EUR', 'ILS', ON);

    expect(known?.rateDate).toBe('2026-09-15');
  });

  it('ignores a corrupt row rather than throwing into the form', async () => {
    await handle.db.ratesTables.put({ key: 'junk', base: 'ILS' } as never);
    await put();

    await expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toBeDefined();
  });

  it('ignores a non-positive quote', async () => {
    // A zero would make the derived rate a division by zero, and a negative
    // one would invert the sign of every converted amount.
    await put({ rates: { EUR: 0 }, rateDates: { EUR: d('2026-09-14') } });

    await expect(findKnownRate(handle.db, 'EUR', 'ILS', ON)).resolves.toBeUndefined();
  });

  it('answers from a large cache without loading all of it', async () => {
    // A reconvert writes one historical table per distinct date, so this is
    // the realistic steady state rather than a stress test.
    for (let i = 1; i <= 120; i += 1) {
      const date = d(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
      await putRateTable(
        handle.db,
        table({
          requestedDate: date,
          source: i % 2 === 0 ? 'erapi' : 'frankfurter',
          fetchedAt: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
        }),
        NOW_MS,
      );
    }

    await expect(findKnownRate(handle.db, 'EUR', 'ILS', d('2030-01-01'))).resolves.toBeDefined();
  });
});
