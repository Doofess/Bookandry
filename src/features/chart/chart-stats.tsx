import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { HueBars, type HueBarItem } from '@/components/ui/hue-bars';
import { Mark } from '@/components/ui/mark';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { totalsByCategory } from '@/domain/calculators';
import { categoryHue } from '@/domain/category-hue';
import type { ChartData } from '@/domain/chart-data';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import { divideMinor, sum } from '@/lib/money';
import type { Category } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

/** A month's spending: its first day (for the name) and the sum. */
type MonthSpend = { readonly month: LocalDate; readonly minor: Minor };

/** The range's expense points added up per calendar month, oldest first. */
function spendByMonth(data: ChartData): MonthSpend[] {
  const months = new Map<string, Minor>();
  for (const point of data.expense) {
    const key = point.date.slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + point.magnitudeMinor); // money-allow: a sum of minor units
  }
  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, minor]) => ({ month: `${key}-01` as LocalDate, minor }));
}

/**
 * The paper sheet beside the plot: in, out and net as figures in boxes, the
 * five largest categories as hue bars, the largest and the average month.
 *
 * Prose, so it stays in page direction outside the chart's LTR island - and
 * every amount inside it is its own LTR island again, via <Money>.
 *
 * The totals come from the chart's own `summary`, never from a second pass
 * over the occurrences: a stat that disagrees with the plot beside it is the
 * single most expensive bug this screen can have, because both look right.
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
  const { t, i18n } = useTranslation(['common', 'categories']);

  const top = useMemo<HueBarItem[]>(
    () =>
      totalsByCategory(data.rows, 'expense').map(({ categoryId, totalMinor }) => {
        const category = categories.get(categoryId);
        return {
          id: categoryId,
          name: category === undefined ? t('sheets.other') : categoryDisplayName(category, t),
          minor: totalMinor,
          hue: category === undefined ? 'neutral' : categoryHue(category),
        };
      }),
    [data.rows, categories, t],
  );

  const months = useMemo(() => spendByMonth(data), [data]);
  const largest = months.reduce<MonthSpend | undefined>(
    (best, entry) => (best === undefined || entry.minor > best.minor ? entry : best),
    undefined,
  );
  const average =
    months.length === 0 ? undefined : divideMinor(sum(months.map((m) => m.minor)), months.length);
  const monthName = (month: LocalDate) =>
    formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' });

  return (
    <Sheet
      kind="paper"
      data-slot="chart-stats"
      className="grid content-start gap-4 @board/main:grid-cols-3 @board/main:gap-x-8 @wide/main:grid-cols-1"
    >
      <SheetHead title={t('chart.stats.title')} className="@board/main:col-span-3 @wide/main:col-span-1" />

      <dl className="grid content-start">
        <Figure label={t('chart.stats.in')}>
          <Mark>
            <Money minor={data.summary.incomeMinor} currency={currency} />
          </Mark>
        </Figure>
        <Figure label={t('chart.stats.out')}>
          <Mark>
            <Money minor={data.summary.expenseMinor} currency={currency} />
          </Mark>
        </Figure>
        <Figure label={t('chart.stats.net')}>
          <Mark>
            <Money minor={data.summary.netMinor} currency={currency} signMode="always" />
          </Mark>
        </Figure>
      </dl>

      <div className="grid content-start gap-3">
        <h3 className="font-semibold">{t('chart.stats.top')}</h3>
        {top.length === 0 ? (
          <p className="font-light">{t('chart.statTopNone')}</p>
        ) : (
          // Name and amount on a line, the bar the full width under them: the column is too narrow for three across.
          <div className="[&_li]:grid-cols-[minmax(0,1fr)_auto] [&_li]:gap-y-1 [&_li>span:nth-child(2)]:order-1 [&_li>span:nth-child(2)]:col-span-2 [&_li>span:nth-child(2)]:h-9">
            <HueBars items={top.slice(0, 5)} currency={currency} limit={5} />
          </div>
        )}
      </div>

      {largest === undefined || average === undefined ? null : (
        <dl className="grid content-start">
          <Figure label={t('chart.stats.largest')} note={monthName(largest.month)}>
            <Money minor={largest.minor} currency={currency} />
          </Figure>
          <Figure label={t('chart.stats.average')}>
            <Money minor={average} currency={currency} />
          </Figure>
        </dl>
      )}
    </Sheet>
  );
}

/** One row on a 2px line: the label (and a note under it) and its figure at the inline end. */
function Figure({
  label,
  note,
  children,
}: {
  readonly label: string;
  readonly note?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b-2 border-border py-3 first:pt-0 last:border-b-0">
      <dt className="font-semibold">{label}</dt>
      {note === undefined ? null : <dd className="col-start-1 row-start-2 font-light">{note}</dd>}
      <dd className="col-start-2 row-span-2 row-start-1 text-lg">{children}</dd>
    </div>
  );
}
