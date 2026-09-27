/**
 * Cross-tab mutual exclusion for the three operations that rewrite the world.
 *
 * Bookandry is a PWA people leave open. Dexie's liveQuery keeps READS in sync
 * across tabs, which makes it easy to assume writes are safe too - they are not:
 *
 *  - two tabs can each start a reconvert and both flip `defaultCurrency`,
 *    leaving half the rows in each base with no error anywhere;
 *  - an import-replace in tab A deletes the row tab B has open in a sheet;
 *  - both tabs run the soft-delete sweeper, racing on the same tombstones.
 *
 * Web Locks are held per ORIGIN, not per tab or per document, which is exactly
 * the scope needed here, and the browser releases them if the tab crashes.
 */

export const LOCK_RECONVERT = 'greenback.reconvert';
export const LOCK_IMPORT = 'greenback.import';
export const LOCK_SWEEP = 'greenback.sweep';
export const LOCK_REPAIR = 'greenback.repair';
/**
 * Held for a whole sync cycle - push, pull, repair - so exactly one tab syncs.
 *
 * Reconvert and import take it too, AFTER their own lock. Both read every row,
 * compute, then write every row; a pull landing in between would have its
 * newer rows overwritten by values computed from the older ones. The order is
 * always "own lock, then sync", and sync never takes theirs, so no two of them
 * can wait on each other.
 */
export const LOCK_SYNC = 'greenback.sync';

/** Thrown for `ifAvailable` callers, so the UI can name the other tab. */
export class LockBusyError extends Error {
  constructor(readonly lockName: string) {
    super(`Another tab is already running ${lockName}`);
    this.name = 'LockBusyError';
  }
}

export type LockOptions = {
  /**
   * Fail immediately rather than queueing.
   *
   * Right for a reconvert (a progress bar that silently waits on another tab is
   * indistinguishable from a hang) and wrong for the sweeper, which should just
   * take its turn.
   */
  readonly ifAvailable?: boolean;
};

type LockManagerLike = {
  request: (
    name: string,
    options: { mode: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<unknown>,
  ) => Promise<unknown>;
};

function lockManager(): LockManagerLike | undefined {
  const nav: { locks?: LockManagerLike } | undefined =
    typeof navigator === 'undefined' ? undefined : navigator;
  return nav?.locks;
}

/**
 * In-process fallback.
 *
 * Used where Web Locks do not exist: Node (the db test project) and any
 * non-secure context, since `navigator.locks` is secure-context-only - the same
 * constraint that ruled out `crypto.randomUUID()` for ids, and it bites on
 * `pnpm dev --host` over plain http from a phone.
 *
 * It serialises within ONE tab and cannot see any other, which is a real
 * downgrade and not a silent one: the operations it guards are all confirmed by
 * the user, and the alternative is no guard at all.
 */
const chainTail = new Map<string, Promise<void>>();
const queueDepth = new Map<string, number>();

async function withFallbackLock<T>(name: string, fn: () => Promise<T>, options: LockOptions): Promise<T> {
  const depth = queueDepth.get(name) ?? 0;
  // Busy means "held OR queued". Testing only for "currently running" would let
  // an ifAvailable caller jump ahead of someone already waiting.
  if (depth > 0 && options.ifAvailable === true) throw new LockBusyError(name);
  queueDepth.set(name, depth + 1);

  const predecessor = chainTail.get(name) ?? Promise.resolve();
  let release = (): void => undefined;
  const heldUntil = new Promise<void>((resolve) => {
    release = resolve;
  });
  chainTail.set(
    name,
    predecessor.then(
      () => heldUntil,
      () => heldUntil,
    ),
  );

  // Waiting behind a task is not the same as taking part in it, so a
  // predecessor's failure must not propagate here.
  await predecessor.catch(() => undefined);

  try {
    return await fn();
  } finally {
    queueDepth.set(name, (queueDepth.get(name) ?? 1) - 1);
    release();
  }
}

/**
 * Run `fn` holding an exclusive origin-wide lock.
 *
 * The lock is released when the returned promise settles, so the callback must
 * contain the whole operation - taking the lock, returning, and then writing is
 * the same as not locking at all.
 */
export async function withLock<T>(name: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const locks = lockManager();
  if (locks === undefined) return withFallbackLock(name, fn, options);

  const marker = Symbol('unavailable');
  const result = await locks.request(
    name,
    { mode: 'exclusive', ...(options.ifAvailable === true ? { ifAvailable: true } : {}) },
    async (lock) => {
      // With ifAvailable, the callback still runs - with a null lock - when the
      // lock could not be granted. Returning early there is the ONLY way to
      // tell "I got it" from "someone else has it".
      if (lock === null) return marker;
      return fn();
    },
  );

  if (result === marker) throw new LockBusyError(name);
  return result as T;
}
