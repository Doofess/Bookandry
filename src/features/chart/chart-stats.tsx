import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { totalsByCategory } from '@/domain/calculators';
import type { ChartData } from '@/domain/chart-data';
import { categoryDisplayName } from '@/i18n/category-name';
import type { Category } from '@/types/domain';
import type { Currency, Minor } from '@/types/money';

/**
 * The three totals and the biggest category, for the range on screen.
 *
 * Prose, so it stays in page direction outside the chart's LTR island - and
 * every amount inside it is its own LTR island again, via <Money>.
 *
 * The numbers come from the chart's own `summary`, never from a second pass
 * over the occurrences: a stat card that disagrees with the plot above it is
 * the single most expensive bug this screen can have, because both look right.
 */
export function ChartStats({
  data,
  currency,
  categories,
}: {
  readonly data: ChartData;
  readonly currency: Currency;
  readonly categories: ReadonlyMap<string, Category>;
}) {
  const { t } = useTranslation(['common', 'categories']);

  const top = totalsByCategory(data.rows, 'expense')[0];
  const topCategory = top === undefined ? undefined : categories.get(top.categoryId);

  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label={t('chart.statIncome')} minor={data.summary.incomeMinor} currency={currency} />
      <Stat label={t('chart.statExpense')} minor={data.summary.expenseMinor} currency={currency} />
      <Stat label={t('chart.statNet')} minor={data.summary.netMinor} currency={currency} signMode="always" />

      <div className="rounded-xl border border-border bg-card px-3 py-2">
        <dt className="text-xs text-muted-foreground">{t('chart.statTop')}</dt>
        <dd className="mt-0.5 truncate text-sm font-semibold">
          {top === undefined || topCategory === undefined ? (
            <span className="text-muted-foreground">{t('chart.statTopNone')}</span>
          ) : (
            <>
              <span className="block truncate">{categoryDisplayName(topCategory, t)}</span>
              <Money
                minor={top.totalMinor}
                currency={currency}
                className="text-xs font-normal text-muted-foreground"
              />
            </>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Stat({
  label,
  minor,
  currency,
  signMode,
}: {
  readonly label: string;
  readonly minor: Minor;
  readonly currency: Currency;
  readonly signMode?: 'always';
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">
        <Money minor={minor} currency={currency} signMode={signMode} />
      </dd>
    </div>
  );
}
