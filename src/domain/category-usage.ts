import type { Category, Occurrence } from '@/types/domain';
import type { Kind } from '@/types/money';

import { categoriesFor } from './tx-options';

/**
 * The categories a row's category pop-out offers: the ones of its kind used
 * most often in the occurrences given, then the rest in the list's own order,
 * `count` of them. The row's current category is always among them; when it
 * is not used often enough, it takes the last place.
 */
export function frequentCategories(
  occurrences: readonly Occurrence[],
  categories: readonly Category[],
  kind: Kind,
  currentId: string,
  count = 7,
): readonly Category[] {
  const uses = new Map<string, number>();
  for (const o of occurrences) {
    if (o.transaction.kind === kind) uses.set(o.categoryId, (uses.get(o.categoryId) ?? 0) + 1);
  }
  const listed = categoriesFor(categories, kind, currentId);
  const order = new Map(listed.map((c, i) => [c.id, i]));
  const ranked = [...listed].sort(
    (a, b) =>
      (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  const top = ranked.slice(0, count);
  const current = listed.find((c) => c.id === currentId);
  if (current === undefined || top.some((c) => c.id === currentId)) return top;
  return [...top.slice(0, count - 1), current];
}
