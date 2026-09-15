import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { availableBalance } from '@/domain/calculators';
import { expandOccurrences } from '@/domain/occurrences';
import { compareLocal } from '@/lib/dates';
import { ALL_PROFILES, type Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

export type BalanceState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly minor: Minor;
      readonly since: LocalDate;
      readonly profiles: readonly Profile[];
    }
  /** A profile's opening balance is in a currency we have no rate for. */
  | { readonly status: 'blocked'; readonly currencies: readonly Currency[] };

/**
 * The hero number, with its own query.
 *
 * It cannot ride on the feed's data. The feed shows ONE MONTH; the balance is
 * every occurrence from the opening date - potentially 2015 - to today. Sharing
 * a memo would either make the feed load a decade or make the balance wrong,
 * and the second failure is invisible.
 *
 * The window ends at TODAY, never later, which is what makes projected
 * occurrences excluded by construction: there is no `isProjected` check here or
 * anywhere downstream, because a boundary checked in two places is a boundary
 * that eventually disagrees with itself.
 */
export function useBalance(profileId: string, today: LocalDate, baseCurrency: Currency): BalanceState {
  const state = useLiveQuery(async (): Promise<BalanceState> => {
    const all = await db.profiles.toArray();
    const profiles = profileId === ALL_PROFILES ? all : all.filter((p) => p.id === profileId);

    if (profiles.length === 0) {
      return { status: 'ready', minor: 0, since: today, profiles: [] };
    }

    const missing = [
      ...new Set(
        profiles
          .filter((p) => p.openingBalanceCurrency !== baseCurrency)
          .map((p) => p.openingBalanceCurrency),
      ),
    ];
    if (missing.length > 0) {
      // Better to say so than to render a confident number that is wrong by
      // whatever the exchange rate happens to be.
      return { status: 'blocked', currencies: missing };
    }

    const since = profiles.reduce<LocalDate>(
      (earliest, p) => (compareLocal(p.openingBalanceDate, earliest) < 0 ? p.openingBalanceDate : earliest),
      profiles[0]?.openingBalanceDate ?? today,
    );

    // Nothing has happened yet: the window would end before it began.
    if (compareLocal(since, today) > 0) {
      return { status: 'ready', minor: sumOpening(profiles), since, profiles };
    }

    const transactions = await findCandidates(db, { profileId, from: since, to: today });
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );
    const byTransaction = new Map<string, typeof overrides>();
    for (const override of overrides) {
      const list = byTransaction.get(override.transactionId);
      if (list === undefined) byTransaction.set(override.transactionId, [override]);
      else list.push(override);
    }

    const cutoffs = new Map(profiles.map((p) => [p.id, p.openingBalanceDate]));

    const occurrences = transactions.flatMap((tx) =>
      expandOccurrences(tx, byTransaction.get(tx.id) ?? [], since, today, {
        today,
        // Each profile's cutoff applies to ITS OWN rows only. A shared cutoff
        // would either discard a second profile's history or resurrect the
        // first profile's.
        openingBalanceDate: cutoffs.get(tx.profileId),
      }),
    );

    return {
      status: 'ready',
      minor: availableBalance({ profiles, occurrences, baseCurrency }),
      since,
      profiles,
    };
  }, [profileId, today, baseCurrency]);

  return state ?? { status: 'loading' };
}

function sumOpening(profiles: readonly Profile[]): Minor {
  return profiles.reduce((total, p) => total + p.openingBalanceMinor, 0);
}
