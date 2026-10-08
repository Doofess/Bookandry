import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { useTransactionSheet } from './use-transaction-sheet';

function Probe() {
  const sheet = useTransactionSheet();
  const location = useLocation();
  return (
    <>
      <output data-testid="target">{JSON.stringify(sheet.target)}</output>
      <output data-testid="search">{location.search}</output>
      <button
        type="button"
        onClick={() => {
          sheet.openAdd();
        }}
      >
        plain
      </button>
      <button
        type="button"
        onClick={() => {
          sheet.openAdd('income');
        }}
      >
        income
      </button>
    </>
  );
}

const target = () => JSON.parse(screen.getByTestId('target').textContent) as unknown;

describe('useTransactionSheet add', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('writes the kind into the URL', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);

    await user.click(screen.getByRole('button', { name: 'income' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=income');
    expect(target()).toEqual({ mode: 'add', kind: 'income' });
  });

  it('defaults to an expense', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);

    await user.click(screen.getByRole('button', { name: 'plain' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=expense');
  });

  it.each(['/?add=1', '/?add=expense', '/?add=', '/?add=transfer'])(
    'reads %s as an expense, never throwing on a stale or hand-typed link',
    (route) => {
      renderWithProviders(<Probe />, { route });
      expect(target()).toEqual({ mode: 'add', kind: 'expense' });
    },
  );

  it('reads add=income as income', () => {
    renderWithProviders(<Probe />, { route: '/?add=income' });
    expect(target()).toEqual({ mode: 'add', kind: 'income' });
  });
});
