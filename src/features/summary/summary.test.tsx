import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { balanceBreakdown, forecastBreakdown } from '@/domain/breakdown';
import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { CollapsedSummaryBar } from './collapsed-bar';
import { MonthCursor } from './month-cursor';
import { BalanceFigure, ForecastLine } from './summary-cards';
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
  parts: { openingMinor: 0, incomeMinor: minor, expenseMinor: 0 },
});

describe('BalanceFigure', () => {
  it('is named Balance, with the date it counts from', () => {
    // "Disposable income" means what is left after essentials, per month; this
    // is a cumulative balance, and the spec's own Hebrew already said so.
    renderWithProviders(<BalanceFigure state={ready(5_325_874)} currency="USD" />);
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText(/since Mar 1, 2026/)).toBeInTheDocument();
  });

  it('announces the SETTLED figure once, not every animation frame', () => {
    const { container } = renderWithProviders(<BalanceFigure state={ready(123_456)} currency="USD" />);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('1,234.56');
    // The visible, animating number is hidden from assistive tech; announcing
    // ~39 intermediate values turns one balance into forty interruptions.
    expect(container.querySelector('[data-value]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('refuses to show a number it cannot compute', () => {
    renderWithProviders(<BalanceFigure state={{ status: 'blocked', currencies: ['EUR'] }} currency="USD" />);
    // Better than a confident figure that is wrong by whatever the rate is.
    expect(screen.getByText(/Needs a rate for EUR/)).toBeInTheDocument();
    expect(document.querySelector('[data-value]')).toBeNull();
  });

  it('shows a skeleton rather than zero while loading', () => {
    const { container } = renderWithProviders(<BalanceFigure state={{ status: 'loading' }} currency="USD" />);
    // A zero that animates up to the real figure makes the wrong number the
    // thing the eye follows.
    expect(container.querySelector('[data-value]')).toBeNull();
  });
});

describe('CollapsedSummaryBar', () => {
  it('keeps the balance, which is the only reason it exists', () => {
    const { container } = renderWithProviders(
      <CollapsedSummaryBar state={ready(5_325_874)} currency="USD" />,
    );
    // The integer, never the formatted string: pinning "$53,258.74" breaks the
    // next time ICU moves a separator.
    expect(container.querySelector('[data-value]')).toHaveAttribute('data-value', '5325874');
  });

  it('says WHY the balance is missing instead of showing a permanent spinner', () => {
    /*
     * `blocked` used to fall through to the loading branch, so scrolling turned
     * an explained problem into a spinner that never resolves - on a disabled
     * button, with no way left to ask what was wrong.
     */
    renderWithProviders(
      <CollapsedSummaryBar state={{ status: 'blocked', currencies: ['EUR'] }} currency="USD" />,
    );

    expect(screen.getByText(/Needs a rate for EUR/)).toBeInTheDocument();
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });

  it('offers the chevron only when there is a breakdown to open', () => {
    const { container } = renderWithProviders(
      <CollapsedSummaryBar
        state={{ status: 'blocked', currencies: ['EUR'] }}
        currency="USD"
        breakdown={balanceBreakdown({ openingMinor: 0, incomeMinor: 0, expenseMinor: 0 })}
        onFullBreakdown={vi.fn()}
      />,
    );
    // An affordance pointing into a sheet the disabled button cannot open.
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('ForecastLine', () => {
  const expense = { total: 381_652, spentSoFar: 361_700, remaining: 19_952 };

  it('splits the month into spent and still due', () => {
    renderWithProviders(
      <ForecastLine expense={expense} currency="USD" month={d('2026-09-01')} today={TODAY} />,
    );
    expect(screen.getByText('Expected this month')).toBeInTheDocument();
    // "Remaining" reads as a budget, and budgets are an explicit non-goal.
    expect(screen.getByText(/still due/)).toBeInTheDocument();
    expect(screen.getByText(/spent so far/)).toBeInTheDocument();
  });

  it('drops the still-due line for a month that is over', () => {
    renderWithProviders(
      <ForecastLine expense={expense} currency="USD" month={d('2026-07-01')} today={TODAY} />,
    );
    expect(screen.getByText('Spent')).toBeInTheDocument();
    // Nothing is "still due" in July when it is September.
    expect(screen.queryByText(/still due/)).not.toBeInTheDocument();
  });

  it('keeps the split exact', () => {
    renderWithProviders(
      <ForecastLine expense={expense} currency="USD" month={d('2026-09-01')} today={TODAY} />,
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

  it('opens a year and its twelve months from the month label', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={onPick} />,
    );

    await user.click(screen.getByRole('button', { name: 'September 2026' }));
    const grid = await screen.findByRole('group', { name: '2026' });
    const months = within(grid).getAllByRole('button');

    expect(months).toHaveLength(12);
    // Reading order: January first, in either language.
    expect(months[0]).toHaveTextContent('Jan');
    expect(within(grid).getByRole('button', { name: 'Sep' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByRole('button', { name: 'Sep' })).toHaveClass('bg-primary');
    // A forecast month is offered, in muted text.
    expect(within(grid).getByRole('button', { name: 'Dec' })).toHaveClass('text-muted-foreground');

    await user.click(within(grid).getByRole('button', { name: 'Mar' }));
    expect(onPick).toHaveBeenCalledWith('2026-03-01');
    expect(screen.queryByRole('group', { name: '2026' })).not.toBeInTheDocument();
  });

  it('disables the months past the horizon, and the year after the last', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MonthCursor month={d('2027-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'September 2027' }));
    const grid = await screen.findByRole('group', { name: '2027' });

    expect(within(grid).getByRole('button', { name: 'Sep' })).toBeEnabled();
    expect(within(grid).getByRole('button', { name: 'Oct' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();
  });

  it('steps the year, and goes back to this month', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(
      <MonthCursor month={d('2026-03-01')} today={TODAY} onStep={vi.fn()} onPick={onPick} />,
    );

    await user.click(screen.getByRole('button', { name: 'March 2026' }));
    await user.click(await screen.findByRole('button', { name: 'Previous year' }));
    expect(await screen.findByRole('group', { name: '2025' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to this month' }));
    expect(onPick).toHaveBeenCalledWith('2026-09-01');
  });

  it('names the pop-out for assistive technology', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'September 2026' }));
    expect(await screen.findByRole('dialog', { name: 'Choose a month' })).toBeInTheDocument();
  });

  it('gives focus back to the label on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
    );
    const label = screen.getByRole('button', { name: 'September 2026' });

    await user.click(label);
    await screen.findByRole('group', { name: '2026' });
    await user.keyboard('{Escape}');
    expect(label).toHaveFocus();
  });

  it('keeps the arrows and the live heading', () => {
    renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'September 2026' })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
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

describe('the panel figures', () => {
  it('sets the balance in the display face, tabular, and a size smaller below 360px', () => {
    renderWithProviders(<BalanceFigure state={ready(5_325_874)} currency="ILS" />);
    const figure = screen.getByTestId('balance-amount');

    expect(figure).toHaveClass('font-display', 'text-[2.75rem]', 'max-[359px]:text-[2.25rem]');
    expect(figure.querySelector('.tabular')).not.toBeNull();
  });

  it('says why the balance is missing in the panel colour, not in red on blue', () => {
    renderWithProviders(<BalanceFigure state={{ status: 'blocked', currencies: ['EUR'] }} currency="ILS" />);

    expect(screen.getByText(/Needs a rate for EUR/)).not.toHaveClass('text-destructive');
  });

  it('sets the forecast in the serif at 1rem, and opens its pop-out', async () => {
    renderWithProviders(
      <ForecastLine
        expense={{ total: 381_652, spentSoFar: 361_700, remaining: 19_952 }}
        currency="ILS"
        month={d('2026-09-01')}
        today={TODAY}
        breakdown={forecastBreakdown([])}
        onFullBreakdown={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /Expected this month/ });

    expect(button.querySelector('.font-display')).toHaveClass('text-base');
    await userEvent.setup().click(button);
    expect(await screen.findByTestId('forecast-popout')).toBeInTheDocument();
  });
});

describe('MonthCursor on the panel', () => {
  it('is one outlined pill, ‹ month ›, whose month never breaks mid-name', () => {
    const { container } = renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} tone="panel" />,
    );

    expect(container.firstElementChild).toHaveClass('rounded-full', 'border-white/35');
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('whitespace-nowrap');
    for (const name of ['Previous month', 'Next month']) {
      expect(screen.getByRole('button', { name })).toHaveClass('size-11');
    }
  });
});

describe('CollapsedSummaryBar on sapphire', () => {
  it('is a slim deep bar with the balance in the serif, at the same height', () => {
    const { container } = renderWithProviders(
      <CollapsedSummaryBar state={ready(5_325_874)} currency="ILS" />,
    );
    const bar = screen.getByTestId('collapsed-summary');

    expect(bar).toHaveClass('bg-brand-deep', 'text-brand-deep-foreground');
    expect(bar.style.height).toBe('calc(48px + env(safe-area-inset-top, 0px))');
    expect(container.querySelector('[data-value]')).toHaveClass('font-display');
  });

  it('opens the balance pop-out from the collapsed bar too', async () => {
    renderWithProviders(
      <CollapsedSummaryBar
        state={ready(5_325_874)}
        currency="ILS"
        breakdown={balanceBreakdown({ openingMinor: 0, incomeMinor: 5_325_874, expenseMinor: 0 })}
        onFullBreakdown={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(await screen.findByTestId('balance-popout')).toBeInTheDocument();
  });
});
