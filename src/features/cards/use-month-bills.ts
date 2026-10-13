import { useMemo } from 'react';

import { monthBills, type MonthBills } from '@/domain/month-bills';
import { methodOwnedBy } from '@/domain/tx-options';
import { ALL_PROFILES } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

import { useCardsData } from './use-cards-data';

/** The selected month's card bills for the person in view (or everyone), live. */
export function useMonthBills(
  today: LocalDate,
  currency: Currency,
  profileId: string,
  selectedMonth: LocalDate = today,
): MonthBills | undefined {
  const data = useCardsData(selectedMonth, currency);
  return useMemo(() => {
    if (data === undefined) return undefined;
    const mine = [...data.cards, ...data.archived].filter(
      (card) => profileId === ALL_PROFILES || methodOwnedBy(card, profileId),
    );
    return monthBills(mine, data.occurrences, today, selectedMonth);
  }, [data, today, profileId, selectedMonth]);
}
