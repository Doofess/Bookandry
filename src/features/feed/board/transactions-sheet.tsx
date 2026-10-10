import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';

export type TransactionsSheetProps = {
  /** Rows in the month, for the subtitle. */
  readonly count: number;
  readonly filterBar: ReactNode;
  /** The full virtualised feed on desktop; the recent rows on a phone (Task 12). */
  readonly list: ReactNode;
  /** The round arrow to the full list, on a phone. */
  readonly onAll?: () => void;
};

/**
 * Task 10 draws the concept's rows; until then the old list sits on a paper sheet. It keeps its
 * own width, and the sheet does not clip, so the day headers can still pin.
 */
export function TransactionsSheet({ count, filterBar, list }: TransactionsSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet kind="paper" data-slot="transactions-sheet" className="overflow-visible px-1! pb-4! sm:px-4!">
      <SheetHead title={t('board.transactionsTitle')} subtitle={t('board.transactionsSub', { count })} />
      <div className="mt-3">{filterBar}</div>
      <div className="mt-3">{list}</div>
    </Sheet>
  );
}
