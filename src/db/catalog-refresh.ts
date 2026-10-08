import { CATALOG_VERSION, loadCatalog } from '@/data/card-catalog';
import { resolveCard } from '@/data/card-catalog/resolve';
import { refreshLinkedCard } from '@/domain/card-catalog-link';
import type { PaymentMethod } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { withoutTracking, type BookandryDB } from './db';
import { LOCK_SYNC, withLock } from './lock';
import { updatePaymentMethod } from './repos/payment-methods';

const isBehind = (m: PaymentMethod): boolean =>
  m.card?.catalog !== undefined && m.card.catalog.version < CATALOG_VERSION;

/**
 * Bring cards linked to an older catalog release up to date.
 *
 * Run after start, unawaited. The catalog is fetched (a chunk of its own)
 * only when some card is behind it.
 *
 * The order is the one lock.ts sets for every read-compute-write over many
 * rows: the slow part (fetching the catalog) first, outside any lock; then,
 * under LOCK_SYNC, each card is read afresh and recomputed inside one
 * transaction. A pull can land while the catalog is fetched, but never
 * between a card's read and its write, so a pulled edit is never written over
 * with a value computed from the card as it was before.
 *
 * Untracked, like the other startup writes (`ensureBuiltinPaymentMethods`):
 * every device computes the same card from the same release, so nothing needs
 * sending. As a tracked edit, a device coming back after a while - signed out,
 * locked, offline - would push its refresh, made from its own older copy of
 * the card, with a newer rev than edits made meanwhile on other devices, and
 * last-write-wins would throw those edits away. Untracked, a newer card pulled
 * later simply replaces it, and the next start refreshes that one in turn.
 *
 * Resolves to the number of cards written.
 */
export async function refreshCatalogCards(
  db: BookandryDB,
  today: LocalDate,
  now: IsoInstant,
): Promise<number> {
  if (!(await db.paymentMethods.toArray()).some(isBehind)) return 0;
  const catalog = await loadCatalog();

  return withLock(LOCK_SYNC, () =>
    withoutTracking(db, [db.paymentMethods], async () => {
      let written = 0;
      for (const method of await db.paymentMethods.toArray()) {
        const card = method.card;
        if (!card?.catalog || !isBehind(method)) continue;
        const next = refreshLinkedCard(card, resolveCard(catalog, card.catalog), today);
        if (!next) continue;
        await updatePaymentMethod(db, method.id, { card: next }, now);
        written += 1;
      }
      return written;
    }),
  );
}
