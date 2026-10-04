import { cn } from 'cn';
import type { TFunction } from 'i18next';
import { HandCoins, Layers, MoreHorizontal, Percent, Repeat } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatars/avatar';
import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { recurrenceModeOf } from '@/domain/tx-edit';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate, monthsBetween } from '@/lib/dates';
import type { Category, Occurrence, Profile } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type RowContext = {
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly categories: ReadonlyMap<string, Category>;
  readonly profiles: ReadonlyMap<string, Profile>;
  /** Only in the merged view: one profile makes the avatar column noise. */
  readonly showProfile: boolean;
};

/**
 * A day header.
 *
 * `aria-hidden`, and the date is folded into each row's accessible name
 * instead. The header is a visual grouping device; announcing it as a heading
 * would make a screen reader read the date twice for the first row of every
 * day, and `role="list"` cannot legally contain one anyway.
 */
export function DayHeader({
  date,
  netMinor,
  isToday,
  currency,
  className,
}: {
  date: LocalDate;
  netMinor: number;
  isToday: boolean;
  currency: Currency;
  className?: string;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div
      aria-hidden="true"
      className={cn(
        // OPAQUE, not bg-background/95. A pinned header sits directly over a
        // half-scrolled row, and at 95% the row's text and chips bleed through
        // it - which reads as a rendering glitch rather than as translucency.
        'flex items-baseline justify-between gap-2 bg-background px-1 py-2',
        'text-sm font-medium text-muted-foreground',
        className,
      )}
    >
      <span>
        {isToday
          ? t('feed.today')
          : formatLocalDate(date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
      <Money minor={netMinor} currency={currency} signMode="always" announce={false} className="text-xs" />
    </div>
  );
}

/**
 * What kind of transaction a row belongs to, in the words the form used to make
 * it: "Standing order", "Payment 3 of 12", "Credit 3 of 12", "Loan 3 of 120".
 *
 * Nothing for a regular one-off - it is most of the feed, and a chip on every
 * row would drown the few that say something. The payment number is counted
 * from the slot, not the moved date: payment 3 moved into next month is still
 * payment 3.
 */
function rowType(
  occurrence: Occurrence,
  t: TFunction<['common', 'categories']>,
): { readonly label: string; readonly icon: typeof Repeat } | undefined {
  const { recurrence, kind, date } = occurrence.transaction;
  const mode = recurrenceModeOf(recurrence, kind);
  if (mode === 'one_time' || recurrence.type === 'one_time') return undefined;
  if (mode === 'installments' || mode === 'credit' || mode === 'loan') {
    const values = {
      index: monthsBetween(date, occurrence.originalDate) + 1,
      count: recurrence.type === 'monthly' ? (recurrence.installments ?? 0) : 0,
    };
    if (mode === 'loan') return { label: t('feed.typeLoan', values), icon: HandCoins };
    return mode === 'credit'
      ? { label: t('feed.typeCredit', values), icon: Percent }
      : { label: t('feed.typeInstallment', values), icon: Layers };
  }
  if (mode === 'standing_order') return { label: t('feed.typeStandingOrder'), icon: Repeat };
  return { label: t(mode === 'yearly' ? 'feed.typeYearly' : 'feed.typeMonthly'), icon: Repeat };
}

/**
 * One occurrence.
 *
 * `memo` is load-bearing, not decoration: `effectiveTransaction` returns the
 * row object BY REFERENCE when there is no override, so an unchanged row is
 * referentially identical between renders and skips re-rendering entirely. A
 * virtualizer re-measures every element it re-renders, so a feed that spreads
 * its rows unconditionally re-measures the whole viewport on any state change.
 */
export const TransactionRow = memo(function TransactionRow({
  occurrence,
  context,
  position,
  setSize,
  onOpen,
  onMenu,
}: {
  occurrence: Occurrence;
  context: RowContext;
  /**
   * 1-based index among the ROWS, and the total.
   *
   * A virtualised list has a handful of elements in the DOM out of hundreds, so
   * without these a screen reader announces "item 3 of 8" for a row that is
   * actually the 214th of 600.
   */
  position: number;
  setSize: number;
  onOpen?: (occurrence: Occurrence) => void;
  onMenu?: (occurrence: Occurrence) => void;
}) {
  const { t, i18n } = useTranslation(['common', 'categories']);

  const category = context.categories.get(occurrence.categoryId);
  const categoryName = category === undefined ? occurrence.categoryId : categoryDisplayName(category, t);

  const profile = context.profiles.get(occurrence.transaction.profileId);
  const isIncome = occurrence.transaction.kind === 'income';
  const type = rowType(occurrence, t);
  const signed = isIncome ? occurrence.money.baseAmountMinor : -occurrence.money.baseAmountMinor;

  // The date is part of the NAME, so the row is self-describing when the
  // aria-hidden day header above it is not announced.
  const dateLabel = formatLocalDate(occurrence.date, i18n.language, { dateStyle: 'medium' });
  // The profile is named only when its avatar is actually shown. Announcing
  // "Dana" while nothing on screen says Dana describes a different interface
  // from the one the sighted user is looking at.
  const label = [
    dateLabel,
    categoryName,
    occurrence.note,
    type?.label,
    context.showProfile ? profile?.name : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      role="listitem"
      aria-posinset={position}
      aria-setsize={setSize}
      className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', occurrence.isSkipped && 'opacity-50')}
      data-projected={occurrence.isProjected ? 'true' : undefined}
      data-key={occurrence.key}
    >
      <button
        type="button"
        onClick={() => onOpen?.(occurrence)}
        aria-label={label}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            isIncome ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          <CategoryIcon name={category?.icon ?? 'Circle'} className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{occurrence.note ?? categoryName}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {occurrence.note === undefined ? null : <span className="truncate">{categoryName}</span>}
            {type === undefined ? null : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">
                <type.icon className="size-3" aria-hidden="true" />
                {type.label}
              </span>
            )}
            {occurrence.isProjected ? (
              // Muted grey is not an explanation for an 18,000 salary sitting in
              // the feed and not in the balance.
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">
                {t('summary.notCountedYet')}
              </span>
            ) : null}
            {occurrence.isSkipped ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{t('feed.skipped')}</span>
            ) : null}
          </span>
        </span>

        {context.showProfile && profile !== undefined ? (
          <Avatar avatar={profile.avatar} color={profile.color} size="sm" />
        ) : null}

        <Money
          minor={signed}
          currency={context.currency}
          announce={false}
          className={cn('shrink-0 text-sm font-semibold', isIncome ? 'text-income' : 'text-foreground')}
        />
      </button>

      {/*
        Always present, never hover-revealed, and 44x44.
        Swipe is invisible to assistive tech and hover is invisible to a
        keyboard, so a row whose only actions live behind either has no actions
        at all for a large share of users.
      */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={t('a11y.rowActions', { name: label })}
        onClick={() => onMenu?.(occurrence)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
});
