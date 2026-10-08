import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AddMenu } from './add-menu';

function renderMenu(over: Partial<Parameters<typeof AddMenu>[0]> = {}) {
  const props = { disabled: false, aiAvailable: true, onAdd: vi.fn(), onAddWithAi: vi.fn(), ...over };
  renderWithProviders(<AddMenu {...props} />);
  return props;
}

describe('AddMenu', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('offers Expense, Income, a divider, then Smart import, each with its hint', async () => {
    renderMenu();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }));
    const items = await screen.findAllByRole('menuitem');

    expect(items.map((i) => i.textContent)).toEqual([
      'ExpensePurchase, bill, payment',
      'IncomeSalary, refund, gift',
      'Smart importFrom a file or a photo of a statement',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    for (const item of items) expect(item).toHaveClass('min-h-12');
  });

  it('opens the form preset to the kind chosen', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Income/ }));
    expect(props.onAdd).toHaveBeenCalledWith('income');
  });

  it('keeps Enter, Enter as the quickest way to an expense', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    screen.getByRole('button', { name: 'Add' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: /^Expense/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onAdd).toHaveBeenCalledWith('expense');
  });

  it('disables Smart import, with the reason, when there is no account server', async () => {
    renderMenu({ aiAvailable: false });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }));
    const ai = await screen.findByRole('menuitem', { name: /Smart import/ });

    expect(ai).toHaveAttribute('aria-disabled', 'true');
    expect(ai).toHaveTextContent('Needs a Bookandry account');
  });

  it('gives focus back to the pill on Escape', async () => {
    const user = userEvent.setup();
    renderMenu();
    const pill = screen.getByRole('button', { name: 'Add' });

    await user.click(pill);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(pill).toHaveFocus();
  });
});
