import { CATALOG_VERSION, loadCatalog } from '@/data/card-catalog';
import { resolveCard } from '@/data/card-catalog/resolve';
import { refreshLinkedCard } from '@/domain/card-catalog-link';
import type { IsoInstant, LocalDate } from '@/types/money';

import type { BookandryDB } from './db';
import { updatePaymentMethod } from './repos/payment-methods';

/**
 * Bring cards linked to an older catalog release up to date.
 *
 * Run after start, unawaited. The catalog is fetched (a chunk of its own)
 * only when some card is behind it. Each changed card is written through
 * `updatePaymentMethod`, a tracked write, so it syncs like any edit; every
 * device computes the same card from the same release, so they converge, and
 * a device that pulls the refreshed card first finds nothing left to do.
 * Resolves to the number of cards written.
 */
export async function refreshCatalogCards(
  db: BookandryDB,
  today: LocalDate,
  now: IsoInstant,
): Promise<number> {
  const behind = (await db.paymentMethods.toArray()).filter(
    (m) => m.card?.catalog !== undefined && m.card.catalog.version < CATALOG_VERSION,
  );
  if (behind.length === 0) return 0;

  const catalog = await loadCatalog();
  let written = 0;
  for (const method of behind) {
    const card = method.card;
    if (!card?.catalog) continue;
    const next = refreshLinkedCard(card, resolveCard(catalog, card.catalog), today);
    if (!next) continue;
    await updatePaymentMethod(db, method.id, { card: next }, now);
    written += 1;
  }
  return written;
}
