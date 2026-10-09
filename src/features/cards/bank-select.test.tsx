import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { BankSelect } from './bank-select';

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(() => {
  // The list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

const render = (value: string) =>
  renderWithProviders(
    <>
      <span id="bank">Bank</span>
      <BankSelect value={value} onChange={vi.fn()} labelledBy="bank" />
    </>,
  );

describe('the bank picker’s marks', () => {
  it('shows the chosen bank by its logo', () => {
    render('10');

    const trigger = screen.getByRole('combobox', { name: /Bank Leumi/ });
    expect(trigger.querySelector('img[data-brand="bank-10"]')).not.toBeNull();
  });

  it('starts each listed bank with its logo, and a bank with none with a neutral landmark', async () => {
    const user = userEvent.setup();
    render('');

    await user.click(screen.getByRole('combobox', { name: /Bank/ }));
    const leumi = await screen.findByRole('option', { name: /^10\s?Bank Leumi/ });
    const jerusalem = screen.getByRole('option', { name: /^54\s?Bank of Jerusalem/ });

    expect(leumi.querySelector('img[data-brand="bank-10"]')).not.toBeNull();
    expect(jerusalem.querySelector('img')).toBeNull();
    expect(jerusalem.querySelector('[data-slot="neutral-mark"] svg')).not.toBeNull();
  });
});
