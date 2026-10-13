import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildChartData, type ChartData } from '@/domain/chart-data';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Occurrence } from '@/types/domain';
import type { IsoInstant, Kind, Minor } from '@/types/money';

import { ChartStats } from './chart-stats';

beforeAll(async () => {
  await initTestI18n();
});

const ts = '2026-01-01T00:00:00.000Z' as IsoInstant;
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

const category = (id: string, nameKey: string): Category => ({
  id,
  kind: 'expense',
  icon: 'shopping-cart',
  sortOrder: 1,
  isArchived: 0,
  source: 'builtin',
  nameKey,
  createdAt: ts,
  updatedAt: ts,
});

const CATEGORIES = new Map<string, Category>([
  ['cat.groceries', category('cat.groceries', 'categories:builtin.groceries')],
  ['cat.rent', category('cat.rent', 'categories:builtin.rent')],
]);

const build = (occurrences: readonly Occurrence[]): ChartData =>
  buildChartData({ occurrences, from: d('2026-01-01'), to: d('2026-12-31'), openingMinor: 0 });

const render = (data: ChartData) =>
  renderWithProviders(<ChartStats data={data} currency="USD" categories={CATEGORIES} />);

const valueUnder = (label: string): string | null | undefined => {
  const term = screen.getByText(label);
  return term.parentElement?.querySelector('[data-value]')?.getAttribute('data-value');
};

describe('the totals', () => {
  const data = build([
    occ('2026-03-01', 'income', 900000),
    occ('2026-03-04', 'expense', 4500, 'cat.groceries'),
    occ('2026-03-10', 'expense', 200000, 'cat.rent'),
  ]);

  it('reports income, expense and net in minor units', () => {
    render(data);

    expect(valueUnder('In')).toBe('900000');
    expect(valueUnder('Out')).toBe('204500');
    expect(valueUnder('Net')).toBe('695500');
  });

  it("takes them from the chart's own summary, so the cards cannot disagree with the plot", () => {
    // A stat card computed by a second pass over the occurrences is the most
    // expensive bug this screen can have: both numbers look right.
    render(data);

    expect(valueUnder('In')).toBe(String(data.summary.incomeMinor));
    expect(valueUnder('Out')).toBe(String(data.summary.expenseMinor));
  });

  it('puts the biggest category first, not the commonest', () => {
    // One rent payment beats nine grocery runs. Counting rows instead of money
    // would answer a question nobody asked.
    const { container } = render(data);

    const names = [...container.querySelectorAll('[data-slot="hue-bars"] li')].map((li) => li.textContent);
    expect(names[0]).toMatch(/^Rent/);
    expect(names[1]).toMatch(/^Groceries/);
  });
});

describe('the sheet', () => {
  const data = build([
    occ('2026-02-01', 'income', 900000),
    occ('2026-02-10', 'expense', 100000, 'cat.rent'),
    occ('2026-03-04', 'expense', 4500, 'cat.groceries'),
    occ('2026-03-10', 'expense', 200000, 'cat.rent'),
  ]);

  it('is a paper sheet with exactly three marks: in, out and net', () => {
    const { container } = render(data);

    const root = container.querySelector('[data-slot="chart-stats"]');
    expect(root).toHaveAttribute('data-sheet', 'paper');
    expect(root?.querySelectorAll('[data-slot="mark"]')).toHaveLength(3);
  });

  it('draws the five largest categories as hue bars, nothing more', () => {
    const many = build(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) =>
        occ('2026-03-04', 'expense', 1000 * (i + 1), `cat.${id}`),
      ),
    );
    const { container } = render(many);

    expect(container.querySelectorAll('[data-slot="hue-bars"] i[data-hue]')).toHaveLength(5);
  });

  it('shows the largest and the average month with their names', () => {
    render(data);

    const largest = screen.getByText('Largest month').parentElement;
    expect(largest).toHaveTextContent('March 2026');
    expect(largest?.querySelector('[data-value]')).toHaveAttribute('data-value', '204500');
    const average = screen.getByText('Average month').parentElement;
    expect(average?.querySelector('[data-value]')).toHaveAttribute('data-value', '152250');
  });

  it('has no bordered card boxes inside it', () => {
    const { container } = render(data);

    expect(container.querySelector('.rounded-xl.border')).toBeNull();
  });
});

describe('an empty range', () => {
  it('says so rather than naming a category with nothing in it', () => {
    render(build([]));

    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(valueUnder('Net')).toBe('0');
  });

  it('does not offer a biggest EXPENSE category for an income-only range', () => {
    render(build([occ('2026-03-01', 'income', 900000)]));

    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });
});
