import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AccountSheets } from './account-sheets';
import { BalanceSheet } from './balance-sheet';
import { FeedBoard } from './feed-board';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('the feed board', () => {
  it('is twelve columns from @board, in the order a phone reads it', () => {
    renderWithProviders(
      <FeedBoard
        balance={<p>b</p>}
        month={<p>m</p>}
        categories={<p>c</p>}
        transactions={<p>t</p>}
        wallet={<p>w</p>}
      />,
    );
    const board = document.querySelector('[data-slot="board"]');
    expect(board?.className).toMatch(/@board\/main:grid-cols-12/);
    expect([...(board?.children ?? [])].map((cell) => cell.textContent)).toEqual(['b', 'm', 'c', 't', 'w']);
  });

  it('keeps the numeral at the foot of the balance sheet in one column, and beside the accounts from @wide', () => {
    renderWithProviders(
      <BalanceSheet title="All" subtitle="today" lede="l" figure={<span>fig</span>} accounts={<ul>a</ul>} />,
    );
    const sheet = document.querySelector('[data-slot="balance-sheet"]');
    expect(sheet).toHaveAttribute('data-sheet', 'night');
    expect(sheet?.className).toMatch(/grid-template-areas:'head'_'accounts'_'figure'/);
    expect(sheet?.className).toMatch(/@wide\/main:\[grid-template-areas:'head_accounts'_'figure_accounts'\]/);
  });

  it('fans the account sheets, each in its bank colour, and shows an account with nothing coming without a figure', () => {
    renderWithProviders(
      <AccountSheets
        currency="ILS"
        items={[
          { id: 'a', moneyKey: 'bank-12', name: 'הפועלים', label: 'החשבון של דניאל', figure: 1_375_000 },
          { id: 'b', moneyKey: 'bank-10', name: 'לאומי', label: 'עו״ש משותף' },
        ]}
      />,
    );
    const sheets = document.querySelectorAll('[data-slot="account-sheet"]');
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toHaveAttribute('data-money', 'bank-12');
    expect(sheets[0]?.className).toMatch(/odd:-rotate-\[1\.2deg\]/);
    expect(sheets[0]?.querySelector('[data-numeral-size="account"]')).not.toBeNull();
    expect(sheets[1]?.querySelector('[data-numeral]')).toBeNull();
    expect(screen.getByText('לאומי')).toBeInTheDocument();
  });
});
