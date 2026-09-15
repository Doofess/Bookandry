import type { CurrencyInfo } from '@/db/rates-types';
import { systemClock } from '@/lib/clock';
import { isLocalDate } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

import { RatesError, type RatesProvider, type RateTable } from './types';

/**
 * Frankfurter v2.
 *
 * The spec's `api.frankfurter.app` is CORS-DEAD in a browser: it 301-redirects
 * to api.frankfurter.dev and the redirect response carries no
 * Access-Control-Allow-Origin, so the CORS check fails on the redirect hop and
 * every rate fetch silently fails.
 *
 * v2 rather than v1: 165+ currencies including AED, SAR, EGP, JOD, RUB and UAH.
 * v1 has 29 and excludes all of them, which is regionally hostile for a
 * Hebrew-speaking audience. (ILS is in both.)
 *
 * Endpoint shapes verified live on 2026-09-15:
 *   /v2/latest              -> 404. It does not exist.
 *   /v2/rates?base=USD      -> FLAT ARRAY [{date, base, quote, rate}]
 *   /v2/rates?...&date=...  -> [] with HTTP 200 when there is no data
 */
const BASE_URL = 'https://api.frankfurter.dev/v2';

type RateRow = { date: string; base: string; quote: string; rate: number };
type CurrencyRow = { iso_code: string; name?: string; symbol?: string };

function assertArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new RatesError('malformed', 'frankfurter', false);
  return value;
}

export const frankfurterProvider: RatesProvider = {
  id: 'frankfurter',
  supportsHistorical: true,

  async listCurrencies(signal): Promise<CurrencyInfo[]> {
    const res = await fetch(`${BASE_URL}/currencies`, { signal });
    if (!res.ok) throw new RatesError('http', 'frankfurter', res.status >= 500);

    const rows = assertArray(await res.json()) as CurrencyRow[];
    return rows
      .filter((r) => typeof r.iso_code === 'string')
      .map((r) => ({
        code: r.iso_code,
        ...(r.name === undefined ? {} : { name: r.name }),
        ...(r.symbol === undefined ? {} : { symbol: r.symbol }),
      }));
  },

  async getTable(base: Currency, date: LocalDate | 'latest', signal): Promise<RateTable> {
    const params = new URLSearchParams({ base });
    if (date !== 'latest') params.set('date', date);

    const res = await fetch(`${BASE_URL}/rates?${params.toString()}`, { signal });

    if (res.status === 422) throw new RatesError('unsupported_currency', 'frankfurter', false);
    if (res.status === 429) throw new RatesError('rate_limited', 'frankfurter', true, 20 * 60_000);
    if (!res.ok) throw new RatesError('http', 'frankfurter', res.status >= 500);

    const rows = assertArray(await res.json()) as RateRow[];

    // An empty array with HTTP 200 means "no data for that date". `res.ok` is
    // useless here, so this check has to come before anything else.
    if (rows.length === 0) throw new RatesError('no_data_for_date', 'frankfurter', false);

    const rates: Record<Currency, number> = {};
    const rateDates: Record<Currency, LocalDate> = {};

    for (const row of rows) {
      if (typeof row.quote !== 'string' || typeof row.rate !== 'number' || !isLocalDate(row.date)) {
        continue;
      }
      rates[row.quote] = row.rate;
      rateDates[row.quote] = row.date;
    }

    if (Object.keys(rates).length === 0) throw new RatesError('malformed', 'frankfurter', false);

    return {
      base,
      requestedDate: date,
      rates,
      rateDates,
      fetchedAt: systemClock.nowIso(),
      source: 'frankfurter',
    };
  },
};
