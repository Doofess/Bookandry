import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { panelIconButton } from '@/components/brand-panel';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isAtHorizon, monthGrid, yearBounds } from '@/domain/feed-filters';
import { formatLocalDate, parseLocalDate, startOfMonth } from '@/lib/dates';
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
  onPick,
  tone = 'plain',
}: {
  month: LocalDate;
  today: LocalDate;
  onStep: (delta: number) => void;
  /** Jump to a month; without it the label stays plain text. */
  onPick?: (month: LocalDate) => void;
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
        className={cn('font-semibold whitespace-nowrap', onPanel ? 'text-sm' : 'text-base')}
        aria-live="polite"
      >
        {onPick === undefined ? (
          <span className={onPanel ? 'px-1' : undefined}>{label}</span>
        ) : (
          <MonthPicker month={month} today={today} label={label} onPick={onPick} onPanel={onPanel} />
        )}
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

/**
 * The month label as a button: a year stepper, the year's months in a 4×3
 * grid in reading order, and the way back to this month. The month being
 * viewed is filled sapphire; this month has a sapphire outline; months still
 * to come are muted, and months past the forecast are disabled.
 */
function MonthPicker({
  month,
  today,
  label,
  onPick,
  onPanel,
}: {
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly label: string;
  readonly onPick: (month: LocalDate) => void;
  readonly onPanel: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => parseLocalDate(month).year);
  const bounds = yearBounds(today);
  const thisMonth = startOfMonth(today);

  const pick = (next: LocalDate): void => {
    setOpen(false);
    onPick(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Every opening starts on the year being viewed.
        if (next) setYear(parseLocalDate(month).year);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        className={cn(
          'min-h-11 rounded-full px-2 focus-visible:outline-none sm:min-h-9',
          onPanel
            ? 'hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60'
            : 'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent arrow align="center" className="w-72 gap-3" aria-label={t('month.choose')}>
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label={t('month.prevYear')}
            disabled={year <= bounds.first}
            onClick={() => {
              setYear(year - 1);
            }}
          >
            <ChevronLeft className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
          </Button>
          <span className="text-base font-semibold tabular-nums">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label={t('month.nextYear')}
            disabled={year >= bounds.last}
            onClick={() => {
              setYear(year + 1);
            }}
          >
            <ChevronRight className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
          </Button>
        </div>

        {/* A grid follows the page's direction, so Hebrew reads January at the right. */}
        <div role="group" aria-label={String(year)} className="grid grid-cols-4 gap-1.5">
          {monthGrid(year, today).map((cell) => {
            const selected = cell.month === month;
            return (
              <button
                key={cell.month}
                type="button"
                aria-pressed={selected}
                disabled={cell.state === 'beyond' || cell.state === 'before'}
                title={
                  cell.state === 'beyond'
                    ? t('month.beyond')
                    : cell.state === 'before'
                      ? t('month.before')
                      : undefined
                }
                onClick={() => {
                  pick(cell.month);
                }}
                className={cn(
                  'min-h-11 rounded-xl text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-40',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : cn(
                        'hover:bg-accent',
                        cell.state === 'forecast' ? 'text-muted-foreground' : 'text-foreground',
                        cell.isThisMonth ? 'ring-1 ring-primary-ink' : null,
                      ),
                )}
              >
                {formatLocalDate(cell.month, i18n.language, { month: 'short' })}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full text-primary-ink sm:min-h-9"
          disabled={month === thisMonth}
          onClick={() => {
            pick(thisMonth);
          }}
        >
          {t('month.thisMonth')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
