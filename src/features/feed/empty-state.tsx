import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { EmptyReason } from '@/domain/feed';
import { formatLocalDate } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * Four empty states, not one.
 *
 * "Nothing here" answers none of the questions a user actually has, and the
 * questions are different each time: a brand-new install wants to know what to
 * do next, an empty month wants to know whether it is looking at the right
 * month, and a filtered-out list wants a way back. One message for three
 * situations is a message for none of them.
 */
export function EmptyState({
  reason,
  month,
  onClearFilters,
}: {
  reason: EmptyReason;
  month: LocalDate;
  onClearFilters?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const monthLabel = formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' });

  const copy = {
    no_data: { title: t('feed.emptyNoDataTitle'), body: t('feed.emptyNoDataBody') },
    empty_month: {
      title: t('feed.emptyMonthTitle', { month: monthLabel }),
      body: t('feed.emptyMonthBody'),
    },
    no_results: {
      title: t('feed.emptyResultsTitle'),
      body: t('feed.emptyResultsBody', { month: monthLabel }),
    },
  }[reason];

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-base font-medium">{copy.title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{copy.body}</p>
      {reason === 'no_results' && onClearFilters !== undefined ? (
        <Button type="button" variant="outline" className="mt-2 h-11" onClick={onClearFilters}>
          {t('feed.clearFilters')}
        </Button>
      ) : null}
    </div>
  );
}
