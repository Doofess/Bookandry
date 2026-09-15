import type { Currency, LocalDate, RateSource } from '@/types/money';

/**
 * Rates cache.
 *
 * The spec stored ONE unkeyed row `{base, rates, fetchedAt, source}`. That
 * cannot hold a second base and cannot hold history, so it breaks the moment
 * `defaultCurrency` changes and cannot serve a historical lookup at all.
 */
export type RateTableRow = {
  /** `${source}|${base}|${date}` */
  readonly key: string;
  readonly schema: 1;
  readonly source: RateSource;
  readonly base: Currency;
  /** The REQUESTED date, or 'latest'. */
  readonly date: LocalDate | 'latest';
  readonly rates: Readonly<Record<Currency, number>>;
  /**
   * Per-QUOTE effective date. Frankfurter v2 returns mixed dates within one
   * payload (ILS at 2026-09-14 while AED is 2026-09-15), so a single `date`
   * field would be a lie for most of the table.
   */
  readonly rateDates: Readonly<Record<Currency, LocalDate>>;
  readonly fetchedAt: string;
  /** `latest` expires at fetchedAt + 12h; historical rows never expire. */
  readonly expiresAt: string;
};

export type RatesMeta = {
  readonly id: 'singleton';
  readonly lastSuccessAt?: string;
  readonly lastFailureAt?: string;
  readonly lastErrorCode?: string;
  readonly consecutiveFailures: number;
  /** Exponential-backoff gate. */
  readonly nextAttemptAt?: string;
  readonly activeSource?: RateSource;
  /** Per-provider 429 lockouts, as until-timestamps. */
  readonly lockouts: Partial<Record<RateSource, string>>;
};

export type CurrencyInfo = {
  readonly code: Currency;
  readonly name?: string;
  readonly symbol?: string;
};

export type CurrencyListRow = {
  readonly source: RateSource;
  readonly currencies: readonly CurrencyInfo[];
  readonly fetchedAt: string;
};
