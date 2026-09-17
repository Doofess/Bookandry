import type { Currency, LocalDate } from '@/types/money';

import { erapiProvider } from './erapi';
import { frankfurterProvider } from './frankfurter';
import { RatesError, type RatesProvider, type RateTable } from './types';

/**
 * Sequential fallback, NEVER raced.
 *
 * Racing two free APIs makes it nondeterministic which source ends up persisted
 * in a snapshot, and they disagree: USD->ILS on 2026-09-14 is 3.0534 (ECB via
 * v1), 3.0486 (v2 consensus) and 3.046651 (er-api). A 0.16% spread is
 * user-visible in a ledger, so `rateSource` is recorded on every snapshot and
 * the order here is fixed.
 */
export const PROVIDERS: readonly RatesProvider[] = [frankfurterProvider, erapiProvider];

export const PER_PROVIDER_TIMEOUT_MS = 6_000;
export const TOTAL_BUDGET_MS = 15_000;

export type FetchTableOptions = {
  readonly providers?: readonly RatesProvider[];
  readonly timeoutMs?: number;
  /** Overall wall-clock cap across every provider tried. */
  readonly budgetMs?: number;
  /** Providers currently locked out (429), by id. */
  readonly lockedOut?: ReadonlySet<string>;
  readonly signal?: AbortSignal;
};

function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const controller = new AbortController();

  // An outer signal that has ALREADY aborted fires no event, so listening for
  // one would silently give the next attempt a full fresh timeout - which is
  // exactly how a "total budget" ends up bounding nothing.
  if (outer?.aborted === true) {
    controller.abort();
    return controller.signal;
  }

  const timer = setTimeout(() => {
    controller.abort();
  }, ms);
  const cleanup = () => {
    clearTimeout(timer);
  };
  controller.signal.addEventListener('abort', cleanup, { once: true });
  outer?.addEventListener(
    'abort',
    () => {
      controller.abort();
    },
    { once: true },
  );
  return controller.signal;
}

export async function fetchRateTable(
  base: Currency,
  date: LocalDate | 'latest',
  options: FetchTableOptions = {},
): Promise<RateTable> {
  const providers = options.providers ?? PROVIDERS;
  const timeoutMs = options.timeoutMs ?? PER_PROVIDER_TIMEOUT_MS;

  /*
   * The TOTAL budget, which was a declared constant enforcing nothing.
   *
   * Per-provider timeouts alone bound each attempt, not the wait. The fallback
   * is sequential by design - racing makes which source gets persisted
   * nondeterministic - so the times ADD UP: two providers at 6s each is already
   * 12s, and a third would take it past this cap with nothing to stop it. The
   * person waiting is staring at a form they cannot submit.
   */
  const budget = timeoutSignal(options.budgetMs ?? TOTAL_BUDGET_MS, options.signal);
  let lastError: RatesError | undefined;

  for (const provider of providers) {
    // Spent: stop rather than start an attempt that cannot finish.
    if (budget.aborted) break;
    if (options.lockedOut?.has(provider.id) === true) continue;
    // A historical request is never served by a provider without history.
    if (date !== 'latest' && !provider.supportsHistorical) continue;

    try {
      return await provider.getTable(base, date, timeoutSignal(timeoutMs, budget));
    } catch (error) {
      // An AbortError or a network failure becomes 'offline': from the app's
      // point of view they are the same recoverable condition.
      lastError = error instanceof RatesError ? error : new RatesError('offline', provider.id, true);
    }
  }

  throw lastError ?? new RatesError('offline', 'frankfurter', true);
}

/** Exponential backoff with jitter: 1m, 5m, 15m, 1h, 6h, capped at 12h. */
const BACKOFF_STEPS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 43_200_000] as const;

export function backoffDelayMs(consecutiveFailures: number, random = Math.random): number {
  const index = Math.min(Math.max(consecutiveFailures - 1, 0), BACKOFF_STEPS_MS.length - 1);
  // The index is clamped above, so the fallback is unreachable - it exists only
  // so noUncheckedIndexedAccess is satisfied without an assertion.
  const base = BACKOFF_STEPS_MS[index] ?? BACKOFF_STEPS_MS[0];
  const jitter = 1 + (random() - 0.5) * 0.4; // +/-20%
  return Math.round(base * jitter);
}
