import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Chip } from '@/components/ui/chip';
import { Mark } from '@/components/ui/mark';
import { Numeral } from '@/components/ui/numeral';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { summariseRange } from '@/domain/calculators';
import { cardKey } from '@/domain/money-key';
import type { MonthBills } from '@/domain/month-bills';
import { issuerLabel } from '@/features/cards/issuer-label';
import { figureParts, formatMoney } from '@/i18n/money-format';
import {
  compareLocal,
  daysInMonth,
  endOfMonth,
  formatLocalDate,
  parseLocalDate,
  startOfMonth,
} from '@/lib/dates';
import { ratioPercent, wholeMinor } from '@/lib/money';
import type { Occurrence } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

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

/** A whole-unit figure as the concept draws it (₪23,900): the sign, the symbol, the digits; the exact amount for a screen reader. */
function Whole({ minor, currency, className }: { minor: Minor; currency: Currency; className?: string }) {
  const { i18n } = useTranslation();
  const whole = wholeMinor(minor, currency);
  const parts = figureParts(whole, currency, { locale: i18n.language, whole: true });
  return (
    <>
      <span aria-hidden="true" dir="ltr" className={cn('[unicode-bidi:isolate]', className)}>
        {parts.sign}
        {parts.symbol}
        {parts.digits}
      </span>
      <span className="sr-only">{formatMoney(minor, currency, { locale: i18n.language }).aria}</span>
    </>
  );
}

/**
 * The month (§5.1): the sapphire sheet, the app's own colour (§1.2). In and
 * out as rows with 2px tint lines, a track for the share spent, a note with
 * that share in the box, the card charges by day (the day in Karantina, the
 * companies as chips, a charged day struck through and dimmed), then "left
 * this month" as the huge numeral running off the foot.
 */
export function MonthSheet({
  month,
  today,
  occurrences,
  bills,
  currency,
  nextIncome,
  forecast,
  monthPicker,
}: MonthSheetProps) {
  const { t, i18n } = useTranslation('common');
  const { t: tCards } = useTranslation('cards');
  const current = startOfMonth(month) === startOfMonth(today);
  const upTo = current ? today : endOfMonth(month);
  const so =
    occurrences === undefined
      ? undefined
      : summariseRange(
          occurrences.filter((o) => !o.isProjected && !o.isSkipped && compareLocal(o.date, upTo) <= 0),
        );
  const percent = so === undefined ? 0 : ratioPercent(so.expenseMinor, so.incomeMinor);
  const shown = `${String(percent)}%`;
  const { year, month: m, day } = parseLocalDate(today);
  const name = formatLocalDate(month, i18n.language, { month: 'long' });
  const short = (date: LocalDate) => formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short' });

  return (
    <div className="relative h-full">
      <Sheet kind="sapphire" bleed data-slot="month-sheet" className="flex h-full flex-col gap-3.5">
        <SheetHead
          className="mt-1.5 [&_[data-slot=title-pair]>span]:mt-3.5"
          title={t(current ? 'board.monthTitle' : 'board.monthTitlePast', { month: name })}
          subtitle={current ? t('board.monthDay', { day, days: daysInMonth(year, m) }) : undefined}
        />
        {monthPicker}
        {so === undefined ? null : (
          <>
            <dl className="grid gap-1.5 text-[1.0625rem]">
              {(
                [
                  ['in', so.incomeMinor],
                  ['out', so.expenseMinor],
                ] as const
              ).map(([key, minor]) => (
                <div key={key} className="flex justify-between gap-3 border-be-2 border-border py-1.5">
                  <dt>{t(`board.${key}`)}</dt>
                  <dd className="font-semibold">
                    <Whole minor={minor} currency={currency} />
                  </dd>
                </div>
              ))}
            </dl>
            <div
              role="img"
              aria-label={t('board.track', { percent: shown })}
              className="h-3.5 rounded-full border-2 border-current p-0.5"
            >
              <i
                className="block h-full rounded-full bg-current"
                style={{ inlineSize: `${String(Math.min(100, percent))}%` }}
              />
            </div>
            <p className="text-base leading-[1.75] font-light">
              <Trans i18nKey="board.note" values={{ percent: shown }} components={{ box: <Mark /> }} />
              {nextIncome === undefined
                ? null
                : ` ${t('board.noteNext', { name: nextIncome.name, date: short(nextIncome.date) })}`}
            </p>
          </>
        )}
        {/* The charges are this calendar month's: shown only on it. */}
        {!current || bills === undefined || bills.days.length === 0 ? null : (
          // Safari drops list semantics from a list with list-style none.
          // eslint-disable-next-line jsx-a11y/no-redundant-roles -- deliberate
          <ul
            role="list"
            aria-label={t('board.charges')}
            // The chips here ring in the sheet's tint at 55% (§9.2).
            className="grid gap-1.5 [--chip-ring:color-mix(in_oklch,var(--on-fill)_55%,transparent)]"
          >
            {bills.days.map((charge) => (
              <li
                key={charge.date}
                // A charged day is dimmed: 78% in light (4.75:1, deviation D-1), the concept's 72% in dark (4.85:1).
                className={cn(
                  'grid min-h-9 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 text-[0.9375rem]',
                  charge.charged && 'opacity-78 dark:opacity-72',
                )}
              >
                <span className="text-center font-display text-[2.125rem] leading-[0.8]">
                  {parseLocalDate(charge.date).day}
                </span>
                <span className="flex min-w-0 gap-1.5">
                  {charge.bills.map((bill) => (
                    <Chip key={bill.card.id} moneyKey={cardKey(bill.card)} className="min-h-5 max-w-20 px-2">
                      <span className="truncate">{issuerLabel(bill.card, tCards)}</span>
                    </Chip>
                  ))}
                </span>
                <span className="font-semibold">
                  <Whole
                    minor={charge.totalMinor}
                    currency={currency}
                    className={cn(charge.charged && 'line-through decoration-2')}
                  />
                  {charge.charged ? <span className="sr-only"> ({t('board.charged')})</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {so === undefined ? null : (
          <div data-slot="month-left" className="-mx-sheet-x mt-auto">
            <p className="px-sheet-x text-[1.0625rem] font-semibold">{t('board.left')}</p>
            <div className="ps-4">
              <div className="-mx-sheet-x -mb-0.5 ps-4">
                <Numeral minor={so.incomeMinor - so.expenseMinor} currency={currency} size="left" rounded />
              </div>
            </div>
          </div>
        )}
      </Sheet>
      {forecast === null ? null : (
        <div data-slot="month-forecast" className="absolute inset-x-0 top-full px-1 pt-2">
          {forecast}
        </div>
      )}
    </div>
  );
}
