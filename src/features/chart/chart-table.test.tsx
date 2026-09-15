import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildChartData, type ChartData } from '@/domain/chart-data';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Occurrence } from '@/types/domain';
import type { Kind, Minor } from '@/types/money';

import { ChartTable } from './chart-table';

beforeAll(async () => {
  await initTestI18n();
});

let serial = 0;

function occ(date: string, kind: Kind, amountMinor: Minor, categoryId = 'cat.groceries'): Occurrence {
  serial += 1;
  const on = d(date);
  const transaction = makeTx({
    id: `tx${String(serial)}`,
    kind,
    categoryId,
    date: on,
    recurrence: { type: 'one_time' },
  });
  return {
    transaction,
    seriesId: transaction.id,
    date: on,
    originalDate: on,
    key: `${transaction.id}@${date}`,
    money: { ...MONEY, amountMinor, baseAmountMinor: amountMinor },
    categoryId,
    isOverridden: false,
    isMoved: false,
    isSkipped: false,
    isProjected: false,
  };
}

const CATEGORIES = new Map<string, Category>([
  [
    'cat.groceries',
    {
      id: 'cat.groceries',
      kind: 'expense',
      icon: 'shopping-cart',
      sortOrder: 1,
      isArchived: 0,
      source: 'builtin',
      nameKey: 'categories:builtin.groceries',
      createdAt: '2026-01-01T00:00:00.000Z' as Occurrence['transaction']['createdAt'],
      updatedAt: '2026-01-01T00:00:00.000Z' as Occurrence['transaction']['updatedAt'],
    },
  ],
]);

const build = (occurrences: readonly Occurrence[], mode?: 'points' | 'aggregated'): ChartData =>
  buildChartData({
    occurrences,
    from: d('2026-01-01'),
    to: d('2026-12-31'),
    openingMinor: 0,
    ...(mode === undefined ? {} : { mode }),
  });

const render = (data: ChartData) =>
  renderWithProviders(<ChartTable data={data} currency="USD" categories={CATEGORIES} />);

describe('exposure', () => {
  it('is in the DOM before anyone presses anything', () => {
    /*
     * The whole point. Recharts turns on `accessibilityLayer` by default, which
     * emits role="application" and drops a screen-reader user out of browse
     * mode - so the table is the conformance path, and rendering it only on
     * click would take it away from exactly the users it exists for.
     */
    render(build([occ('2026-03-04', 'expense', 4500)]));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('toggles VISIBILITY, not existence', async () => {
    // aria-pressed, not aria-expanded: the content is exposed either way.
    const user = userEvent.setup();
    render(build([occ('2026-03-04', 'expense', 4500)]));

    const toggle = screen.getByRole('button', { name: /view as table/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('what it says', () => {
  it('carries the integer, so no assertion depends on a separator', () => {
    // Every amount assertion in this codebase reads data-value. Pinning
    // "$45.00" makes the suite fail the next time ICU moves a separator.
    render(build([occ('2026-03-04', 'expense', 4500), occ('2026-03-05', 'income', 900000)]));

    const values = screen
      .getAllByRole('cell')
      .map((cell) => cell.querySelector('[data-value]')?.getAttribute('data-value'));

    expect(values).toContain('-4500');
    expect(values).toContain('900000');
  });

  it('names the category of a real row', () => {
    render(build([occ('2026-03-04', 'expense', 4500)]));

    expect(screen.getByRole('cell', { name: 'Groceries' })).toBeInTheDocument();
  });

  it('mirrors the chart when the chart aggregates', () => {
    /*
     * A table of 1,501 individual rows under a chart of 24 dots is a different
     * answer to the same question. It is built from the chart's POINTS for
     * exactly this reason.
     */
    render(build([occ('2026-03-04', 'expense', 4500), occ('2026-03-20', 'expense', 500)], 'aggregated'));

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('cell', { name: '2 transactions' })).toBeInTheDocument();
    // The month's total, not one of its rows: the table and the dot above it
    // are the same number or the screen contradicts itself.
    expect(screen.getByRole('table').querySelector('tbody [data-value]')).toHaveAttribute(
      'data-value',
      '-5000',
    );
  });

  it('says so in the caption when it is showing monthly totals', () => {
    render(build([occ('2026-03-04', 'expense', 4500)], 'aggregated'));

    expect(screen.getByText(/one dot per month/i)).toBeInTheDocument();
  });
});
