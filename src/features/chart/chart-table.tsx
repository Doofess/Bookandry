import { cn } from 'cn';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import type { ChartData } from '@/domain/chart-data';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import type { Category } from '@/types/domain';
import type { Currency } from '@/types/money';

/**
 * The chart, as a table.
 *
 * This is the conformance path for the plot, not a convenience. Recharts v3
 * turns on `accessibilityLayer` by default, which emits `role="application"` -
 * useful for arrowing between points, but it drops a screen-reader user out of
 * browse mode, and a cloud of three hundred dots read one at a time is not an
 * answer to "what did I spend this month".
 *
 * Two details that are easy to get wrong and silently lose the whole benefit:
 *
 *  - The table is ALWAYS in the DOM. Collapsed, it carries `sr-only` rather
 *    than `hidden`; `hidden` (or conditional rendering) would take it away from
 *    assistive technology too, leaving exactly the users it exists for with
 *    nothing.
 *  - It is built from the chart's POINTS, not from a second query. When the
 *    chart aggregates by month the table says so and shows the same monthly
 *    totals - a table of 1,501 individual rows under a chart of 24 dots would
 *    be a different answer to the same question.
 */
export function ChartTable({
  data,
  currency,
  categories,
}: {
  readonly data: ChartData;
  readonly currency: Currency;
  readonly categories: ReadonlyMap<string, Category>;
}) {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const [visible, setVisible] = useState(false);
  const tableId = useId();

  const points = [...data.income, ...data.expense].sort((a, b) => a.t - b.t || a.key.localeCompare(b.key));

  return (
    <div className="mt-4">
      <button
        type="button"
        // aria-pressed, not aria-expanded: the table is exposed to AT either
        // way, so this toggles whether it is VISIBLE, not whether it exists.
        aria-pressed={visible}
        aria-controls={tableId}
        onClick={() => {
          setVisible((open) => !open);
        }}
        className="rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {t('chart.viewAsTable')}
      </button>

      <div id={tableId} className={cn('mt-2', visible ? 'overflow-x-auto' : 'sr-only')}>
        <table className="w-full text-sm">
          <caption className="pb-2 text-start text-xs text-muted-foreground">
            {data.aggregated ? t('chart.aggregatedNote') : t('chart.tableCaption')}
          </caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 text-start font-medium">
                {t('chart.colDate')}
              </th>
              <th scope="col" className="py-1.5 text-start font-medium">
                {t('chart.colKind')}
              </th>
              <th scope="col" className="py-1.5 text-start font-medium">
                {t('chart.colWhat')}
              </th>
              <th scope="col" className="py-1.5 text-end font-medium">
                {t('chart.colAmount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => {
              const category =
                point.occurrence === undefined ? undefined : categories.get(point.occurrence.categoryId);

              return (
                <tr key={point.key} className="border-b border-border/60">
                  <th scope="row" className="py-1.5 text-start font-normal whitespace-nowrap">
                    {data.aggregated
                      ? formatLocalDate(point.date, i18n.language, { month: 'long', year: 'numeric' })
                      : formatLocalDate(point.date, i18n.language, { dateStyle: 'medium' })}
                  </th>
                  <td className="py-1.5">
                    {point.kind === 'income' ? t('chart.income') : t('chart.expense')}
                  </td>
                  <td className="py-1.5">
                    {data.aggregated
                      ? t('chart.rows', { count: point.count })
                      : category === undefined
                        ? ''
                        : categoryDisplayName(category, t)}
                  </td>
                  <td className="py-1.5 text-end">
                    <Money minor={point.signedMinor} currency={currency} signMode="always" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
