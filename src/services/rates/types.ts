import type { CurrencyInfo } from '@/db/rates-types';
import type { Currency, LocalDate, RateSource } from '@/types/money';

/** A fetched rate table. Note the PER-QUOTE dates. */
export type RateTable = {
  readonly base: Currency;
  readonly requestedDate: LocalDate | 'latest';
  /** 1 base = rate quote */
  readonly rates: Readonly<Record<Currency, number>>;
  /**
   * Frankfurter v2 returns MIXED dates in one payload - verified live: ANG at
   * 2026-09-11 while AED and ILS are 2026-09-15. A single `date` field would be
   * wrong for most of the table, and would silently mis-stamp snapshots.
   */
  readonly rateDates: Readonly<Record<Currency, LocalDate>>;
  readonly fetchedAt: string;
  readonly source: RateSource;
};

export type RatesErrorCode =
  'offline' | 'timeout' | 'http' | 'rate_limited' | 'unsupported_currency' | 'no_data_for_date' | 'malformed';

export class RatesError extends Error {
  constructor(
    readonly code: RatesErrorCode,
    readonly provider: RateSource,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(`${provider}: ${code}`);
    this.name = 'RatesError';
  }
}

export type RatesProvider = {
  readonly id: RateSource;
  /**
   * er-api has no free historical endpoint. A historical request must FAIL
   * rather than fall back to it: substituting today's rate for a past date is
   * silently wrong, and silently wrong is the worst outcome in a ledger.
   */
  readonly supportsHistorical: boolean;
  /** exchangerate-api's terms require a visible attribution link. */
  readonly attribution?: { text: string; href: string };
  listCurrencies(signal: AbortSignal): Promise<CurrencyInfo[]>;
  getTable(base: Currency, date: LocalDate | 'latest', signal: AbortSignal): Promise<RateTable>;
};
