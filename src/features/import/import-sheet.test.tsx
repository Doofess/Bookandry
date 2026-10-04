import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { WireRequest } from '@/domain/import-wire';
import { wireRow } from '@/domain/test-factories';
import type { ExtractOutcome } from '@/services/supabase/extract';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Profile } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

const reader = vi.hoisted(() => ({
  calls: [] as WireRequest[],
  answers: [] as ExtractOutcome[],
}));

vi.mock('@/app/account', () => ({
  accountController: () => ({
    extractTransactions: (request: WireRequest) => {
      reader.calls.push(request);
      return Promise.resolve(reader.answers.shift() ?? { ok: false, error: 'upstream' });
    },
  }),
}));

const { ImportSheet } = await import('./import-sheet');
const { db } = await import('@/db/db');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const category = (id: string, kind: 'income' | 'expense'): Category => ({
  id,
  kind,
  icon: 'Circle',
  sortOrder: 0,
  isArchived: 0,
  source: 'builtin',
  nameKey: `categories:builtin.${id.slice(4)}`,
  createdAt: NOW,
  updatedAt: NOW,
});
const profile: Profile = {
  id: 'p1',
  name: 'Dana',
  color: 'blue',
  avatar: { kind: 'emoji', value: '🙂' },
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Profile;
const usage = { in: 10, out: 10, cacheRead: 0, cacheWrite: 0 };

describe('Add with AI', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('reads a file, shows what it found with what needs a look apart, and adds only what is ticked', async () => {
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          r: [
            wireRow({ d: '03/09/26', a: '120.50', m: 'Shufersal' }),
            wireRow({ d: '04/09/26', a: '245.00', m: 'Paz' }),
            // Not printed anywhere in the file.
            wireRow({ d: '05/09/26', a: '99.00', m: 'Ghost' }),
          ],
          t: [],
          per: null,
          done: true,
        },
      },
      // The second look finds nothing better: the ghost stays flagged.
      { ok: true, usage, result: { r: [] } },
    ];
    const onSaved = vi.fn<(date: LocalDate) => void>();
    const user = userEvent.setup();
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        profiles={[profile]}
        categories={[category('cat.groceries', 'expense'), category('cat.salary', 'income')]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={onSaved}
      />,
    );

    const text = '03/09/26 Shufersal 120.50\n04/09/26 Paz 245.00\n';
    await user.upload(
      screen.getByTestId('import-input'),
      new File([text], 'statement.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    await screen.findByRole('button', { name: 'Ready (2)' });
    expect(screen.getByRole('button', { name: 'Check this (1)' })).toBeInTheDocument();
    expect(screen.getByText("Check the amount: it isn't in the file.")).toBeInTheDocument();
    // What was sent: the file's text, and the household's categories by alias - never ids.
    const first = reader.calls[0];
    expect(first?.mode === 'extract' && first.sources[0]).toMatchObject({ kind: 'text', text });
    expect(first?.ctx.cats.map((c) => c.a)).toEqual(['c1', 'c2']);

    // The flagged row is not ticked; the two that check out are.
    expect(screen.getByRole('checkbox', { name: 'Add Ghost' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Add Shufersal' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Add Paz' }));
    await user.click(screen.getByTestId('import-add'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('2026-09-03');
    });
    const saved = await db.transactions.toArray();
    expect(saved.map((t) => [t.note, t.money.baseAmountMinor, t.categoryId])).toEqual([
      ['Shufersal', 12_050, 'cat.groceries'],
    ]);
  });

  it('says why a file was refused, and offers another', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        profiles={[profile]}
        categories={[category('cat.groceries', 'expense')]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={() => undefined}
      />,
    );
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['not an image'], 'broken.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));
    const list = await screen.findByText("We didn't find any transactions in these files.");
    expect(list).toBeInTheDocument();
    expect(within(document.body).getAllByText("This file couldn't be opened.").length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Choose other files' })).toBeInTheDocument();
  });
});
