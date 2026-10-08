import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence } from '@/types/domain';

import { useTransactionSheet } from './use-transaction-sheet';

/** Only what `openDuplicate` reads: the transaction's id and kind, and the slot. */
const fakeOccurrence = {
  transaction: { id: 'salary', kind: 'income' },
  originalDate: '2026-09-10',
} as unknown as Occurrence;

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
      <button
        type="button"
        onClick={() => {
          sheet.openDuplicate(fakeOccurrence);
        }}
      >
        duplicate
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

  it('writes a duplicate as an add of the row kind, naming its source slot', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);

    await user.click(screen.getByRole('button', { name: 'duplicate' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=income&from=salary&at=2026-09-10');
    expect(target()).toEqual({
      mode: 'add',
      kind: 'income',
      from: { transactionId: 'salary', at: '2026-09-10' },
    });
  });

  it('reads a duplicate link back', () => {
    renderWithProviders(<Probe />, { route: '/?add=expense&from=rent&at=2026-09-10' });
    expect(target()).toEqual({
      mode: 'add',
      kind: 'expense',
      from: { transactionId: 'rent', at: '2026-09-10' },
    });
  });

  it.each([
    '/?add=expense&from=rent',
    '/?add=expense&from=rent&at=soon',
    '/?add=expense&from=&at=2026-09-10',
  ])('reads %s as a plain add', (route) => {
    renderWithProviders(<Probe />, { route });
    expect(target()).toEqual({ mode: 'add', kind: 'expense' });
  });
});
