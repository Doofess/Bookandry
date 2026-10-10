import { cn } from 'cn';
import { BanknoteArrowDown, BanknoteArrowUp, Wallet, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryChip } from '@/components/category-icon';
import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import type { CashActivity } from '@/domain/cash';
import type { FeedLookups } from '@/features/feed/use-feed-data';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import type { CashMove, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

const MOVE_ICON: Readonly<Record<string, LucideIcon>> = {
  start: Wallet,
  withdraw: BanknoteArrowDown,
  deposit: BanknoteArrowUp,
};

/** Consecutive entries of one day together, keeping their order (newest first). */
function byDay(activity: readonly CashActivity[]): [LocalDate, CashActivity[]][] {
  const days: [LocalDate, CashActivity[]][] = [];
  for (const entry of activity) {
    const last = days.at(-1);
    if (last?.[0] === entry.date) last[1].push(entry);
    else days.push([entry.date, [entry]]);
  }
  return days;
}

/**
 * What moved the cash, newest first and grouped by day, in the feed's row
 * style: cash income and spending (real transactions, opened in the edit
 * form), and withdrawals, deposits and the starting amount (opened in their
 * own form, when `onOpenMove` is given). A recount's row says so.
 */
export function CashActivityList({
  activity,
  lookups,
  showPerson,
  currency,
  today,
  onOpenOccurrence,
  onOpenMove,
}: {
  readonly activity: readonly CashActivity[];
  readonly lookups: FeedLookups;
  /** The "all" view: each row shows whose it is. */
  readonly showPerson: boolean;
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly onOpenOccurrence: (occurrence: Occurrence) => void;
  readonly onOpenMove?: (move: CashMove) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Sheet
      kind="paper"
      data-slot="cash-moves"
      aria-label={t('cash.activity')}
      className="grid content-start gap-2"
    >
      <SheetHead title={t('cash.activity')} />
      {activity.length === 0 ? (
        <p className="py-6 text-center text-sm font-light">{t('cash.activityEmpty')}</p>
      ) : (
        byDay(activity).map(([date, entries]) => (
          <div key={date}>
            <p
              data-slot="day-heading"
              className="border-be-2 border-border pt-4 pb-1.5 text-sm font-semibold"
            >
              {date === today
                ? t('feed.today')
                : formatLocalDate(date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <ul className="divide-y-2 divide-border">
              {entries.map((entry) => (
                <li key={entry.key}>
                  <ActivityRow
                    entry={entry}
                    lookups={lookups}
                    showPerson={showPerson}
                    currency={currency}
                    onOpenOccurrence={onOpenOccurrence}
                    {...(onOpenMove === undefined ? {} : { onOpenMove })}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Sheet>
  );
}

function ActivityRow({
  entry,
  lookups,
  showPerson,
  currency,
  onOpenOccurrence,
  onOpenMove,
}: {
  readonly entry: CashActivity;
  readonly lookups: FeedLookups;
  readonly showPerson: boolean;
  readonly currency: Currency;
  readonly onOpenOccurrence: (occurrence: Occurrence) => void;
  readonly onOpenMove?: (move: CashMove) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const profile = lookups.profiles.find((p) => p.id === entry.profileId);

  let icon: ReactNode;
  let title: string;
  const details: string[] = [];
  if (entry.type === 'occurrence') {
    const category = lookups.categories.get(entry.occurrence.categoryId);
    const categoryName =
      category === undefined ? entry.occurrence.categoryId : categoryDisplayName(category, t);
    icon = <CategoryChip icon={category?.icon ?? 'Circle'} />;
    title = entry.occurrence.note ?? categoryName;
    if (entry.occurrence.note !== undefined) details.push(categoryName);
  } else {
    const Icon = MOVE_ICON[entry.move.kind] ?? Wallet;
    icon = (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
    title =
      entry.move.kind === 'withdraw'
        ? t('cash.move.withdraw')
        : entry.move.kind === 'deposit'
          ? t('cash.move.deposit')
          : t('cash.move.start');
    const accountId = entry.move.accountId;
    if (accountId !== undefined) {
      // An account deleted since keeps the move's money; only its name is gone.
      details.push(lookups.paymentMethods.get(accountId)?.label ?? t('cash.someAccount'));
    }
    if (entry.move.note !== undefined) details.push(entry.move.note);
  }

  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {details.length === 0 ? null : <span className="min-w-0 truncate">{details.join(' · ')}</span>}
          {entry.type === 'occurrence' && entry.recount ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">
              {t('cash.recount')}
            </span>
          ) : null}
        </span>
      </span>
      {showPerson && profile !== undefined ? <PersonAvatar person={profile} size="sm" /> : null}
      <Money
        minor={entry.signedMinor}
        currency={currency}
        signMode="always"
        className={cn(
          'shrink-0 text-sm font-semibold',
          entry.signedMinor > 0 ? 'text-income' : 'text-foreground',
        )}
      />
    </>
  );

  const open =
    entry.type === 'occurrence'
      ? () => {
          onOpenOccurrence(entry.occurrence);
        }
      : onOpenMove === undefined
        ? undefined
        : () => {
            onOpenMove(entry.move);
          };
  const row = 'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start';

  return open === undefined ? (
    <div className={row}>{content}</div>
  ) : (
    <button
      type="button"
      onClick={open}
      className={cn(
        row,
        'rounded-2xl transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
      )}
    >
      {content}
    </button>
  );
}
