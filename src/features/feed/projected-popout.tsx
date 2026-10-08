import { CalendarDays, ChevronLeft, Clock, PencilLine } from 'lucide-react';
import { type ComponentProps, type Ref, useEffect, useRef, useState } from 'react';
import { he, enUS } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { PopupItemContent, useAnchoredPopup } from '@/components/ui/popup-parts';
import { movableRange } from '@/domain/feed-filters';
import { compareLocal, formatLocalDate, fromPickerDate, startOfMonth, toPickerDate } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

export type ProjectedTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement };

/** The calendar's year menu, as the date field's: back to a standing order from years ago. */
const FIRST_MONTH = new Date(1990, 0);

/**
 * "Not counted yet", answered from the chip: it was charged today, it is a
 * different amount, or it is on a different day. ONE pop-out at screen level,
 * anchored to the chip that opened it, like the row menu and the category.
 */
export function ProjectedPopout({
  target,
  today,
  onClose,
  onMove,
  onAmount,
}: {
  /** The row whose chip was tapped, with that chip; undefined when closed. */
  readonly target: ProjectedTarget | undefined;
  readonly today: LocalDate;
  readonly onClose: () => void;
  readonly onMove: (occurrence: Occurrence, to: LocalDate) => void;
  readonly onAmount: (occurrence: Occurrence) => void;
}) {
  const { t } = useTranslation();
  const { shown, anchor, popupRef, finalFocus } = useAnchoredPopup(target, onClose);

  return (
    <Popover
      open={target !== undefined}
      // Not modal: a modal pop-out locks the page's scroll, and this one closes
      // on scroll (it has an arrow). Its backdrop still catches a tap outside.
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={anchor}
        arrow
        closeOnScroll
        side="bottom"
        align="start"
        className="w-auto min-w-64 p-1.5"
        data-testid="projected-popout"
        ref={popupRef}
        finalFocus={finalFocus}
      >
        <PopoverTitle className="px-2.5 pt-1.5">{t('summary.notCountedYet')}</PopoverTitle>
        {shown === undefined ? null : (
          <Choices
            // A fresh set for each row: an open calendar never carries over.
            key={shown.occurrence.key}
            occurrence={shown.occurrence}
            today={today}
            onMove={onMove}
            onAmount={onAmount}
            onClose={onClose}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Choices({
  occurrence,
  today,
  onMove,
  onAmount,
  onClose,
}: {
  readonly occurrence: Occurrence;
  readonly today: LocalDate;
  readonly onMove: (occurrence: Occurrence, to: LocalDate) => void;
  readonly onAmount: (occurrence: Occurrence) => void;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [picking, setPicking] = useState(false);
  const { first: earliest, last } = movableRange(occurrence, today);
  const notStarted = earliest !== undefined && compareLocal(today, earliest) < 0;
  const rtl = i18n.dir() === 'rtl';

  /*
   * The calendar takes focus on its day, so a keyboard user lands on it
   * rather than on nothing. Without scrolling: the pop-out has just grown, and
   * a scroll to bring the day into view would close it (it closes on scroll).
   */
  const calendar = useRef<HTMLDivElement>(null);
  // Back from the calendar, focus returns to the choice that opened it.
  const dateChoice = useRef<HTMLButtonElement>(null);
  const cameBack = useRef(false);
  useEffect(() => {
    if (!picking) {
      if (cameBack.current) dateChoice.current?.focus({ preventScroll: true });
      return;
    }
    const days = calendar.current;
    (
      days?.querySelector<HTMLElement>('[data-selected] button') ??
      days?.querySelector<HTMLElement>('[data-day] button:not([disabled])')
    )?.focus({ preventScroll: true });
  }, [picking]);

  if (picking) {
    return (
      <div ref={calendar} className="flex flex-col">
        {/* Escape still closes the whole pop-out; this goes back one step. */}
        <button
          type="button"
          onClick={() => {
            cameBack.current = true;
            setPicking(false);
          }}
          className="flex min-h-11 items-center gap-1 self-start rounded-lg px-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {/* Directional: it points back, so it flips. */}
          <ChevronLeft className="cn-rtl-flip size-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
          {t('projected.back')}
        </button>
        <Calendar
          mode="single"
          // The row's own day picked again is "no change", not a deselection.
          required
          captionLayout="dropdown"
          startMonth={earliest === undefined ? FIRST_MONTH : toPickerDate(earliest)}
          endMonth={toPickerDate(startOfMonth(last))}
          // Local-midday Dates in, local dates out, as the date field does.
          selected={toPickerDate(occurrence.date)}
          defaultMonth={toPickerDate(occurrence.date)}
          disabled={[
            { after: toPickerDate(last) },
            ...(earliest === undefined ? [] : [{ before: toPickerDate(earliest) }]),
          ]}
          onSelect={(next: Date) => {
            const to = fromPickerDate(next);
            if (to === occurrence.date) onClose();
            else onMove(occurrence, to);
          }}
          locale={rtl ? he : enUS}
          dir={rtl ? 'rtl' : 'ltr'}
          aria-label={t('projected.date')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Choice
        icon={Clock}
        label={t('projected.today')}
        disabled={notStarted}
        hint={
          notStarted
            ? t('projected.notStarted', {
                date: formatLocalDate(earliest, i18n.language, { dateStyle: 'medium' }),
              })
            : t('projected.todayHint')
        }
        onClick={() => {
          onMove(occurrence, today);
        }}
      />
      <Choice
        icon={PencilLine}
        label={t('projected.amount')}
        onClick={() => {
          onAmount(occurrence);
        }}
      />
      <Choice
        ref={dateChoice}
        icon={CalendarDays}
        label={t('projected.date')}
        onClick={() => {
          setPicking(true);
        }}
      />
    </div>
  );
}

/** One choice: the row menu's item, as a button, since this pop-out is a dialog. */
function Choice({
  ref,
  disabled = false,
  onClick,
  ...content
}: ComponentProps<typeof PopupItemContent> & {
  readonly ref?: Ref<HTMLButtonElement>;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-start text-sm outline-hidden transition-colors select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0"
    >
      <PopupItemContent {...content} />
    </button>
  );
}
