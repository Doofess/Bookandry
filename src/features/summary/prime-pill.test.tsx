import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { PrimePill } from './prime-pill';

vi.mock('@/app/prime', () => ({
  usePrime: () => ({
    primeRate: '4.75',
    boiRate: '3.25',
    source: { kind: 'built_in', asOf: d('2026-10-08') },
  }),
}));

describe('PrimePill', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('shows prime on the panel as a pill', () => {
    renderWithProviders(<PrimePill />);
    const pill = screen.getByTestId('prime-pill');

    expect(pill).toHaveTextContent('Prime');
    expect(pill).toHaveTextContent('4.75%');
    expect(pill).toHaveClass('rounded-full', 'min-h-11');
  });

  it('opens what the strip carried, and gives focus back on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrimePill />);
    const pill = screen.getByTestId('prime-pill');

    await user.click(pill);
    const popout = await screen.findByTestId('prime-popout');
    expect(popout).toHaveTextContent('Prime rate');
    expect(popout).toHaveTextContent('3.25%');
    expect(popout).toHaveTextContent('As of');

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('prime-popout')).not.toBeInTheDocument();
    expect(pill).toHaveFocus();
  });

  it('reads in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<PrimePill />);
    expect(screen.getByTestId('prime-pill')).toHaveTextContent('פריים');
    await initTestI18n('en');
  });
});
