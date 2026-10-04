import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { expandOccurrences } from '@/domain/occurrences';
import { addMonthsClamped, endOfMonth, startOfMonth } from '@/lib/dates';
import { ALL_PROFILES, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/** How far back the bill history goes. */
const HISTORY_MONTHS = 6;
/**
 * How far ahead: far enough for the longest plan a card writes - 60
 * instalments - since every payment still to come counts against the limit.
 */
const AHEAD_MONTHS = 60;

export type CardsData = {
  readonly cards: readonly PaymentMethod[];
  readonly profiles: ReadonlyMap<string, Profile>;
  /** Every occurrence paid by one of the cards, in the window. */
  readonly occurrences: readonly Occurrence[];
};

/** The household's credit cards, and what has been and will be charged to them. */
export function useCardsData(today: LocalDate): CardsData | undefined {
  return useLiveQuery(async () => {
    const methods = await db.paymentMethods.toArray();
    const cards = methods
      .filter((m) => m.type === 'credit_card' && m.isArchived === 0)
      .sort((a, b) => a.label.localeCompare(b.label));
    const profiles = new Map((await db.profiles.toArray()).map((p) => [p.id, p]));
    if (cards.length === 0) return { cards, profiles, occurrences: [] };

    const ids = new Set(cards.map((c) => c.id));
    const from = startOfMonth(addMonthsClamped(today, -HISTORY_MONTHS, 1));
    const to = endOfMonth(addMonthsClamped(today, AHEAD_MONTHS, 1));
    const transactions = await findCandidates(db, { profileId: ALL_PROFILES, from, to });
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );
    const occurrences = transactions
      .flatMap((tx) =>
        expandOccurrences(
          tx,
          overrides.filter((o) => o.transactionId === tx.id),
          from,
          to,
          { today },
        ),
      )
      .filter((o) => o.paymentMethodId !== undefined && ids.has(o.paymentMethodId));

    return { cards, profiles, occurrences };
  }, [today]);
}
