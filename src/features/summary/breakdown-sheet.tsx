import { useTranslation } from 'react-i18next';

import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/money';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { BalanceBreakdown, ForecastBreakdown } from '@/domain/breakdown';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import type { Category, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

import { GROUP_LABELS } from './breakdown-labels';

/**
 * What makes up a headline figure.
 *
 * A sheet, not a tooltip: there is no hover on a phone, and the explanation is
 * a list rather than a sentence. This is the control that turns "the app is
 * wrong" into "oh, the insurance" - which is the difference between a number
 * people trust and one they ignore.
 */
export function BalanceBreakdownSheet({
  open,
  onOpenChange,
  breakdown,
  since,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  breakdown: BalanceBreakdown;
  since: LocalDate;
  currency: Currency;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('summary.balance')}</SheetTitle>
          <SheetDescription>
            {t('breakdown.balanceBody', {
              date: formatLocalDate(since, i18n.language, { dateStyle: 'long' }),
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <BalanceLines breakdown={breakdown} currency={currency} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

const BALANCE_LABELS = {
  income: 'breakdown.income',
  expense: 'breakdown.expense',
} as const;

/**
 * The balance's parts and its total: the same list in the pop-out and the sheet.
 *
 * What cards still owe comes after the total, set apart and without a sign: it
 * is not in the balance yet, and a minus above the line would read as taken.
 */
export function BalanceLines({
  breakdown,
  currency,
}: {
  readonly breakdown: BalanceBreakdown;
  readonly currency: Currency;
}) {
  const { t } = useTranslation();
  const pending = breakdown.pendingOnCardsMinor;
  return (
    <dl>
      {breakdown.lines.map((line) => (
        <div key={line.key} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className="text-sm text-muted-foreground">{t(BALANCE_LABELS[line.key])}</dt>
          <dd className="shrink-0 text-sm font-medium whitespace-nowrap">
            <Money minor={line.minor} currency={currency} signMode="always" />
          </dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2">
        <dt className="text-sm font-medium">{t('breakdown.total')}</dt>
        <dd className="text-base font-semibold">
          <Money minor={breakdown.totalMinor} currency={currency} />
        </dd>
      </div>
      {pending === undefined ? null : (
        <div className="mt-2 flex items-baseline justify-between gap-4 rounded-lg bg-muted px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('breakdown.cardPending')}</dt>
          <dd className="shrink-0 text-xs font-medium whitespace-nowrap">
            <Money minor={pending} currency={currency} />
          </dd>
        </div>
      )}
    </dl>
  );
}

export function ExpenseBreakdownSheet({
  open,
  onOpenChange,
  breakdown,
  month,
  currency,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  breakdown: ForecastBreakdown;
  month: LocalDate;
  currency: Currency;
  categories: ReadonlyMap<string, Category>;
}) {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const monthLabel = formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('summary.expected')}</SheetTitle>
          <SheetDescription>{t('breakdown.expenseBody', { month: monthLabel })}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {breakdown.groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('breakdown.empty')}</p>
          ) : (
            breakdown.groups.map((group) => (
              <section key={group.kind} className="py-2">
                <h3 className="flex items-baseline justify-between gap-4 py-1">
                  <span className="text-sm font-medium">{t(GROUP_LABELS[group.kind])}</span>
                  <Money
                    minor={group.totalMinor}
                    currency={currency}
                    className="text-sm text-muted-foreground"
                  />
                </h3>
                <ul className="space-y-0.5">
                  {group.occurrences.map((occurrence) => (
                    <BreakdownRow
                      key={occurrence.key}
                      occurrence={occurrence}
                      currency={currency}
                      categories={categories}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BreakdownRow({
  occurrence,
  currency,
  categories,
}: {
  occurrence: Occurrence;
  currency: Currency;
  categories: ReadonlyMap<string, Category>;
}) {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const category = categories.get(occurrence.categoryId);
  const name = category === undefined ? occurrence.categoryId : categoryDisplayName(category, t);

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <CategoryIcon name={category?.icon ?? 'Circle'} className="size-4 shrink-0 text-accent-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{occurrence.note ?? name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatLocalDate(occurrence.date, i18n.language, { day: 'numeric', month: 'short' })}
      </span>
      <Money minor={occurrence.money.baseAmountMinor} currency={currency} className="shrink-0 text-sm" />
    </li>
  );
}
