/**
 * Money and calendar-date primitives.
 *
 * Both are branded. The single most common defect class in a ledger app is an
 * ISO timestamp leaking into a calendar-date field (§12 forbids `toISOString()`
 * for transaction dates) or a float leaking into an amount. Branding makes both
 * a compile error instead of a runtime surprise nobody notices for months.
 */

declare const localDateBrand: unique symbol;
declare const isoInstantBrand: unique symbol;

/** A local calendar date, "YYYY-MM-DD". No time, no timezone. */
export type LocalDate = string & { readonly [localDateBrand]: true };

/** A full ISO 8601 instant, for createdAt/updatedAt. */
export type IsoInstant = string & { readonly [isoInstantBrand]: true };

/** ISO 4217 code. */
export type Currency = string;

/** An integer amount in the currency's minor units. NEVER a float. */
export type Minor = number;

/**
 * An exchange rate as an EXACT decimal string, not a number.
 *
 * A cross rate computed in floating point is already lossy at the moment it is
 * recorded, and this value is the audit trail shown in the row's tooltip.
 * `String(x)` is specified to produce the shortest round-tripping decimal, so
 * the provider's exact figure is always recoverable.
 */
export type RateString = string;

export type Kind = 'income' | 'expense';

/** Where a stored rate came from. Part of every snapshot, because providers disagree. */
export type RateSource = 'frankfurter' | 'erapi' | 'manual' | 'demo';

/**
 * Money is an all-or-nothing tuple.
 *
 * The spec modelled overrides as `Partial<Pick<Transaction, 'amountMinor' |
 * 'baseAmountMinor' | ...>>`, which permits patching `amountMinor` WITHOUT
 * `baseAmountMinor`. Every calculator then silently uses a stale converted
 * amount. Making the five fields inseparable removes that state entirely.
 */
export type MoneySnapshot = {
  /** Always > 0. `kind` carries the sign, never the number. */
  readonly amountMinor: Minor;
  readonly currency: Currency;
  readonly baseCurrency: Currency;
  /** Also > 0: the sign is applied by the calculator from `kind`. */
  readonly baseAmountMinor: Minor;
  readonly rateUsed: RateString;
  readonly rateDate: LocalDate;
  readonly rateSource: RateSource;
};
