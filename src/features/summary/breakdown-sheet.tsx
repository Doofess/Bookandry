import { useTranslation } from 'react-i18next';

import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/money';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { BalanceParts, ExpenseGroup } from '@/domain/calculators';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import type { Category, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

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
  parts,
  since,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parts: BalanceParts;
  since: LocalDate;
  currency: Currency;
}) {
  const { t, i18n } = useTranslation();

  const rows = [
    { key: 'opening', label: t('breakdown.opening'), minor: parts.openingMinor },
    { key: 'income', label: t('breakdown.income'), minor: parts.incomeMinor },
    { key: 'expense', label: t('breakdown.expense'), minor: -parts.expenseMinor },
  ];
  const total = parts.openingMinor + parts.incomeMinor - parts.expenseMinor;

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

        <dl className="px-4 pb-4">
          {rows.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-medium">
                {/* The opening balance is the usual answer to "that is not how
                    much money I have": typed once, months ago, and forgotten. */}
                <Money minor={row.minor} currency={currency} signMode="always" />
              </dd>
            </div>
          ))}
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border pt-3">
            <dt className="text-sm font-medium">{t('breakdown.total')}</dt>
            <dd className="text-base font-semibold">
              <Money minor={total} currency={currency} />
            </dd>
          </div>
        </dl>
      </SheetContent>
    </Sheet>
  );
}

export function ExpenseBreakdownSheet({
  open,
  onOpenChange,
  groups,
  month,
  currency,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly ExpenseGroup[];
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
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('breakdown.empty')}</p>
          ) : (
            groups.map((group) => (
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

/** Ordered most to least predictable, which is also least to most surprising. */
const GROUP_LABELS = {
  recurring: 'breakdown.groupRecurring',
  installments: 'breakdown.groupInstallments',
  yearly: 'breakdown.groupYearly',
  one_time: 'breakdown.groupOneTime',
} as const;

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
      <CategoryIcon name={category?.icon ?? 'Circle'} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{occurrence.note ?? name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatLocalDate(occurrence.date, i18n.language, { day: 'numeric', month: 'short' })}
      </span>
      <Money minor={occurrence.money.baseAmountMinor} currency={currency} className="shrink-0 text-sm" />
    </li>
  );
}
