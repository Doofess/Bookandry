import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import type { MonthBills } from '@/domain/month-bills';
import { formatLocalDate } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type MonthSheetProps = {
  readonly month: LocalDate;
  readonly today: LocalDate;
  /** The feed's own occurrences for the month (layer B), unfiltered. */
  readonly occurrences: readonly Occurrence[] | undefined;
  readonly bills: MonthBills | undefined;
  readonly currency: Currency;
  /** The next income into any account, for the note. */
  readonly nextIncome: { readonly name: string; readonly date: LocalDate } | undefined;
  /** "Expected this month" with its breakdown, kept from the old hero. */
  readonly forecast: ReactNode;
  /** The month picker, shown in this sheet on a phone (the desktop's is in the top bar). */
  readonly monthPicker: ReactNode;
};

/** Task 8 draws the month sheet; until then it is the sapphire sheet with its title, the picker and the forecast. */
export function MonthSheet({ month, forecast, monthPicker }: MonthSheetProps) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet kind="sapphire" data-slot="month-sheet">
      <SheetHead
        title={t('board.monthTitle', { month: formatLocalDate(month, i18n.language, { month: 'long' }) })}
      />
      {monthPicker}
      <div className="mt-3">{forecast}</div>
    </Sheet>
  );
}
