import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSettings, useToday } from '@/app/app-context';
import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';
import { Segmented } from '@/components/segmented';
import { Label } from '@/components/ui/label';
import { CHART_RANGES, type ChartRange } from '@/domain/chart-data';

import { ChartStats } from './chart-stats';
import { ChartTable } from './chart-table';
import { SpendChart } from './spend-chart';
import { useChartData } from './use-chart-data';
import { ProfileSwitcher } from '../feed/profile-switcher';
import { useFeedLookups } from '../feed/use-feed-data';
import { useFeedFilters } from '../feed/use-feed-filters';
import { MonthCursor } from '../summary/month-cursor';

const RANGE_LABEL: Record<
  ChartRange,
  'chart.range1m' | 'chart.range3m' | 'chart.range6m' | 'chart.range1y' | 'chart.rangeAll'
> = {
  '1m': 'chart.range1m',
  '3m': 'chart.range3m',
  '6m': 'chart.range6m',
  '1y': 'chart.range1y',
  all: 'chart.rangeAll',
};

export function ChartScreen() {
  const { t } = useTranslation(['common', 'categories']);
  const today = useToday();
  const settings = useSettings();

  /*
   * Month and profile come from the SAME url state the feed uses.
   *
   * Stepping to August on the feed and switching to the chart must not land on
   * September: the month cursor exists precisely so that one screen cannot
   * report a different period from another. The range is local, because it is
   * a property of this view rather than of the period being looked at.
   */
  const { filters, stepMonth, setProfile } = useFeedFilters();
  const [range, setRange] = useState<ChartRange>('3m');
  const rangeId = useId();

  const lookups = useFeedLookups();
  const state = useChartData(filters.profileId, range, filters.month, today, settings.defaultCurrency);

  return (
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('chart.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="px-4 pt-6">
        <MonthCursor month={filters.month} today={today} onStep={stepMonth} />

        {lookups === undefined ? null : (
          <ProfileSwitcher
            profiles={lookups.profiles}
            active={filters.profileId}
            onSelect={setProfile}
            className="mt-3"
          />
        )}

        <div className="mt-3 space-y-1.5">
          <Label id={rangeId}>{t('chart.range')}</Label>
          <Segmented<ChartRange>
            value={range}
            onChange={setRange}
            size="sm"
            labelledBy={rangeId}
            options={CHART_RANGES.map((value) => ({ value, label: t(RANGE_LABEL[value]) }))}
          />
        </div>

        {state.status === 'blocked' ? (
          <p className="mt-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {t('summary.balanceBlocked', { currencies: state.currencies.join(', ') })}
          </p>
        ) : state.status === 'loading' || lookups === undefined ? (
          <div className="mt-4 h-[300px] animate-pulse rounded-xl bg-muted" />
        ) : state.data.rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">{t('chart.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('chart.emptyHint')}</p>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-border bg-card py-3">
              <SpendChart
                data={state.data}
                from={state.window.from}
                to={state.window.to}
                today={today}
                currency={settings.defaultCurrency}
                categories={lookups.categories}
              />
            </div>

            {/*
            The legend is PROSE and lives outside the plot island, so it reads
            right-to-left in Hebrew while the plot inside still runs left to
            right. Recharts' own <Legend> would have been rendered inside the
            island and come out mirrored.
          */}
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-chart-income" aria-hidden="true" />
                {t('chart.income')}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rotate-45 bg-chart-expense" aria-hidden="true" />
                {t('chart.expense')}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-chart-balance" aria-hidden="true" />
                {t('chart.balanceLine')}
              </li>
            </ul>

            <p className="mt-2 text-xs text-muted-foreground">{t('chart.legend')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('chart.lineNote')}</p>
            {state.data.aggregated ? (
              <p className="mt-1 text-xs text-muted-foreground">{t('chart.aggregatedNote')}</p>
            ) : null}

            <ChartStats
              data={state.data}
              currency={settings.defaultCurrency}
              categories={lookups.categories}
            />

            <ChartTable
              data={state.data}
              currency={settings.defaultCurrency}
              categories={lookups.categories}
            />
          </>
        )}
      </PanelSheet>
    </section>
  );
}
