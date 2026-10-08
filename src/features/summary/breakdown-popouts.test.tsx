import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { balanceBreakdown, forecastBreakdown } from '@/domain/breakdown';
import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { BalancePopover, ForecastPopover } from './breakdown-popouts';
import { BalanceBreakdownSheet } from './breakdown-sheet';

beforeAll(async () => {
  await initTestI18n('en');
});

const balance = balanceBreakdown({
  openingMinor: 100_000,
  incomeMinor: 50_000,
  expenseMinor: 30_000,
  cardPendingMinor: 4_500,
});

const PENDING = 'Not in the balance yet: bought by card, not yet charged';

/** The pending line: below the total, and an amount on its own, never a minus. */
function expectPendingApart(within_: HTMLElement): void {
  const term = [...within_.querySelectorAll('dt')].find((t) => t.textContent === PENDING);
  const amount = term?.nextElementSibling?.textContent ?? '';
  expect(amount).toMatch(/45/);
  expect(amount).not.toMatch(/[-−]/);
}

describe('BalancePopover', () => {
  it('lists the parts in order, ends with the full breakdown, and hands focus back', async () => {
    const user = userEvent.setup();
    const onFull = vi.fn();
    renderWithProviders(
      <BalancePopover
        breakdown={balance}
        since={d('2026-03-01')}
        currency="ILS"
        onFullBreakdown={onFull}
        triggerClassName=""
        triggerLabel="Show what makes up Balance"
      >
        ₪1,200
      </BalancePopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Show what makes up Balance' });

    await user.click(trigger);
    const pop = await screen.findByTestId('balance-popout');
    expect(screen.getByRole('dialog', { name: 'Balance' })).toBe(pop);
    const terms = within(pop)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual(['Income', 'Expenses', 'Balance', PENDING]);
    expectPendingApart(pop);
    expect(pop.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: /Full breakdown/ }));
    expect(onFull).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('balance-popout')).not.toBeInTheDocument();
  });
});

describe('ForecastPopover', () => {
  it('shows the four largest groups, "and 1 more", and the total, and hands focus back', async () => {
    const user = userEvent.setup();
    const forecast = forecastBreakdown([
      { kind: 'recurring', totalMinor: 500, occurrences: [] },
      { kind: 'loans', totalMinor: 900, occurrences: [] },
      { kind: 'installments', totalMinor: 100, occurrences: [] },
      { kind: 'yearly', totalMinor: 700, occurrences: [] },
      { kind: 'one_time', totalMinor: 300, occurrences: [] },
    ]);
    renderWithProviders(
      <ForecastPopover
        breakdown={forecast}
        month={d('2026-09-01')}
        currency="ILS"
        onFullBreakdown={vi.fn()}
        triggerClassName=""
        triggerLabel="Show what makes up Expected this month"
      >
        ₪25
      </ForecastPopover>,
    );
    const trigger = screen.getByRole('button', { name: /Expected this month/ });

    await user.click(trigger);
    const pop = await screen.findByTestId('forecast-popout');
    expect(screen.getByRole('dialog', { name: 'Expected this month' })).toBe(pop);
    const terms = within(pop)
      .getAllByRole('term')
      .map((t) => t.textContent);

    expect(terms).toEqual(['Loans', 'Once a year', 'Every month', 'One-off', 'Expected this month']);
    expect(pop).toHaveTextContent('and 1 more');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});

describe('BalanceBreakdownSheet', () => {
  it('lists the same lines as the pop-out, without a starting balance', () => {
    renderWithProviders(
      <BalanceBreakdownSheet
        open
        onOpenChange={vi.fn()}
        breakdown={balance}
        since={d('2026-03-01')}
        currency="ILS"
      />,
    );
    const terms = within(screen.getByRole('dialog'))
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual(['Income', 'Expenses', 'Balance', PENDING]);
    expectPendingApart(screen.getByRole('dialog'));
  });
});
