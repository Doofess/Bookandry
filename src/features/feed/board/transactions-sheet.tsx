import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';

export type TransactionsSheetProps = {
  /** Rows in the month, for the subtitle. */
  readonly count: number;
  readonly filterBar: ReactNode;
  /** The recent rows on the board; the whole virtualised month in list mode. */
  readonly list: ReactNode;
  /** The round arrow to the whole month. */
  readonly onAll?: () => void;
  /** In list mode: the round arrow back to the board. */
  readonly onBack?: () => void;
};

/**
 * The transactions (§5.1): the paper sheet with its title pair, the filter
 * bar, and the list - on desktop the whole virtualised feed, on a phone the
 * recent rows with a round arrow to all of them (Task 12).
 */
export function TransactionsSheet({ count, filterBar, list, onAll, onBack }: TransactionsSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet kind="paper" data-slot="transactions-sheet" className="grid gap-1">
      <SheetHead
        // The concept sets this head in its body line-height, with 4px above the subtitle.
        className="[&_h2]:leading-[1.4] [&_h2>span]:mt-1"
        title={t('board.transactionsTitle')}
        subtitle={t('board.transactionsSub', { count })}
        action={
          onAll !== undefined ? (
            <Button variant="round" onClick={onAll} aria-label={t('board.allTransactions')}>
              <ArrowRight className="rtl:-scale-x-100" aria-hidden="true" />
            </Button>
          ) : onBack !== undefined ? (
            <Button variant="round" onClick={onBack} aria-label={t('board.backToBoard')}>
              <ArrowLeft className="rtl:-scale-x-100" aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
      {filterBar === null || filterBar === undefined ? null : <div className="mt-2">{filterBar}</div>}
      {list}
    </Sheet>
  );
}
