import { useTranslation } from 'react-i18next';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { formatLocalDate } from '@/lib/dates';
import type { Category, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type CategoriesSheetProps = {
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly occurrences: readonly Occurrence[] | undefined;
  readonly categories: ReadonlyMap<string, Category> | undefined;
  readonly currency: Currency;
  /** 10 bars on the board, 7 on a phone (§1.4). */
  readonly limit: number;
};

/** Task 9 draws the bars; until then it is the paper sheet with its title. */
export function CategoriesSheet({ month }: CategoriesSheetProps) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet kind="paper" data-slot="categories-sheet">
      <SheetHead
        title={t('board.categoriesTitle', {
          month: formatLocalDate(month, i18n.language, { month: 'long' }),
        })}
      />
    </Sheet>
  );
}
