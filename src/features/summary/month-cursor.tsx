import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { panelIconButton } from '@/components/brand-panel';
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
 * On the feed's panel (`tone="panel"`) it is one outlined pill, ‹ month ›.
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
  tone = 'plain',
}: {
  month: LocalDate;
  today: LocalDate;
  onStep: (delta: number) => void;
  tone?: 'plain' | 'panel';
}) {
  const { t, i18n } = useTranslation();
  const label = formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' });
  const atHorizon = isAtHorizon(month, today);
  const onPanel = tone === 'panel';
  const arrow = onPanel ? panelIconButton : undefined;

  return (
    <div
      className={cn(
        onPanel
          ? 'inline-flex items-center rounded-full border border-white/35 text-brand-deep-foreground'
          : 'flex items-center justify-between gap-2',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={arrow}
        aria-label={t('month.previous')}
        onClick={() => {
          onStep(-1);
        }}
      >
        <ChevronLeft className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
      </Button>

      {/* aria-live so stepping months announces the new one: the heading text
          changes in place, which a screen reader would otherwise not mention. */}
      <h2
        className={cn('font-semibold whitespace-nowrap', onPanel ? 'px-1 text-sm' : 'text-base')}
        aria-live="polite"
      >
        {label}
      </h2>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={arrow}
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
