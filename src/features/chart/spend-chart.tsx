import { scaleSymlog } from 'd3-scale';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { Money } from '@/components/money';
import {
  axisTicks,
  MAX_DOT_RADIUS,
  SYMLOG_CONSTANT,
  Z_AREA_RANGE,
  type BalancePoint,
  type ChartData,
  type ChartPoint,
} from '@/domain/chart-data';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatCompactMoney } from '@/i18n/money-format';
import { formatLocalDate, fromUtcInstant, isWithin, toUtcInstant } from '@/lib/dates';
import type { Category } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type SpendChartProps = {
  readonly data: ChartData;
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly today: LocalDate;
  readonly currency: Currency;
  readonly categories: ReadonlyMap<string, Category>;
};

const HEIGHT = 300;

/**
 * The plot.
 *
 * Three decisions carry most of the weight here, and each of them is a defect
 * the moment it is reversed:
 *
 * 1. `dir="ltr"` on the plot island ONLY. A chart is a coordinate system, not
 *    prose: time runs left to right in Hebrew exactly as it does in English,
 *    and mirroring it would put the future on the left of a Y axis that stayed
 *    put. The legend, the caption and the stat cards are prose and are rendered
 *    OUTSIDE this island, in page direction.
 *
 * 2. Kind is encoded by SHAPE as well as colour - a circle for income, a
 *    diamond for expense. Red against green is 1.6-1.8:1 dot to dot, which
 *    fails WCAG 1.4.1 outright: for a red-green colour-blind reader, a
 *    colour-only chart is a cloud of identical dots.
 *
 * 3. The magnitude axis is symlog with an EXPLICIT domain, ticks and
 *    `allowDataOverflow`. Left on "auto" Recharts computes a linear domain and
 *    then draws it through a log scale, which silently places every dot wrong,
 *    and d3's default symlog constant of 1 means "one agora" - the linear
 *    region would be narrower than a rounding error.
 */
export function SpendChart({ data, from, to, today, currency, categories }: SpendChartProps) {
  const { t, i18n } = useTranslation();

  /*
   * One scale instance, kept across renders.
   *
   * Recharts copies the scale internally, but rebuilding it every render also
   * rebuilds the axis identity and restarts the animation on every unrelated
   * state change - including opening the data table below it.
   */
  const scale = useMemo(() => scaleSymlog().constant(SYMLOG_CONSTANT), []);
  const ticks = useMemo(() => axisTicks(from, to), [from, to]);

  const formatDate = (value: number): string =>
    formatLocalDate(fromUtcInstant(value), i18n.language, { month: 'short', day: 'numeric' });

  return (
    // The island. Everything inside reads left to right in both languages.
    <div dir="ltr" className="-mx-2">
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <ComposedChart data={data.balance} margin={{ top: MAX_DOT_RADIUS + 2, right: 8, bottom: 0, left: 8 }}>
          {/*
            `yAxisId` is NOT optional here. It defaults to 0, which matches
            neither of our named axes, and the grid then quietly falls back to
            drawing two lines at the plot edges - a "grid" that looks like a
            rendering bug rather than a missing prop.
          */}
          <CartesianGrid
            yAxisId="amount"
            syncWithTicks
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />

          <XAxis
            dataKey="t"
            type="number"
            domain={data.xDomain}
            ticks={ticks}
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            allowDataOverflow
          />

          <YAxis
            yAxisId="amount"
            dataKey="signedMinor"
            type="number"
            scale={scale}
            domain={data.amountDomain}
            ticks={[...data.amountTicks]}
            tickFormatter={(value: number) => formatCompactMoney(value, currency, i18n.language)}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            width={56}
            /*
             * NO `allowDataOverflow` on this axis, deliberately.
             *
             * It does two things, and only one of them is wanted: it stops
             * Recharts widening the domain, and it CLIPS the series to the plot
             * rect. A dot is positioned by its centre and can be 10px across,
             * so the largest income of the window - which by definition sits
             * nearest the top of the axis - comes back with its upper half
             * sliced off. The domain here is computed from the data and always
             * encloses it, so there is nothing to overflow and nothing to clip.
             *
             * The X axis keeps it: that domain is the chosen WINDOW, and a dot
             * outside it genuinely should not be drawn.
             */
          />

          {/*
            A running balance is two or three orders of magnitude above a single
            transaction. On one shared axis the line pins to the top of the plot
            and every dot flattens onto the zero line.
          */}
          <YAxis
            yAxisId="balance"
            orientation="right"
            type="number"
            domain={[...data.balanceDomain]}
            ticks={[...data.balanceTicks]}
            tickFormatter={(value: number) => formatCompactMoney(value, currency, i18n.language)}
            tick={{ fontSize: 11, fill: 'var(--chart-balance)' }}
            tickLine={false}
            axisLine={false}
            width={56}
          />

          {/*
            ZAxis MUST carry a dataKey. Without one every point's z resolves to
            '-' and silently takes range[0] - a chart of uniform dots that looks
            deliberate.
          */}
          <ZAxis dataKey="z" type="number" domain={[...data.zDomain]} range={[...Z_AREA_RANGE]} />

          <ReferenceLine yAxisId="amount" y={0} stroke="var(--border)" />

          {isWithin(today, from, to) ? (
            <ReferenceLine
              yAxisId="amount"
              x={toUtcInstant(today)}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 4"
            />
          ) : null}

          <Tooltip
            /*
             * `shared={false}` asks for item tooltips - the question a scatter
             * plot answers is "what is THAT dot", not "what happened to share
             * this pixel" - but Recharts still hands the content function an
             * entry for EVERY series at that position, the balance line
             * included. So the content picks: a transaction if one is under the
             * pointer, and otherwise the running balance, which is a useful
             * answer rather than an empty box.
             */
            shared={false}
            cursor={{ stroke: 'var(--border)' }}
            content={({ payload }) => (
              <ChartTooltip
                entries={payload}
                currency={currency}
                categories={categories}
                aggregated={data.aggregated}
              />
            )}
          />

          <Scatter
            yAxisId="amount"
            data={[...data.income]}
            name={t('chart.income')}
            shape="circle"
            fill="var(--chart-income)"
            fillOpacity={0.75}
            isAnimationActive={false}
          />
          <Scatter
            yAxisId="amount"
            data={[...data.expense]}
            name={t('chart.expense')}
            shape="diamond"
            fill="var(--chart-expense)"
            fillOpacity={0.75}
            isAnimationActive={false}
          />

          <Line
            yAxisId="balance"
            dataKey="balanceMinor"
            name={t('chart.balanceLine')}
            type="monotone"
            stroke="var(--chart-balance)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function isChartPoint(value: unknown): value is ChartPoint {
  return typeof value === 'object' && value !== null && 'signedMinor' in value;
}

function isBalancePoint(value: unknown): value is BalancePoint {
  return typeof value === 'object' && value !== null && 'balanceMinor' in value;
}

function ChartTooltip({
  entries,
  currency,
  categories,
  aggregated,
}: {
  readonly entries: readonly { readonly payload?: unknown }[];
  readonly currency: Currency;
  readonly categories: ReadonlyMap<string, Category>;
  readonly aggregated: boolean;
}) {
  const { t, i18n } = useTranslation(['common', 'categories']);

  const payloads = entries.map((entry) => entry.payload);
  const point = payloads.find(isChartPoint);
  const balance = payloads.find(isBalancePoint);

  if (point === undefined && balance === undefined) return null;

  const category = point?.occurrence === undefined ? undefined : categories.get(point.occurrence.categoryId);
  const date = point?.date ?? balance?.date;

  return (
    // Prose, inside an LTR wrapper: it takes the page direction back. The
    // amount inside it is its own LTR island again, via <Money>.
    <div
      dir={i18n.dir()}
      className="chart-tooltip rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
    >
      {date === undefined ? null : (
        <p className="font-medium">
          {aggregated
            ? formatLocalDate(date, i18n.language, { month: 'long', year: 'numeric' })
            : formatLocalDate(date, i18n.language, { dateStyle: 'medium' })}
        </p>
      )}

      {point === undefined ? null : (
        <>
          <p className="mt-1">
            <Money minor={point.signedMinor} currency={currency} signMode="always" />
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {aggregated
              ? t('chart.rows', { count: point.count })
              : category === undefined
                ? t(point.kind === 'income' ? 'chart.income' : 'chart.expense')
                : categoryDisplayName(category, t)}
          </p>
        </>
      )}

      {/*
        The running balance, always - it is the other half of what the chart
        shows, and a dot's own amount says nothing about where the balance got
        to. Labelled, because an unlabelled second number beside a transaction
        reads as part of it.
      */}
      {balance === undefined ? null : (
        <p className="mt-1 text-muted-foreground">
          {t('chart.balanceLine')} <Money minor={balance.balanceMinor} currency={currency} />
        </p>
      )}
    </div>
  );
}
