import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertLocalDate } from '@/lib/dates';
import type { RateTable } from '@/services/rates/types';
import { freshDb, type TestDb } from '@/test/db-harness';

import {
  activeLockouts,
  deriveRate,
  findAnyTableForBase,
  getRatesMeta,
  getRateTable,
  isValidRateRow,
  LATEST_TTL_MS,
  putRatesMeta,
  putRateTable,
  rateTableKey,
  toRateTableRow,
} from './rates';

const d = assertLocalDate;
const NOW_MS = Date.parse('2026-09-15T10:00:00.000Z');
const NOW = '2026-09-15T10:00:00.000Z';

let handle: TestDb;

beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

const table = (over: Partial<RateTable> = {}): RateTable => ({
  base: 'USD',
  requestedDate: 'latest',
  rates: { ILS: 3.0491, EUR: 0.86406, ANG: 1.79 },
  // Mixed dates, exactly as the live API returns them.
  rateDates: { ILS: d('2026-09-15'), EUR: d('2026-09-15'), ANG: d('2026-09-11') },
  fetchedAt: NOW,
  source: 'frankfurter',
  ...over,
});

describe('cache keying', () => {
  it('keys by source, base AND date', () => {
    // The spec kept ONE unkeyed row, which cannot hold a second base and breaks
    // the moment defaultCurrency changes.
    expect(rateTableKey('frankfurter', 'USD', 'latest')).toBe('frankfurter|USD|latest');
    expect(rateTableKey('erapi', 'ILS', d('2026-03-12'))).toBe('erapi|ILS|2026-03-12');
  });

  it('keeps tables for different bases side by side', async () => {
    await putRateTable(handle.db, table({ base: 'USD' }), NOW_MS);
    await putRateTable(handle.db, table({ base: 'ILS' }), NOW_MS);
    expect(await handle.db.ratesTables.count()).toBe(2);
  });

  it('keeps historical alongside latest', async () => {
    await putRateTable(handle.db, table(), NOW_MS);
    await putRateTable(handle.db, table({ requestedDate: d('2026-03-12') }), NOW_MS);
    expect(await handle.db.ratesTables.count()).toBe(2);
  });
});

describe('expiry', () => {
  it('serves a latest table inside the 12h window', async () => {
    await putRateTable(handle.db, table(), NOW_MS);
    const row = await getRateTable(handle.db, 'frankfurter', 'USD', 'latest', NOW);
    expect(row?.rates['ILS']).toBe(3.0491);
  });

  it('treats an expired latest table as a miss', async () => {
    await putRateTable(handle.db, table(), NOW_MS);
    const later = new Date(NOW_MS + LATEST_TTL_MS + 1000).toISOString();
    expect(await getRateTable(handle.db, 'frankfurter', 'USD', 'latest', later)).toBeUndefined();
  });

  it('never expires a HISTORICAL table, because the past does not change', async () => {
    await putRateTable(handle.db, table({ requestedDate: d('2026-03-12') }), NOW_MS);
    const yearsLater = '2030-01-01T00:00:00.000Z';
    const row = await getRateTable(handle.db, 'frankfurter', 'USD', d('2026-03-12'), yearsLater);
    expect(row).toBeDefined();
  });
});

describe('corruption handling', () => {
  it('rejects structurally invalid rows', () => {
    expect(isValidRateRow(null)).toBe(false);
    expect(isValidRateRow({})).toBe(false);
    expect(isValidRateRow({ ...toRateTableRow(table(), NOW_MS), schema: 99 })).toBe(false);
    expect(isValidRateRow({ ...toRateTableRow(table(), NOW_MS), rates: null })).toBe(false);
    expect(isValidRateRow(toRateTableRow(table(), NOW_MS))).toBe(true);
  });

  it('DROPS a corrupt row and reports a miss rather than throwing', async () => {
    // A corrupt cache must never block a save or surface in a render (§9).
    await handle.db.ratesTables.put({ key: 'frankfurter|USD|latest', schema: 99 } as never);
    expect(await getRateTable(handle.db, 'frankfurter', 'USD', 'latest', NOW)).toBeUndefined();
    expect(await handle.db.ratesTables.get('frankfurter|USD|latest')).toBeUndefined();
  });

  it('ignores corrupt rows when scanning for a base', async () => {
    await handle.db.ratesTables.put({ key: 'bad', base: 'USD', schema: 99 } as never);
    await putRateTable(handle.db, table(), NOW_MS);
    expect((await findAnyTableForBase(handle.db, 'USD'))?.source).toBe('frankfurter');
  });

  it('returns undefined when nothing is cached for a base', async () => {
    expect(await findAnyTableForBase(handle.db, 'JPY')).toBeUndefined();
  });
});

describe('deriveRate', () => {
  const row = toRateTableRow(table(), NOW_MS);

  it('returns the direct rate when converting FROM the base', () => {
    const r = deriveRate(row, 'USD', 'ILS');
    expect(r?.rate).toBe('3.0491');
    expect(r?.derived).toBe(false);
    expect(r?.rateDate).toBe('2026-09-15');
  });

  it('derives a cross rate through the base', () => {
    const r = deriveRate(row, 'ILS', 'EUR');
    expect(r?.derived).toBe(true);
    expect(Number(r?.rate)).toBeCloseTo(0.86406 / 3.0491, 9);
  });

  it('takes the OLDER of the two legs as the effective date', () => {
    // ANG lags by four days in the same payload. Reporting the newer date would
    // overstate how current the derived rate is.
    const r = deriveRate(row, 'ANG', 'ILS');
    expect(r?.rateDate).toBe('2026-09-11');
  });

  it('is the identity for a same-currency conversion', () => {
    const r = deriveRate(row, 'ILS', 'ILS');
    expect(r?.rate).toBe('1');
    expect(r?.derived).toBe(false);
  });

  it('returns undefined for a currency the table does not cover', () => {
    expect(deriveRate(row, 'USD', 'XYZ')).toBeUndefined();
    expect(deriveRate(row, 'XYZ', 'USD')).toBeUndefined();
  });

  it('refuses a non-positive rate rather than producing nonsense', () => {
    const bad = toRateTableRow(table({ rates: { ILS: 0 } }), NOW_MS);
    expect(deriveRate(bad, 'USD', 'ILS')).toBeUndefined();
  });
});

describe('rates meta and lockouts', () => {
  it('returns a default meta row before anything is written', async () => {
    const meta = await getRatesMeta(handle.db);
    expect(meta.consecutiveFailures).toBe(0);
    expect(meta.lockouts).toEqual({});
  });

  it('round-trips meta', async () => {
    await putRatesMeta(handle.db, {
      consecutiveFailures: 3,
      lastErrorCode: 'http',
      lockouts: { erapi: '2026-09-15T11:00:00.000Z' },
    });
    const meta = await getRatesMeta(handle.db);
    expect(meta.consecutiveFailures).toBe(3);
    expect(meta.lockouts.erapi).toBe('2026-09-15T11:00:00.000Z');
  });

  it('reports only lockouts that have not elapsed', () => {
    const meta = {
      id: 'singleton' as const,
      consecutiveFailures: 0,
      lockouts: { erapi: '2026-09-15T11:00:00.000Z', frankfurter: '2026-09-15T09:00:00.000Z' },
    };
    const locked = activeLockouts(meta, NOW);
    expect(locked.has('erapi')).toBe(true);
    expect(locked.has('frankfurter')).toBe(false);
  });
});
