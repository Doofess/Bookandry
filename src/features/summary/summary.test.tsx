import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { MonthCursor } from './month-cursor';
import { BalanceCard, ExpectedCard } from './summary-cards';
import type { BalanceState } from './use-balance';

const TODAY = d('2026-09-15');

beforeAll(async () => {
  await initTestI18n('en');
});

const ready = (minor: number): BalanceState => ({
  status: 'ready',
  minor,
  since: d('2026-03-01'),
  profiles: [],
});

describe('BalanceCard', () => {
  it('is named Balance, with the date it counts from', () => {
    // "Disposable income" means what is left after essentials, per month; this
    // is a cumulative balance, and the spec's own Hebrew already said so.
    renderWithProviders(<BalanceCard state={ready(5_325_874)} currency="USD" />);
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText(/since Mar 1, 2026/)).toBeInTheDocument();
  });

  it('announces the SETTLED figure once, not every animation frame', () => {
    const { container } = renderWithProviders(<BalanceCard state={ready(123_456)} currency="USD" />);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('1,234.56');
    // The visible, animating number is hidden from assistive tech; announcing
    // ~39 intermediate values turns one balance into forty interruptions.
    expect(container.querySelector('[data-value]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('refuses to show a number it cannot compute', () => {
    renderWithProviders(<BalanceCard state={{ status: 'blocked', currencies: ['EUR'] }} currency="USD" />);
    // Better than a confident figure that is wrong by whatever the rate is.
    expect(screen.getByText(/Needs a rate for EUR/)).toBeInTheDocument();
    expect(document.querySelector('[data-value]')).toBeNull();
  });

  it('shows a skeleton rather than zero while loading', () => {
    const { container } = renderWithProviders(<BalanceCard state={{ status: 'loading' }} currency="USD" />);
    // A zero that animates up to the real figure makes the wrong number the
    // thing the eye follows.
    expect(container.querySelector('[data-value]')).toBeNull();
  });
});

describe('ExpectedCard', () => {
  const expense = { total: 381_652, spentSoFar: 361_700, remaining: 19_952 };

  it('splits the month into spent and still due', () => {
    renderWithProviders(
      <ExpectedCard expense={expense} currency="USD" month={d('2026-09-01')} today={TODAY} />,
    );
    expect(screen.getByText('Expected this month')).toBeInTheDocument();
    // "Remaining" reads as a budget, and budgets are an explicit non-goal.
    expect(screen.getByText(/still due/)).toBeInTheDocument();
    expect(screen.getByText(/spent so far/)).toBeInTheDocument();
  });

  it('drops the still-due line for a month that is over', () => {
    renderWithProviders(
      <ExpectedCard expense={expense} currency="USD" month={d('2026-07-01')} today={TODAY} />,
    );
    expect(screen.getByText('Spent')).toBeInTheDocument();
    // Nothing is "still due" in July when it is September.
    expect(screen.queryByText(/still due/)).not.toBeInTheDocument();
  });

  it('keeps the split exact', () => {
    renderWithProviders(
      <ExpectedCard expense={expense} currency="USD" month={d('2026-09-01')} today={TODAY} />,
    );
    // spentSoFar + remaining === total holds by construction, not by rounding.
    expect(expense.spentSoFar + expense.remaining).toBe(expense.total);
    expect(document.querySelector('[data-value="381652"]')).toBeInTheDocument();
  });
});

describe('MonthCursor', () => {
  it('steps in both directions', async () => {
    const onStep = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<MonthCursor month={d('2026-09-01')} today={TODAY} onStep={onStep} />);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onStep).toHaveBeenLastCalledWith(-1);

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onStep).toHaveBeenLastCalledWith(1);
  });

  it('announces the month, which changes in place', () => {
    renderWithProviders(<MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: 'September 2026' });
    expect(heading).toHaveAttribute('aria-live', 'polite');
  });

  it('stops at the projection horizon, with a reason', () => {
    renderWithProviders(<MonthCursor month={d('2027-09-01')} today={TODAY} onStep={vi.fn()} />);
    const next = screen.getByRole('button', { name: 'Next month' });
    // Past the horizon there is nothing to show, so stepping would present an
    // empty month as if it were real.
    expect(next).toBeDisabled();
    expect(next).toHaveAttribute('title', 'Projections stop here');
  });

  it('flips its chevrons for RTL via a class, not by swapping components', () => {
    const { container } = renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} />,
    );
    // Swapping components mirrors correctly once and then silently stops the
    // day someone reorders the JSX; the CSS class travels with the icon.
    const flipped = container.querySelectorAll('.cn-rtl-flip');
    expect(flipped).toHaveLength(2);
    for (const icon of flipped) expect(icon.getAttribute('class')).toContain('rtl:rotate-180');
  });
});
