import type { GreenbackDB } from '@/db/db';
import {
  collectRateRequests,
  planReconversion,
  type RateLookup,
  type RateQuote,
  type ReconvertInput,
  type ReconvertPlan,
  type UnresolvedRow,
} from '@/domain/reconvert';
import type { Currency, IsoInstant, LocalDate } from '@/types/money';

import { LOCK_RECONVERT, LockBusyError, withLock } from './lock';
import { SETTINGS_ID } from './repos/settings';

/**
 * Changing the default currency: prefetch, then one atomic write.
 *
 * The spec asked for "a single Dexie transaction ... show progress", which is
 * UNIMPLEMENTABLE. An IndexedDB transaction auto-commits the moment you await a
 * promise that is not part of it, so it cannot contain a fetch. Attempting it
 * does not fail loudly - the transaction quietly ends and later writes land
 * outside it, which is the worst possible outcome for the app's most
 * destructive operation.
 *
 * So:
 *   PHASE A  network only, outside any transaction. This is where the seconds
 *            and the progress bar live. ANY failure aborts and writes nothing.
 *   PHASE B  one rw transaction over transactions, overrides, profiles and
 *            settings. No awaits on anything but Dexie.
 *
 * settings.defaultCurrency is written INSIDE phase B, which makes "settings and
 * data disagree about the base currency" unrepresentable.
 */

export type ReconvertProgress = { fetched: number; total: number };

export type ReconvertDeps = {
  /** Resolve one (currency, date) pair. Network lives here and nowhere else. */
  readonly fetchQuote: (currency: Currency, date: LocalDate) => Promise<RateQuote | undefined>;
  readonly onProgress?: (progress: ReconvertProgress) => void;
  readonly now: IsoInstant;
};

export type ReconvertResult =
  | {
      readonly ok: true;
      readonly changed: { transactions: number; overrides: number; profiles: number };
    }
  | { readonly ok: false; readonly reason: 'unresolved'; readonly unresolved: readonly UnresolvedRow[] }
  | { readonly ok: false; readonly reason: 'fetch_failed'; readonly failed: readonly string[] }
  /** Another tab is already reconverting. Both finishing would split the base. */
  | { readonly ok: false; readonly reason: 'busy' };

export async function loadReconvertInput(
  db: GreenbackDB,
  oldBase: Currency,
  newBase: Currency,
): Promise<ReconvertInput> {
  const [transactions, overrides, profiles] = await Promise.all([
    db.transactions.toArray(),
    db.overrides.toArray(),
    db.profiles.toArray(),
  ]);
  return { oldBase, newBase, transactions, overrides, profiles };
}

/** PHASE A: obtain every rate the plan will need. Network only, no writes. */
export async function prefetchRates(
  input: ReconvertInput,
  deps: ReconvertDeps,
): Promise<{ lookup: RateLookup; failed: string[] }> {
  const requests = collectRateRequests(input);
  const quotes = new Map<string, RateQuote>();
  const failed: string[] = [];

  let fetched = 0;
  deps.onProgress?.({ fetched, total: requests.length });

  for (const req of requests) {
    try {
      const quote = await deps.fetchQuote(req.currency, req.date);
      if (quote) quotes.set(`${req.currency}|${req.date}`, quote);
      else failed.push(`${req.currency} on ${req.date}`);
    } catch {
      failed.push(`${req.currency} on ${req.date}`);
    }
    fetched += 1;
    deps.onProgress?.({ fetched, total: requests.length });
  }

  const lookup: RateLookup = (from, to, on) => {
    if (from === to) return { rate: '1', rateDate: on, source: 'manual' };
    if (to !== input.newBase) return undefined;
    return quotes.get(`${from}|${on}`);
  };

  return { lookup, failed };
}

/**
 * PHASE B: one atomic write.
 *
 * Nothing in here awaits anything but Dexie, which is what keeps the
 * transaction alive across all of it.
 */
export async function applyReconvertPlan(
  db: GreenbackDB,
  plan: ReconvertPlan,
  newBase: Currency,
  now: IsoInstant,
): Promise<{ transactions: number; overrides: number; profiles: number }> {
  return db.transaction('rw', db.transactions, db.overrides, db.profiles, db.settings, async () => {
    for (const entry of plan.transactions) {
      await db.transactions.update(entry.id, { money: entry.money, updatedAt: now });
    }

    for (const entry of plan.overrides) {
      const existing = await db.overrides.get(entry.id);
      if (existing?.action !== 'modify') continue;
      await db.overrides.update(entry.id, {
        patch: { ...existing.patch, money: entry.money },
        updatedAt: now,
      });
    }

    for (const entry of plan.profiles) {
      await db.profiles.update(entry.id, {
        openingBalanceMinor: entry.openingBalanceMinor,
        openingBalanceCurrency: newBase,
        updatedAt: now,
      });
    }

    // Written inside the SAME transaction, so settings and data can never
    // disagree about which currency the stored base amounts are in.
    const settings = await db.settings.get(SETTINGS_ID);
    if (settings) {
      await db.settings.put({ ...settings, defaultCurrency: newBase, updatedAt: now });
    }

    return {
      transactions: plan.transactions.length,
      overrides: plan.overrides.length,
      profiles: plan.profiles.length,
    };
  });
}

/**
 * The whole flow. Aborts before writing anything if any rate is missing.
 *
 * Held under an origin-wide lock for its entire duration - prefetch included,
 * because the seconds spent fetching are exactly when a second tab would start
 * its own run. `ifAvailable` rather than queueing: a progress bar silently
 * waiting on another tab is indistinguishable from a hang, and the second run
 * would be pointless anyway once the first one lands.
 */
export async function reconvertDefaultCurrency(
  db: GreenbackDB,
  oldBase: Currency,
  newBase: Currency,
  deps: ReconvertDeps,
): Promise<ReconvertResult> {
  if (oldBase === newBase) {
    return { ok: true, changed: { transactions: 0, overrides: 0, profiles: 0 } };
  }

  try {
    return await withLock(LOCK_RECONVERT, () => runReconvert(db, oldBase, newBase, deps), {
      ifAvailable: true,
    });
  } catch (error) {
    if (error instanceof LockBusyError) return { ok: false, reason: 'busy' };
    throw error;
  }
}

async function runReconvert(
  db: GreenbackDB,
  oldBase: Currency,
  newBase: Currency,
  deps: ReconvertDeps,
): Promise<ReconvertResult> {
  const input = await loadReconvertInput(db, oldBase, newBase);

  const { lookup, failed } = await prefetchRates(input, deps);
  if (failed.length > 0) return { ok: false, reason: 'fetch_failed', failed };

  const plan = planReconversion(input, lookup);
  if (plan.unresolved.length > 0) {
    return { ok: false, reason: 'unresolved', unresolved: plan.unresolved };
  }

  const changed = await applyReconvertPlan(db, plan, newBase, deps.now);
  return { ok: true, changed };
}
