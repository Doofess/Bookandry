import type { KnownRate } from '@/domain/tx-rate';
import { externalTimestampToLocalDate } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

import type { GreenbackDB } from './db';
import type { RateTableRow } from './rates-types';
import { deriveRate, isValidRateRow } from './repos/rates';

/**
 * The rate the form's field starts with.
 *
 * "Never fabricate a rate" is the rule; "never let them save" is not. A
 * HISTORICAL cache row never expires, so a table fetched three weeks ago is
 * still a perfectly good default for a manual entry - provided the field says
 * so, which is why its own date comes back alongside it. Only a pair this
 * install has genuinely never seen produces `undefined`, and only that case
 * blocks a save.
 *
 * Note what this deliberately does NOT do: fetch. It is called while a sheet is
 * opening, possibly offline, and a network round trip there would either block
 * the sheet or change the field under the user's cursor a second later.
 */

/**
 * How far back through the cache to look, newest fetch first.
 *
 * Unbounded, this would deserialise every historical table a reconvert ever
 * wrote - each one carrying ~165 quotes - to answer a question the first row
 * almost always answers. A pair absent from the sixty most recently fetched
 * tables is, for the purposes of a prefill, a pair this install does not know.
 */
const SCAN_LIMIT = 60;

export async function findKnownRate(
  db: GreenbackDB,
  from: Currency,
  to: Currency,
  on: LocalDate,
): Promise<KnownRate | undefined> {
  if (from === to) return undefined;

  // A table for the exact date is the honest answer, so it is asked for first
  // and separately - it would otherwise lose to a newer `latest` table, and a
  // rate stamped "today" for a purchase made in March is a small lie that ends
  // up in the audit trail.
  const exact = await db.ratesTables.where('date').equals(on).toArray();
  const onDate = firstDerivable(exact, from, to);
  if (onDate !== undefined) return onDate;

  const recent = await db.ratesTables.orderBy('fetchedAt').reverse().limit(SCAN_LIMIT).toArray();
  return firstDerivable(recent, from, to);
}

/**
 * Both directions of the pair, from whichever cached table can express it.
 *
 * `deriveRate` handles the cross case, so a table based on ILS answers
 * EUR -> USD as readily as EUR -> ILS. That matters because the cache is
 * populated in the user's base currency, and the pair they are entering
 * usually is not.
 */
function firstDerivable(rows: readonly unknown[], from: Currency, to: Currency): KnownRate | undefined {
  for (const candidate of rows) {
    if (!isValidRateRow(candidate)) continue;
    const row: RateTableRow = candidate;
    const derived = deriveRate(row, from, to);
    if (derived === undefined) continue;

    const rateDate = derived.rateDate ?? effectiveDate(row);
    if (rateDate === undefined) continue;

    return { rate: derived.rate, rateDate, rateSource: row.source };
  }
  return undefined;
}

/**
 * The date to attribute a table to when the quote carries none of its own.
 *
 * A `latest` row's `date` is the literal string "latest", which is not a
 * calendar date and must never reach `rateDate` - Zod's date regex, the
 * `LocalDate` brand and `Intl.DateTimeFormat` would each reject or throw on it
 * in a different place. The fetch instant is the defensible substitute.
 */
function effectiveDate(row: RateTableRow): LocalDate | undefined {
  if (row.date !== 'latest') return row.date;
  return externalTimestampToLocalDate(row.fetchedAt);
}
