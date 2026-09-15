import type { CurrencyInfo } from '@/db/rates-types';
import { systemClock } from '@/lib/clock';
import { externalTimestampToLocalDate } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

import { RatesError, type RatesProvider, type RateTable } from './types';

/**
 * open.er-api.com - the fallback.
 *
 * THE TRAP: this API returns ERRORS WITH HTTP 200.
 *
 *   GET /v6/latest/XYZ  ->  200  {"result":"error","error-type":"unsupported-code"}
 *
 * So `if (!res.ok) throw` passes, `data.rates` is undefined, and the next line
 * throws a TypeError - meaning the fallback crashes at precisely the moment it
 * is needed. Everything here branches on `data.result`, never on `res.ok` alone.
 *
 * It also has NO free historical endpoint, which is why supportsHistorical is
 * false: substituting today's rate for a past date would be silently wrong.
 */
const BASE_URL = 'https://open.er-api.com/v6';

type ErApiResponse = {
  result?: string;
  'error-type'?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
};

function parseUpdateDate(value: string | undefined): LocalDate | undefined {
  return value === undefined ? undefined : externalTimestampToLocalDate(value);
}

export const erapiProvider: RatesProvider = {
  id: 'erapi',
  supportsHistorical: false,
  attribution: { text: 'Rates By Exchange Rate API', href: 'https://www.exchangerate-api.com' },

  async listCurrencies(signal): Promise<CurrencyInfo[]> {
    const table = await erapiProvider.getTable('USD', 'latest', signal);
    return Object.keys(table.rates).map((code) => ({ code }));
  },

  async getTable(base: Currency, date: LocalDate | 'latest', signal): Promise<RateTable> {
    if (date !== 'latest') {
      // Never silently substitute. The caller must fail loudly instead.
      throw new RatesError('no_data_for_date', 'erapi', false);
    }

    const res = await fetch(`${BASE_URL}/latest/${encodeURIComponent(base)}`, { signal });
    if (res.status === 429) throw new RatesError('rate_limited', 'erapi', true, 20 * 60_000);
    if (!res.ok) throw new RatesError('http', 'erapi', res.status >= 500);

    const data = (await res.json()) as ErApiResponse;

    // Branch on `result`, NOT on res.ok.
    if (data.result !== 'success') {
      throw new RatesError(
        data['error-type'] === 'unsupported-code' ? 'unsupported_currency' : 'malformed',
        'erapi',
        false,
      );
    }

    const rates = data.rates;
    if (!rates || typeof rates !== 'object') throw new RatesError('malformed', 'erapi', false);

    const effective = parseUpdateDate(data.time_last_update_utc);
    const rateDates: Record<Currency, LocalDate> = {};
    if (effective) {
      for (const code of Object.keys(rates)) rateDates[code] = effective;
    }

    return {
      base,
      requestedDate: date,
      rates,
      rateDates,
      fetchedAt: systemClock.nowIso(),
      source: 'erapi',
    };
  },
};
