import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { CARD_FEE_PREFIX } from '@/domain/cards';
import { MONEY, d, makeTx } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import {
  CASH_METHOD_ID,
  type Category,
  type Occurrence,
  type PaymentMethod,
  type Profile,
} from '@/types/domain';

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
    expect(document.querySelector('[data-person="p1"]')).toBeNull();

    rerender(
      <TransactionRow
        occurrence={occurrence()}
        context={context({ showProfile: true })}
        position={1}
        setSize={1}
      />,
    );
    expect(document.querySelector('[data-person="p1"]')).not.toBeNull();
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

  it('counts a loan out in repayments', () => {
    const tx = makeTx({
      id: 't1',
      date: d('2026-07-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 360, plan: 'loan', creditAnnualRate: '5' },
    });
    render(
      <TransactionRow
        occurrence={occurrence({ transaction: tx })}
        context={context()}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByText('Loan 3 of 360')).toBeInTheDocument();
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

  it('draws the same sapphire chip for income and expense; the amount carries direction', () => {
    const income = occurrence({
      transaction: makeTx({
        id: 't2',
        kind: 'income',
        date: d('2026-09-10'),
        recurrence: { type: 'one_time' },
      }),
    });
    const { container } = render(
      <>
        <TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={2} />
        <TransactionRow occurrence={income} context={context()} position={2} setSize={2} />
      </>,
    );
    const chips = container.querySelectorAll('[data-slot="category-chip"]');

    expect(chips).toHaveLength(2);
    for (const chip of chips) expect(chip).toHaveClass('bg-accent', 'text-accent-foreground');
    expect(container.querySelectorAll('.bg-muted.text-muted-foreground.size-9')).toHaveLength(0);
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

  it('makes the chip a button that reports itself, except on card-fee and skipped rows', async () => {
    await initTestI18n('en');
    const onCategory = vi.fn();
    const { rerender } = renderWithProviders(
      <TransactionRow
        occurrence={occurrence()}
        context={context()}
        position={1}
        setSize={1}
        onCategory={onCategory}
      />,
    );
    const chip = screen.getByRole('button', { name: /Category: .*Change it/ });

    expect(chip).toHaveClass('size-11');
    await userEvent.setup().click(chip);
    expect(onCategory).toHaveBeenCalledWith(expect.objectContaining({ key: 't1@2026-09-10' }), chip);

    rerender(
      <TransactionRow
        occurrence={occurrence({ isSkipped: true })}
        context={context()}
        position={1}
        setSize={1}
        onCategory={onCategory}
      />,
    );
    expect(screen.queryByRole('button', { name: /Category: / })).not.toBeInTheDocument();
  });

  it('draws no chip button on a card fee, which is changed where the card is', () => {
    render(
      <TransactionRow
        occurrence={occurrence({ seriesId: `${CARD_FEE_PREFIX}visa` })}
        context={context()}
        position={1}
        setSize={1}
        onCategory={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Category: / })).not.toBeInTheDocument();
  });

  it('makes "not counted yet" a button on a projected row, and still opens the row from anywhere else', async () => {
    const user = userEvent.setup();
    const onProjected = vi.fn();
    const onOpen = vi.fn();
    const onMenu = vi.fn();
    renderWithProviders(
      <TransactionRow
        occurrence={occurrence({ isProjected: true })}
        context={context()}
        position={1}
        setSize={1}
        onOpen={onOpen}
        onMenu={onMenu}
        onCategory={vi.fn()}
        onProjected={onProjected}
      />,
    );
    const chip = screen.getByRole('button', { name: 'Not counted yet. Change it' });

    await user.click(chip);
    expect(onProjected).toHaveBeenCalledWith(expect.objectContaining({ isProjected: true }), chip);
    expect(onOpen).not.toHaveBeenCalled();
    // No button inside a button anywhere in the row.
    expect(document.querySelector('button button')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Sep 10, 2026, Groceries$/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    // Task 7's ⋯ still reports its own button.
    const more = screen.getByRole('button', { name: /Actions for/ });
    await user.click(more);
    expect(onMenu).toHaveBeenCalledWith(expect.objectContaining({ isProjected: true }), more);
  });

  it('shows no "not counted yet" button on a past occurrence', () => {
    render(
      <TransactionRow
        occurrence={occurrence()}
        context={context()}
        position={1}
        setSize={1}
        onProjected={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Not counted yet/ })).not.toBeInTheDocument();
  });

  it('keeps "not counted yet" a plain flag on a card fee or a skipped row', () => {
    const { rerender } = render(
      <TransactionRow
        occurrence={occurrence({ isProjected: true, seriesId: `${CARD_FEE_PREFIX}visa` })}
        context={context()}
        position={1}
        setSize={1}
        onProjected={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Not counted yet/ })).not.toBeInTheDocument();
    expect(screen.getByText('Not counted yet')).toBeInTheDocument();

    rerender(
      <TransactionRow
        occurrence={occurrence({ isProjected: true, isSkipped: true })}
        context={context()}
        position={1}
        setSize={1}
        onProjected={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Not counted yet/ })).not.toBeInTheDocument();
  });

  it('stretches its own button over the whole row, so an inert chip still opens it', () => {
    /*
     * On a card fee or a skipped row the category chip is not a button, and it
     * sits outside the row's button in the DOM. The row's button covers the
     * whole row, and only the other buttons rise above it, so a tap
     * on the inert chip lands on the row. jsdom cannot hit-test: the tap itself
     * is the e2e @cards fee test's.
     */
    render(
      <TransactionRow
        occurrence={occurrence({ seriesId: `${CARD_FEE_PREFIX}visa` })}
        context={context()}
        position={1}
        setSize={1}
        onCategory={vi.fn()}
      />,
    );
    const row = screen.getByRole('listitem');
    const main = screen.getByRole('button', { name: /^Sep 10, 2026, Groceries$/ });
    const inert = row.querySelector('[data-slot="category-chip"]')?.parentElement;

    expect(row).toHaveClass('relative');
    expect(main).toHaveClass('absolute', 'inset-0');
    expect(inert?.tagName).toBe('SPAN');
    expect(inert?.className).not.toMatch(/\b(z-|relative)/);
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

describe('the card an expense was paid with', () => {
  const at = '2026-01-01T00:00:00.000Z' as PaymentMethod['createdAt'];
  const card = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
    id: 'visa',
    profileId: 'p1',
    type: 'credit_card',
    label: 'Max Gold',
    card: { lastDigits: '3214' },
    isArchived: 0,
    createdAt: at,
    updatedAt: at,
    ...over,
  });
  const paidWith = (method: PaymentMethod) =>
    render(
      <TransactionRow
        occurrence={occurrence({ paymentMethodId: method.id })}
        context={context({ methods: new Map([[method.id, method]]) })}
        position={1}
        setSize={1}
      />,
    );

  it('shows a card icon and its last four digits, and says so', () => {
    paidWith(card());
    expect(screen.getByTestId('row-card').textContent).toBe('3214');
    // Cut short below sm: the full name is a hover away.
    expect(screen.getByTestId('row-card')).toHaveAttribute('title', 'Max Gold');
    expect(
      screen.getByRole('button', { name: /^Sep 10, 2026, Groceries, Card ending 3214$/ }),
    ).toBeInTheDocument();
  });

  it('shows the card’s name when its digits are not known', () => {
    paidWith(card({ card: {} }));
    expect(screen.getByTestId('row-card').textContent).toBe('Max Gold');
    expect(
      screen.getByRole('button', { name: /^Sep 10, 2026, Groceries, Paid with Max Gold$/ }),
    ).toBeInTheDocument();
  });

  it('shows nothing for cash, or for money in', () => {
    paidWith(card({ id: 'pm.cash', type: 'cash', label: 'Cash' }));
    expect(screen.queryByTestId('row-card')).not.toBeInTheDocument();
  });
});

describe('where income went', () => {
  const at = '2026-01-01T00:00:00.000Z' as PaymentMethod['createdAt'];
  const leumi: PaymentMethod = {
    id: 'leumi',
    profileId: 'p1',
    type: 'bank_account',
    label: 'Leumi current',
    account: { bank: '10', holding: 'personal' },
    isArchived: 0,
    createdAt: at,
    updatedAt: at,
  };
  const cash: PaymentMethod = {
    ...leumi,
    id: CASH_METHOD_ID,
    profileId: '*',
    type: 'cash',
    label: 'Cash',
    account: undefined,
  };
  const income = (destinationId: string | undefined, kind: 'income' | 'expense' = 'income') =>
    occurrence({
      transaction: makeTx({ id: 't1', kind, date: d('2026-09-10'), recurrence: { type: 'one_time' } }),
      ...(destinationId === undefined ? {} : { destinationId }),
    });
  const show = (o: Occurrence) =>
    render(
      <TransactionRow
        occurrence={o}
        context={context({ methods: new Map([leumi, cash].map((m) => [m.id, m])) })}
        position={1}
        setSize={1}
      />,
    );

  it('shows the bank’s mark and the account, and says so', () => {
    show(income('leumi'));
    const chip = screen.getByTestId('row-destination');
    expect(chip).toHaveTextContent('Leumi current');
    expect(chip.querySelector('img[data-brand="bank-10"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Sep 10, 2026.*, Into Leumi current$/ })).toBeInTheDocument();
  });

  it('shows the cash icon for cash', () => {
    show(income(CASH_METHOD_ID));
    const chip = screen.getByTestId('row-destination');
    expect(chip).toHaveTextContent('Cash');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Sep 10, 2026.*, Into Cash$/ })).toBeInTheDocument();
  });

  it('shows nothing when it is not assigned, names an account that is gone, or is on an expense', () => {
    for (const o of [income(undefined), income('gone'), income('leumi', 'expense')]) {
      const { unmount } = show(o);
      expect(screen.queryByTestId('row-destination')).toBeNull();
      unmount();
    }
  });

  it('still shows an archived account: the row keeps its label', () => {
    const archived = { ...leumi, isArchived: 1 as const };
    render(
      <TransactionRow
        occurrence={income('leumi')}
        context={context({ methods: new Map([[archived.id, archived]]) })}
        position={1}
        setSize={1}
      />,
    );
    expect(screen.getByTestId('row-destination')).toHaveTextContent('Leumi current');
  });

  it('says so in Hebrew', async () => {
    await initTestI18n('he');
    try {
      show(income('leumi'));
      expect(screen.getAllByRole('button', { name: /נכנס ל.*Leumi current$/ }).length).toBeGreaterThan(0);
    } finally {
      await initTestI18n('en');
    }
  });
});
