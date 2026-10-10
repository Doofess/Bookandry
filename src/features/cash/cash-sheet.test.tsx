import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { CashSheet } from './cash-sheet';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('the cash sheet', () => {
  it('is the yellow cash sheet, with when it was counted and the pot as the huge figure', () => {
    renderWithProviders(
      <CashSheet
        currency="ILS"
        summary={{
          people: [],
          notSetUp: [],
          onHandMinor: 183_000,
          countedOn: d('2026-10-06'),
          expected: { inMinor: 0, outMinor: 0 },
        }}
        actions={<button type="button">Count</button>}
      />,
    );
    const sheet = document.querySelector('[data-slot="cash-sheet"]');
    expect(sheet).toHaveAttribute('data-money', 'cash');
    expect(sheet?.className).toMatch(/rounded-sheet-cash/);
    expect(sheet?.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'cash');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/Cash box/);
    expect(screen.getByRole('button', { name: 'Count' })).toBeInTheDocument();
  });
});
