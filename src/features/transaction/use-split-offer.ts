import type { ResolvedCard } from '@/data/card-catalog/resolve';
import { splitAvailability, type SplitRule } from '@/domain/split-purchase';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { useResolvedCards } from './use-transaction-sheet';

/** A row that can be split into payments, and the card that would split it. */
export type SplitOffer = {
  readonly occurrence: Occurrence;
  readonly method: PaymentMethod;
  readonly resolved: ResolvedCard;
  readonly rule: SplitRule;
  /** The card's billing day, which dates the first payment. */
  readonly billingDay: number;
};

/** What a row's menu says about splitting it: the offer, or that the card needs its billing day first. */
export type SplitMenu =
  { readonly kind: 'offer'; readonly offer: SplitOffer } | { readonly kind: 'needs_billing_day' };

const NONE: readonly PaymentMethod[] = [];

/**
 * Whether a row's menu offers "Split into payments": a saved one-time
 * purchase on a card linked to the catalog whose company splits purchases,
 * and whose billing day is set - without one there is no bill to date the
 * first payment by, so the menu says to set it instead.
 *
 * The catalog is fetched (its own chunk) only for a row that could be split,
 * and only while its menu is open. Until it has loaded - and if it cannot be -
 * nothing is said at all.
 */
export function useSplitOffer(
  occurrence: Occurrence | undefined,
  methods: ReadonlyMap<string, PaymentMethod> | undefined,
): SplitMenu | undefined {
  const tx = occurrence?.transaction;
  const id = occurrence?.paymentMethodId;
  const method = id === undefined ? undefined : methods?.get(id);
  const candidate =
    tx?.kind === 'expense' && tx.recurrence.type === 'one_time' && method?.card?.catalog !== undefined
      ? method
      : undefined;
  const cards = useResolvedCards(candidate === undefined ? NONE : [candidate]);
  const resolved = candidate === undefined ? undefined : cards.get(candidate.id);
  if (occurrence === undefined || candidate === undefined || resolved === undefined) return undefined;
  const available = splitAvailability(occurrence.transaction, candidate, resolved);
  if (available?.kind !== 'ready') return available;
  return {
    kind: 'offer',
    offer: {
      occurrence,
      method: candidate,
      resolved,
      rule: available.rule,
      billingDay: available.billingDay,
    },
  };
}
