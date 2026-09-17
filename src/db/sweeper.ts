import type { GreenbackDB } from './db';
import { sweepExpiredDeletions } from './repos/transactions';

/**
 * Run the soft-delete sweeper, and keep running it.
 *
 * The sweeper, the 24-hour window, the `deletedAt` index it queries and the
 * cross-tab lock it takes were all built and tested - and nothing ever called
 * it, so every tombstone this app has ever written is still in the database.
 * "Recently deleted" would have grown without bound and "hard-deleted after 24
 * hours" was a promise the UI made and the data model did not keep.
 *
 * Deliberately NOT awaited by boot: purging is never what the user is waiting
 * for, and a slow sweep must not hold up first paint.
 */

/**
 * A PWA is left open for days, so booting is not the only moment worth
 * sweeping - but `visibilitychange` fires every time the user flicks back to
 * the tab, and purging on each of those is pointless work against IndexedDB.
 */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export type SweeperHandle = { readonly stop: () => void };

/**
 * The part of `document` this needs, injected rather than reached for.
 *
 * The db test project runs in node, where there is no `document` at all - so a
 * sweeper that read the global could only be tested in jsdom, which is to say
 * in the project that does not have the database. Injecting it is the same rule
 * `today` follows: nothing here reads an ambient source.
 */
export type SweepWaker = {
  readonly visibilityState: string;
  addEventListener: (type: 'visibilitychange', listener: () => void) => void;
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void;
};

export type SweeperOptions = {
  readonly intervalMs?: number;
  readonly waker?: SweepWaker;
};

export function startSweeper(
  db: GreenbackDB,
  now: () => number,
  options: SweeperOptions = {},
): SweeperHandle {
  const { intervalMs = SWEEP_INTERVAL_MS } = options;
  const waker = options.waker ?? (typeof document === 'undefined' ? undefined : document);
  let lastRun = Number.NEGATIVE_INFINITY;
  let running = false;

  const run = (): void => {
    const at = now();
    if (running || at - lastRun < intervalMs) return;
    running = true;
    lastRun = at;

    void sweepExpiredDeletions(db, at)
      .catch((error: unknown) => {
        /*
         * Swallowed, not thrown, and warn rather than error.
         *
         * A failed sweep leaves tombstones in place for another hour, which is
         * invisible and harmless; throwing would take down a render the user
         * was in the middle of. `console.error` is avoided because the shell
         * smoke test asserts a clean console - a rule worth keeping sharp.
         */
        console.warn('[sweeper] purge failed; tombstones kept for the next pass', error);
      })
      .finally(() => {
        running = false;
      });
  };

  run();

  if (waker === undefined) return { stop: () => undefined };

  const onVisible = (): void => {
    if (waker.visibilityState === 'visible') run();
  };
  waker.addEventListener('visibilitychange', onVisible);

  return {
    stop: () => {
      waker.removeEventListener('visibilitychange', onVisible);
    },
  };
}
