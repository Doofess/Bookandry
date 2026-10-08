import { nextReset } from '@/domain/long-credit';
import type { Transaction } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import type { BookandryDB } from './db';
import { LOCK_SYNC, withLock } from './lock';

/** A long קרדיט still following prime: the only rows the sweep can write. */
const following = (tx: Transaction): boolean =>
  tx.isDeleted === 0 &&
  tx.recurrence.type === 'monthly' &&
  tx.recurrence.reset !== undefined &&
  tx.recurrence.reset.frozen !== true;

/**
 * Re-price every long קרדיט that follows prime at `primePercent`, and freeze
 * each one whose reset payment is due by `today` (`nextReset`).
 *
 * TRACKED, unlike the catalog refresh: a frozen payment must reach every
 * device, so one that was offline when the payment fell due takes the value
 * frozen by a device that saw it, rather than working out its own from a
 * later prime. What keeps a tracked write from undoing newer edits:
 *
 * - the rows are found first, outside any lock; then, under LOCK_SYNC, each is
 *   read afresh and worked out again inside one transaction, so a pull can
 *   land before the read but never between the read and the write;
 * - only `recurrence.reset` changes, and the rest of the row is the fresh one;
 * - a row frozen already - here or anywhere - is never touched again;
 * - a row whose values have not changed is not written at all;
 * - a row it writes is stamped `now`, like every other background writer
 *   (reconvert, rebase), so an Undo offered before the sweep sees the row has
 *   changed since and refuses rather than put the old price back. Sync is
 *   decided by the server's `rev`, not this stamp, and the stamp is written in
 *   the same transaction as the reset, under the same lock.
 *
 * Run once the first sync of a start has pulled (or at start, on a device
 * with no account), and whenever prime changes. Resolves to the rows written.
 *
 * `freeze: false` re-prices but freezes nothing: the caller's prime is out of
 * date (a device back after weeks away, before its fetch has answered), and a
 * frozen payment is for good. The sweep after the fetch freezes it.
 */
export async function sweepLongCredit(
  db: BookandryDB,
  primePercent: string,
  today: LocalDate,
  now: IsoInstant,
  opts: { readonly freeze?: boolean } = {},
): Promise<number> {
  const ids = await db.transactions.filter(following).primaryKeys();
  if (ids.length === 0) return 0;

  return withLock(LOCK_SYNC, () =>
    db.transaction('rw', db.transactions, async () => {
      let written = 0;
      for (const id of ids) {
        const row = await db.transactions.get(id);
        // Frozen, deleted or changed meanwhile: `nextReset` has nothing for it.
        if (row?.recurrence.type !== 'monthly') continue;
        const reset = nextReset(row, primePercent, today, opts);
        if (reset === undefined) continue;
        await db.transactions.update(id, { recurrence: { ...row.recurrence, reset }, updatedAt: now });
        written += 1;
      }
      return written;
    }),
  );
}
