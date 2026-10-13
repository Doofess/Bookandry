import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Profile } from '@/types/domain';

import { CashPerson } from './cash-person';

beforeAll(async () => {
  await initTestI18n('en');
});

const noa = { id: 'noa', name: 'Noa', color: '#0f766e' } as Profile;

describe("a person's cash", () => {
  it('is a sheet with their amount, when they counted, and the three things they can do', async () => {
    const onDeposit = vi.fn();
    renderWithProviders(
      <CashPerson
        person={noa}
        cash={{ profileId: 'noa', since: d('2026-10-01'), onHandMinor: 50_000, countedOn: d('2026-10-06') }}
        currency="ILS"
        onCount={vi.fn()}
        onWithdraw={vi.fn()}
        onDeposit={onDeposit}
      />,
    );
    const sheet = document.querySelector('[data-slot="cash-person"]');
    expect(sheet).toHaveAttribute('data-sheet', 'paper');
    expect(sheet?.querySelector('[data-numeral-size="account"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Noa/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    expect(onDeposit).toHaveBeenCalled();
    expect(document.querySelectorAll('[data-variant="pill"]')).toHaveLength(3);
  });
});
