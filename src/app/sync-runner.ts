import { liveQuery, type Subscription } from 'dexie';

import type { BookandryDB } from '@/db/db';
import { quoteRate } from '@/db/rates-gateway';
import { SETTINGS_ID } from '@/db/repos/settings';
import { KeyUnavailableError } from '@/db/sync/codec';
import { syncOnce, type SyncReport } from '@/db/sync/engine';
import type { SyncTransport } from '@/db/sync/protocol';
import type { RateQuote } from '@/domain/reconvert';
import { systemClock } from '@/lib/clock';
import { ServerError } from '@/services/supabase/transport';
import type { Currency, LocalDate } from '@/types/money';

/**
 * When to sync, and what to call the outcome.
 *
 * Triggers: a local change (debounced, so a burst of edits is one sync), the
 * app coming back to the foreground, the network coming back, and a slow
 * interval for changes made on other devices. Failures back off, doubling to
 * five minutes, so a dead server does not drain a phone.
 *
 * Several tabs may each run one; `syncOnce` holds the origin-wide sync lock,
 * so they take turns rather than collide.
 */
export type SyncState =
  | { readonly kind: 'idle'; readonly lastSyncedAt?: number }
  | { readonly kind: 'syncing'; readonly lastSyncedAt?: number }
  /** Rows arrived in a base currency this household left; a rate is missing. */
  | { readonly kind: 'rebasing'; readonly lastSyncedAt: number; readonly unresolved: number }
  | { readonly kind: 'offline'; readonly lastSyncedAt?: number }
  /** The account moved to a new key; this device must unlock again. */
  | { readonly kind: 'locked' }
  | { readonly kind: 'error'; readonly lastSyncedAt?: number };

const DEBOUNCE_MS = 1_500;
const INTERVAL_MS = 60_000;
const BACKOFF_MIN_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;

export type SyncRunnerDeps = {
  readonly db: BookandryDB;
  /** Built fresh for each sync, so it always carries the latest keys. */
  readonly transport: () => Promise<SyncTransport>;
  readonly onState: (state: SyncState) => void;
  /** Tests pass fakes; the app passes the window. */
  readonly target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly isOnline?: () => boolean;
};

export type SyncRunner = {
  /** Sync as soon as possible - the "Sync now" button. */
  now(): void;
  stop(): void;
};

export function classify(error: unknown, online: boolean): 'offline' | 'locked' | 'error' {
  if (error instanceof KeyUnavailableError) return 'locked';
  if (error instanceof ServerError && error.code === 'stale_key_version') return 'locked';
  if (!online || error instanceof TypeError) return 'offline';
  return 'error';
}

export function startSyncRunner(deps: SyncRunnerDeps): SyncRunner {
  const { db, onState } = deps;
  const target = deps.target ?? window;
  const isOnline = deps.isOnline ?? (() => navigator.onLine);

  let lastSyncedAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  let backoff = 0;
  // Read through a function: `stopped` changes while run() awaits, which
  // narrowing cannot see.
  const isStopped = (): boolean => stopped;

  const schedule = (delay: number): void => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void run(), delay);
  };

  const run = async (): Promise<void> => {
    timer = undefined;
    if (stopped) return;
    if (!isOnline()) {
      onState({ kind: 'offline', lastSyncedAt });
      return; // the 'online' event brings it back
    }
    running = true;
    onState({ kind: 'syncing', lastSyncedAt });
    let next = INTERVAL_MS;
    try {
      const report = await syncOnce(db, await deps.transport(), {
        now: systemClock.nowIso(),
        rebase: { fetchQuote: (currency, date) => quoteToBase(db, currency, date) },
      });
      lastSyncedAt = systemClock.nowMs();
      backoff = 0;
      onState(stateAfter(report, lastSyncedAt));
    } catch (error) {
      const kind = classify(error, isOnline());
      if (kind === 'locked') {
        onState({ kind: 'locked' });
        running = false;
        return; // nothing to retry until the person unlocks
      }
      onState({ kind, lastSyncedAt });
      backoff = Math.min(Math.max(backoff * 2, BACKOFF_MIN_MS), BACKOFF_MAX_MS);
      next = backoff;
    }
    running = false;
    if (isStopped()) return;
    if (again) {
      again = false;
      schedule(0);
    } else {
      schedule(next);
    }
  };

  const onFocus = (): void => {
    schedule(0);
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') schedule(0);
  };
  target.addEventListener('focus', onFocus);
  target.addEventListener('online', onFocus);
  target.addEventListener('offline', onFocus);
  document.addEventListener('visibilitychange', onVisible);

  // A local change: the outbox grows. Debounced, so typing a note is one sync.
  let first = true;
  const subscription: Subscription = liveQuery(() => db.outbox.count()).subscribe({
    next: (count) => {
      if (first) {
        first = false;
        return;
      }
      if (count > 0) schedule(DEBOUNCE_MS);
    },
    error: () => undefined,
  });

  schedule(0);

  return {
    now: () => {
      backoff = 0;
      schedule(0);
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      subscription.unsubscribe();
      target.removeEventListener('focus', onFocus);
      target.removeEventListener('online', onFocus);
      target.removeEventListener('offline', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

function stateAfter(report: SyncReport, at: number): SyncState {
  const unresolved = report.rebase?.unresolved.length ?? 0;
  return unresolved > 0
    ? { kind: 'rebasing', lastSyncedAt: at, unresolved }
    : { kind: 'idle', lastSyncedAt: at };
}

/** Rows from another base are priced like any other conversion: same gateway, same cache. */
async function quoteToBase(
  db: BookandryDB,
  currency: Currency,
  date: LocalDate,
): Promise<RateQuote | undefined> {
  const settings = await db.settings.get(SETTINGS_ID);
  if (settings === undefined) return undefined;
  const quote = await quoteRate(db, currency, settings.defaultCurrency, date, {
    nowMs: systemClock.nowMs(),
    today: systemClock.today(),
  });
  return quote === undefined
    ? undefined
    : { rate: quote.rate, rateDate: quote.rateDate, source: quote.rateSource };
}
