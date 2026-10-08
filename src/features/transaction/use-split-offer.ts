import type { ResolvedCard } from '@/data/card-catalog/resolve';
import { splitRuleFor, type SplitRule } from '@/domain/split-purchase';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { useResolvedCards } from './use-transaction-sheet';

/** A row that can be split into payments, and the card that would split it. */
export type SplitOffer = {
  readonly occurrence: Occurrence;
  readonly method: PaymentMethod;
  readonly resolved: ResolvedCard;
  readonly rule: SplitRule;
};

const NONE: readonly PaymentMethod[] = [];

/**
 * Whether a row's menu offers "Split into payments": a saved one-time
 * purchase on a card linked to the catalog whose company splits purchases.
 *
 * The catalog is fetched (its own chunk) only for a row that could be split,
 * and only while its menu is open. Until it has loaded - and if it cannot be -
 * nothing is offered.
 */
export function useSplitOffer(
  occurrence: Occurrence | undefined,
  methods: ReadonlyMap<string, PaymentMethod> | undefined,
): SplitOffer | undefined {
  const tx = occurrence?.transaction;
  const id = occurrence?.paymentMethodId;
  const method = id === undefined ? undefined : methods?.get(id);
  const candidate =
    tx?.kind === 'expense' && tx.recurrence.type === 'one_time' && method?.card?.catalog !== undefined
      ? method
      : undefined;
  const cards = useResolvedCards(candidate === undefined ? NONE : [candidate]);
  const resolved = candidate === undefined ? undefined : cards.get(candidate.id);
  const rule = tx === undefined ? undefined : splitRuleFor(tx, candidate, resolved);
  return occurrence === undefined || candidate === undefined || resolved === undefined || rule === undefined
    ? undefined
    : { occurrence, method: candidate, resolved, rule };
}
