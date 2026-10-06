import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db/db';
import { dropUnfinished, keepUnfinished, listUnfinished } from '@/db/import-drafts';
import { readAccount, readCard } from '@/domain/import-cards';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { UnfinishedNotice } from './unfinished-notice';

const card = (l4: string) => ({
  kind: 'card' as const,
  found: readCard({ s: 0, n: 'Visa', l4, nw: 'Visa', is: 'CAL', cr: '', lim: '', bd: '' }, `k${l4}`, 0, ''),
});

describe('UnfinishedNotice', () => {
  beforeEach(async () => {
    await initTestI18n('en');
    for (const entry of await listUnfinished(db)) await dropUnfinished(db, entry.key);
  });

  it('says nothing when no card waits', async () => {
    await keepUnfinished(
      db,
      [
        {
          kind: 'account',
          found: readAccount({ s: 0, n: 'Leumi', bk: '10', br: '', no: '', h: '' }, 'b1', 0),
        },
      ],
      'p1',
      0,
    );
    renderWithProviders(<UnfinishedNotice kind="card" />);
    // Only an account waits: not the cards screen's to say.
    await expect(screen.findByTestId('unfinished-notice', {}, { timeout: 200 })).rejects.toThrow();
  });

  it('leads straight to the one card waiting', async () => {
    await keepUnfinished(db, [card('3200')], 'p1', 0);
    renderWithProviders(<UnfinishedNotice kind="card" />);
    expect(await screen.findByText('1 card from Smart import is still to finish.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish' })).toHaveAttribute(
      'href',
      '/?import=1&card=card%3A3200',
    );
  });

  it('leads to the list when several wait', async () => {
    await keepUnfinished(db, [card('3200'), card('0400')], 'p1', 0);
    renderWithProviders(<UnfinishedNotice kind="card" />);
    expect(await screen.findByText('2 cards from Smart import are still to finish.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish' })).toHaveAttribute('href', '/?import=1');
  });
});
