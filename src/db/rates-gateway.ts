import { instantFromMs } from '@/lib/dates';
import { fetchRateTable, backoffDelayMs } from '@/services/rates/provider-chain';
import { RatesError } from '@/services/rates/types';
import type { Currency, LocalDate, RateSource, RateString } from '@/types/money';

import type { GreenbackDB } from './db';
import { findKnownRate } from './rate-lookup';
import {
  activeLockouts,
  deriveRate,
  getRateTable,
  getRatesMeta,
  putRatesMeta,
  toRateTableRow,
} from './repos/rates';

/**
 * The one place the app asks "what is this rate, right now".
 *
 * Everything under it already existed and was tested - the two providers, the
 * sequential fallback, the keyed cache, the backoff table - but nothing in the
 * running app had ever called any of it, because the first screen that needs a
 * live rate is the transaction form. This is that call.
 *
 * Three sources, in a fixed order, and the order is the whole design:
 *
 *  1. THE CACHE. A historical row is immutable and never expires; a `latest`
 *     row is good for 12 hours. Asking the network for something already on
 *     disk is the difference between a form that opens instantly and one that
 *     blocks on a free API's cold start.
 *  2. THE NETWORK, through the sequential provider chain - never raced, because
 *     racing makes it nondeterministic WHICH source ends up stamped into the
 *     snapshot, and the two disagree by ~0.16% on the same pair and date.
 *  3. ANY rate this install has ever seen, returned as `stale`. This is not a
 *     fallback that fabricates anything: it comes back with its own date
 *     attached, the field shows that date, and the user can overwrite it.
 *
 * What it never does is invent a rate. There is no `rateUsed = 1` path here;
 * an unreachable network with an empty cache returns `undefined`, and the form
 * asks the user.
 */

export type QuoteOrigin =
  /** Served from the cache within its freshness window. */
  | 'cache'
  /** Fetched just now. */
  | 'network'
  /** Older than we would like, and labelled as such wherever it is shown. */
  | 'stale';

export type RateQuote = {
  readonly rate: RateString;
  readonly rateDate: LocalDate;
  readonly rateSource: RateSource;
  readonly origin: QuoteOrigin;
};

export type QuoteDeps = {
  readonly nowMs: number;
  /** The device-local calendar date, so "today" is not re-derived from a clock here. */
  readonly today: LocalDate;
  /** Injected for tests; the real chain by default. */
  readonly fetchTable?: typeof fetchRateTable;
  readonly random?: () => number;
  readonly signal?: AbortSignal;
};

/**
 * `1 from = ? to`, on a given date.
 *
 * Returns undefined when the pair cannot be priced at all - the ONE case that
 * makes the form demand a manual rate. Identity pairs also return undefined:
 * `convertMinor` short-circuits `from === to` without consulting a rate, and
 * fabricating a quote of 1 here would put a made-up `rateSource` into the audit
 * trail of every single-currency row in the database.
 */
export async function quoteRate(
  db: GreenbackDB,
  from: Currency,
  to: Currency,
  on: LocalDate,
  deps: QuoteDeps,
): Promise<RateQuote | undefined> {
  if (from === to) return undefined;

  const nowIso = instantFromMs(deps.nowMs);
  /*
   * A date at or after today asks for `latest`, never for itself.
   *
   * The ECB publishes around 16:00 CET, so a historical request for today
   * legitimately returns an empty array for most of the working day - and
   * Frankfurter returns that empty array with HTTP 200, so a naive caller
   * treats "no data yet" as success and stores nothing at all.
   */
  const requested: LocalDate | 'latest' = on >= deps.today ? 'latest' : on;

  const cached = await fromCache(db, from, to, requested, nowIso);
  if (cached !== undefined) return cached;

  const fetched = await fromNetwork(db, from, to, requested, nowIso, deps);
  if (fetched !== undefined) return fetched;

  // Offline, rate-limited, or the pair is simply not covered. Anything this
  // install already knows beats an empty field, provided its age is visible.
  const known = await findKnownRate(db, from, to, on);
  return known === undefined ? undefined : { ...known, origin: 'stale' };
}

async function fromCache(
  db: GreenbackDB,
  from: Currency,
  to: Currency,
  requested: LocalDate | 'latest',
  nowIso: string,
): Promise<RateQuote | undefined> {
  // Provider order matters here exactly as it does on the wire: if both have a
  // table for this date, the row we serve must be the row we would have
  // fetched, or the same transaction saved twice gets two different sources.
  for (const source of ['frankfurter', 'erapi'] as const) {
    const row = await getRateTable(db, source, to, requested, nowIso);
    if (row === undefined) continue;
    const derived = deriveRate(row, from, to);
    if (derived === undefined) continue;
    const rateDate = derived.rateDate ?? (row.date === 'latest' ? undefined : row.date);
    if (rateDate === undefined) continue;
    return { rate: derived.rate, rateDate, rateSource: row.source, origin: 'cache' };
  }
  return undefined;
}

async function fromNetwork(
  db: GreenbackDB,
  from: Currency,
  to: Currency,
  requested: LocalDate | 'latest',
  nowIso: string,
  deps: QuoteDeps,
): Promise<RateQuote | undefined> {
  const meta = await getRatesMeta(db);

  /*
   * The backoff gate, honoured BEFORE the request rather than after it.
   *
   * Without this, an offline PWA retries on every keystroke that changes the
   * currency - each attempt costing a 6-second timeout - and a rate-limited
   * provider stays rate-limited because the app keeps knocking.
   */
  if (meta.nextAttemptAt !== undefined && meta.nextAttemptAt > nowIso) return undefined;

  const fetchTable = deps.fetchTable ?? fetchRateTable;

  try {
    const table = await fetchTable(to, requested, {
      lockedOut: activeLockouts(meta, nowIso),
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });

    // Persisted and read back through the SAME conversion, rather than derived
    // from the wire shape alongside it: two paths to the same number is how the
    // cached answer and the fresh one start disagreeing.
    const row = toRateTableRow(table, deps.nowMs);
    await db.ratesTables.put(row);
    await putRatesMeta(db, {
      ...meta,
      lastSuccessAt: nowIso,
      consecutiveFailures: 0,
      activeSource: table.source,
      // Explicitly cleared: leaving a stale gate behind would silently suppress
      // the NEXT fetch even though this one just succeeded.
      nextAttemptAt: undefined,
    });

    const derived = deriveRate(row, from, to);
    if (derived === undefined) return undefined;
    const rateDate = derived.rateDate ?? (row.date === 'latest' ? undefined : row.date);
    if (rateDate === undefined) return undefined;

    return { rate: derived.rate, rateDate, rateSource: row.source, origin: 'network' };
  } catch (error) {
    await recordFailure(db, meta, error, nowIso, deps);
    return undefined;
  }
}

async function recordFailure(
  db: GreenbackDB,
  meta: Awaited<ReturnType<typeof getRatesMeta>>,
  error: unknown,
  nowIso: string,
  deps: QuoteDeps,
): Promise<void> {
  const failures = meta.consecutiveFailures + 1;
  const rates = error instanceof RatesError ? error : undefined;

  /*
   * A 429 locks out THAT provider specifically, for the interval it asked for.
   *
   * Backing off the whole chain instead would punish the second provider for
   * the first one's quota, which is precisely the situation a fallback exists
   * to handle.
   */
  const lockouts =
    rates?.code === 'rate_limited'
      ? {
          ...meta.lockouts,
          [rates.provider]: instantFromMs(
            deps.nowMs + (rates.retryAfterMs ?? backoffDelayMs(failures, deps.random)),
          ),
        }
      : meta.lockouts;

  await putRatesMeta(db, {
    ...meta,
    lastFailureAt: nowIso,
    ...(rates === undefined ? {} : { lastErrorCode: rates.code }),
    consecutiveFailures: failures,
    lockouts,
    nextAttemptAt: instantFromMs(deps.nowMs + backoffDelayMs(failures, deps.random)),
  });
}
