import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { isAtHorizon } from '@/domain/feed-filters';
import { formatLocalDate } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * The month cursor.
 *
 * It owns the whole screen's range: summary cards, feed window and chart move
 * together. Without it, filtering the feed to August leaves the header still
 * reporting September - a self-contradiction visible in one glance, and the
 * reason month-end review (the actual retention loop of a finance app) was
 * impossible.
 *
 * The chevrons are DIRECTIONAL, so they carry `rtl:rotate-180` with shadcn's
 * `cn-rtl-flip` marker: "previous" is left in English and right in Hebrew. The
 * icon NAMES stay `ChevronLeft`/`ChevronRight` because the rotation is applied
 * in CSS, not by swapping components - swapping would mirror correctly and then
 * silently stop the day someone reorders the JSX.
 */
export function MonthCursor({
  month,
  today,
  onStep,
}: {
  month: LocalDate;
  today: LocalDate;
  onStep: (delta: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const label = formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' });
  const atHorizon = isAtHorizon(month, today);

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('month.previous')}
        onClick={() => {
          onStep(-1);
        }}
      >
        <ChevronLeft className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
      </Button>

      {/* aria-live so stepping months announces the new one: the heading text
          changes in place, which a screen reader would otherwise not mention. */}
      <h2 className="text-base font-semibold" aria-live="polite">
        {label}
      </h2>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('month.next')}
        // Past the projection horizon there is nothing to show, so the control
        // is disabled with the reason rather than stepping into an empty month.
        disabled={atHorizon}
        title={atHorizon ? t('month.horizon') : undefined}
        onClick={() => {
          onStep(1);
        }}
      >
        <ChevronRight className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
      </Button>
    </div>
  );
}
