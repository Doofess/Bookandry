import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { MONEY, d, makeTx } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Occurrence, Profile } from '@/types/domain';

import { DayHeader, TransactionRow, type RowContext } from './feed-rows';

const TODAY = d('2026-09-15');

const category = (over: Partial<Category> = {}): Category =>
  ({
    id: 'cat.groceries',
    kind: 'expense',
    icon: 'ShoppingBasket',
    sortOrder: 1,
    isArchived: 0,
    source: 'builtin',
    nameKey: 'categories:builtin.groceries',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Category;

const profile: Profile = {
  id: 'p1',
  name: 'Dana',
  avatar: 'fox',
  color: '#16794a',
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: '2026-01-01T00:00:00.000Z' as Profile['createdAt'],
  updatedAt: '2026-01-01T00:00:00.000Z' as Profile['updatedAt'],
};

const context = (over: Partial<RowContext> = {}): RowContext => ({
  currency: 'USD',
  today: TODAY,
  categories: new Map([['cat.groceries', category()]]),
  profiles: new Map([['p1', profile]]),
  showProfile: false,
  ...over,
});

function occurrence(over: Partial<Occurrence> = {}): Occurrence {
  const date = over.date ?? d('2026-09-10');
  return {
    transaction: makeTx({ id: 't1', date, recurrence: { type: 'one_time' } }),
    seriesId: 't1',
    date,
    originalDate: date,
    key: `t1@${date}`,
    money: { ...MONEY, amountMinor: 4500, baseAmountMinor: 4500 },
    categoryId: 'cat.groceries',
    isOverridden: false,
    isMoved: false,
    isSkipped: false,
    isProjected: false,
    ...over,
  };
}

beforeAll(async () => {
  await initTestI18n('en');
});

const render = (ui: React.ReactElement) => renderWithProviders(ui);

describe('TransactionRow', () => {
  it('reports its position within the whole list, not the rendered window', () => {
    render(<TransactionRow occurrence={occurrence()} context={context()} position={214} setSize={600} />);
    const item = screen.getByRole('listitem');
    // A virtualised list has a handful of elements in the DOM out of hundreds;
    // without these a screen reader announces "3 of 8" for the 214th row.
    expect(item).toHaveAttribute('aria-posinset', '214');
    expect(item).toHaveAttribute('aria-setsize', '600');
  });

  it('folds the date into its accessible name', () => {
    render(<TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />);
    // The day header above it is aria-hidden, so the row has to say its own date.
    // Anchored: the row's own button, not the menu whose label WRAPS it.
    expect(screen.getByRole('button', { name: /^Sep 10, 2026, Groceries$/ })).toBeInTheDocument();
  });

  it('marks a projected row rather than only greying it', () => {
    render(
      <TransactionRow
        occurrence={occurrence({ date: d('2026-09-20'), isProjected: true })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    // Muted grey is not an explanation for a salary in the feed and not in the
    // balance.
    expect(screen.getByText('Not counted yet')).toBeInTheDocument();
  });

  it('says nothing about counting for a row that already happened', () => {
    render(<TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />);
    expect(screen.queryByText('Not counted yet')).not.toBeInTheDocument();
  });

  it('always offers a menu, at the WCAG target size', () => {
    render(<TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />);
    const menu = screen.getByRole('button', { name: /Actions for/ });
    // Swipe is invisible to assistive tech and hover is invisible to a keyboard.
    expect(menu).toBeInTheDocument();
    expect(menu.className).toContain('size-11');
  });

  it('carries the integer amount for e2e, never the formatted string', () => {
    const { container } = render(
      <TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />,
    );
    // Asserting "$45.00" in a test breaks the next time ICU changes a separator.
    expect(container.querySelector('[data-value="-4500"]')).toBeInTheDocument();
  });

  it('names the profile only when its avatar is shown', () => {
    const { rerender } = render(
      <TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />,
    );
    expect(screen.getByRole('button', { name: /^Sep 10, 2026, Groceries$/ })).toBeInTheDocument();

    rerender(
      <TransactionRow
        occurrence={occurrence()}
        context={context({ showProfile: true })}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByRole('button', { name: /^Sep 10, 2026, Groceries, Dana$/ })).toBeInTheDocument();
  });

  it('shows an avatar only in the merged view', () => {
    const { rerender } = render(
      <TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />,
    );
    expect(document.querySelectorAll('svg[role="presentation"]').length).toBe(0);

    rerender(
      <TransactionRow
        occurrence={occurrence()}
        context={context({ showProfile: true })}
        position={1}
        setSize={1}
      />,
    );
    expect(document.querySelectorAll('svg[role="presentation"]').length).toBeGreaterThan(0);
  });

  it('says nothing about type for a regular one-off', () => {
    render(<TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={1} />);
    // Most of the feed; a chip on every row would drown the ones that matter.
    expect(screen.getByRole('button', { name: /^Sep 10, 2026, Groceries$/ })).toBeInTheDocument();
  });

  it('marks a standing order', () => {
    const tx = makeTx({ id: 't1', date: d('2026-03-10'), recurrence: { type: 'monthly', dayOfMonth: 10 } });
    render(
      <TransactionRow
        occurrence={occurrence({ transaction: tx })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByText('Standing order')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Sep 10, 2026, Groceries, Standing order$/ }),
    ).toBeInTheDocument();
  });

  it('numbers an instalment by its slot, not its moved date', () => {
    const tx = makeTx({
      id: 't1',
      date: d('2026-07-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 12 },
    });
    render(
      <TransactionRow
        // The September payment, moved into October: still payment 3.
        occurrence={occurrence({ transaction: tx, date: d('2026-10-02'), originalDate: d('2026-09-10') })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByText('Payment 3 of 12')).toBeInTheDocument();
  });

  it('tells a credit plan from an interest-free one', () => {
    const tx = makeTx({
      id: 't1',
      date: d('2026-09-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 6, plan: 'credit' },
    });
    render(
      <TransactionRow
        occurrence={occurrence({ transaction: tx })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByText('Credit 1 of 6')).toBeInTheDocument();
  });

  it('calls repeating income monthly or yearly, never a standing order', () => {
    const monthly = makeTx({
      id: 't1',
      kind: 'income',
      date: d('2026-01-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
    });
    const { rerender } = render(
      <TransactionRow
        occurrence={occurrence({ transaction: monthly })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByText('Monthly')).toBeInTheDocument();

    const yearly = makeTx({
      id: 't1',
      kind: 'income',
      date: d('2026-09-10'),
      recurrence: { type: 'yearly', month: 9, day: 10 },
    });
    rerender(
      <TransactionRow
        occurrence={occurrence({ transaction: yearly })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByText('Yearly')).toBeInTheDocument();
    expect(screen.queryByText('Standing order')).not.toBeInTheDocument();
  });

  it('falls back to the category id when the category is gone', () => {
    render(
      <TransactionRow
        occurrence={occurrence({ categoryId: 'cat.vanished' })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    // A missing category must render a row, not throw inside the list.
    expect(screen.getByText('cat.vanished')).toBeInTheDocument();
  });
});

describe('DayHeader', () => {
  it('is hidden from assistive tech, because every row carries its own date', () => {
    const { container } = render(
      <DayHeader date={d('2026-09-10')} netMinor={-4500} isToday={false} currency="USD" />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('says "Today" rather than a date', () => {
    render(<DayHeader date={TODAY} netMinor={0} isToday currency="USD" />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('signs the day total explicitly', () => {
    const { container } = render(
      <DayHeader date={d('2026-09-10')} netMinor={5000} isToday={false} currency="USD" />,
    );
    expect(container.querySelector('[data-value="5000"]')?.textContent).toContain('+');
  });
});
