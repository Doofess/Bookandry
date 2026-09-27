import type { BookandryDB } from '@/db/db';
import type { RateTableRow, RatesMeta } from '@/db/rates-types';
import { instantFromMs } from '@/lib/dates';
import { crossRate } from '@/lib/money';
import type { RateTable } from '@/services/rates/types';
import type { Currency, LocalDate, RateSource, RateString } from '@/types/money';

export const LATEST_TTL_MS = 12 * 60 * 60 * 1000;
/** Historical rows are immutable, so they simply never expire. */
const NEVER = '9999-12-31T00:00:00.000Z';

const RATES_META_ID = 'singleton';

export function rateTableKey(source: RateSource, base: Currency, date: LocalDate | 'latest'): string {
  return `${source}|${base}|${date}`;
}

/**
 * Structural validation of a cached row.
 *
 * §9 requires surviving a corrupted cache. A corrupt row must be dropped and
 * refetched - never thrown into a render, and never allowed to block a save.
 */
export function isValidRateRow(value: unknown): value is RateTableRow {
  if (typeof value !== 'object' || value === null) return false;
  // Treated as unknown fields, NOT cast to Partial<RateTableRow>: the value
  // came off disk and may be anything. Casting first would tell the type
  // checker these properties are already well-typed and quietly delete the
  // very checks that make this function useful.
  const row: Record<string, unknown> = value as Record<string, unknown>;
  return (
    row['schema'] === 1 &&
    typeof row['key'] === 'string' &&
    typeof row['base'] === 'string' &&
    typeof row['date'] === 'string' &&
    typeof row['fetchedAt'] === 'string' &&
    typeof row['expiresAt'] === 'string' &&
    typeof row['rates'] === 'object' &&
    row['rates'] !== null &&
    typeof row['rateDates'] === 'object' &&
    row['rateDates'] !== null
  );
}

export function toRateTableRow(table: RateTable, nowMs: number): RateTableRow {
  return {
    key: rateTableKey(table.source, table.base, table.requestedDate),
    schema: 1,
    source: table.source,
    base: table.base,
    date: table.requestedDate,
    rates: table.rates,
    rateDates: table.rateDates,
    fetchedAt: table.fetchedAt,
    expiresAt: table.requestedDate === 'latest' ? instantFromMs(nowMs + LATEST_TTL_MS) : NEVER,
  };
}

export async function putRateTable(db: BookandryDB, table: RateTable, nowMs: number): Promise<void> {
  await db.ratesTables.put(toRateTableRow(table, nowMs));
}

/**
 * Read a cached table, dropping it if it is corrupt or expired.
 *
 * Returns undefined for a miss so the caller treats corruption exactly like an
 * absent entry, with no special path to get wrong.
 */
export async function getRateTable(
  db: BookandryDB,
  source: RateSource,
  base: Currency,
  date: LocalDate | 'latest',
  nowIso: string,
): Promise<RateTableRow | undefined> {
  const key = rateTableKey(source, base, date);
  let row: unknown;
  try {
    row = await db.ratesTables.get(key);
  } catch {
    return undefined;
  }
  if (row === undefined) return undefined;

  if (!isValidRateRow(row)) {
    await db.ratesTables.delete(key);
    return undefined;
  }
  if (row.expiresAt <= nowIso) return undefined;
  return row;
}

/** Any cached table for this base, newest first, ignoring expiry. */
export async function findAnyTableForBase(
  db: BookandryDB,
  base: Currency,
): Promise<RateTableRow | undefined> {
  const rows = await db.ratesTables.where('base').equals(base).toArray();
  const valid = rows.filter(isValidRateRow);
  valid.sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1));
  return valid[0];
}

/**
 * The rate for `from -> to` implied by a table based on a third currency.
 *
 * Numerically this is safe: a single division loses at most one ulp, nine
 * orders of magnitude below the minor-unit rounding boundary. The real hazard
 * is SEMANTIC - the two legs can carry different effective dates - so the
 * conservative (older) of the two is reported alongside.
 */
export type DerivedRate = {
  readonly rate: RateString;
  readonly rateDate: LocalDate | undefined;
  readonly derived: boolean;
};

export function deriveRate(row: RateTableRow, from: Currency, to: Currency): DerivedRate | undefined {
  if (from === to) return { rate: '1', rateDate: row.rateDates[from], derived: false };

  const fromRate = from === row.base ? 1 : row.rates[from];
  const toRate = to === row.base ? 1 : row.rates[to];
  if (fromRate === undefined || toRate === undefined) return undefined;
  if (fromRate <= 0 || toRate <= 0) return undefined;

  const direct = from === row.base;
  const fromDate = row.rateDates[from];
  const toDate = row.rateDates[to];

  const dates = [fromDate, toDate].filter((x): x is LocalDate => x !== undefined);
  const rateDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : undefined;

  return {
    rate: crossRate(String(fromRate), String(toRate)),
    rateDate,
    derived: !direct,
  };
}

export async function getRatesMeta(db: BookandryDB): Promise<RatesMeta> {
  const existing = await db.ratesMeta.get(RATES_META_ID);
  return existing ?? { id: RATES_META_ID, consecutiveFailures: 0, lockouts: {} };
}

export async function putRatesMeta(db: BookandryDB, meta: Omit<RatesMeta, 'id'>): Promise<void> {
  await db.ratesMeta.put({ ...meta, id: RATES_META_ID });
}

/** Providers currently locked out by a 429. */
export function activeLockouts(meta: RatesMeta, nowIso: string): Set<string> {
  const locked = new Set<string>();
  for (const [source, until] of Object.entries(meta.lockouts)) {
    if (typeof until === 'string' && until > nowIso) locked.add(source);
  }
  return locked;
}
