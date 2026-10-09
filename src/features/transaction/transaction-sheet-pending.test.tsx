import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Catalog } from '@/data/card-catalog/types';
import { db } from '@/db/db';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, PaymentMethod, Profile } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { TransactionSheet } from './transaction-sheet';

// The catalog's load, held open until the test lets it through.
const gate = vi.hoisted(() => {
  let release: (() => void) | undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release: () => release?.() };
});

vi.mock('@/data/card-catalog', async (importOriginal) => {
  const real = await importOriginal<{ loadCatalog: () => Promise<Catalog> }>();
  return {
    ...real,
    loadCatalog: async () => {
      await gate.opened;
      return real.loadCatalog();
    },
  };
});

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const TODAY = '2026-10-08' as LocalDate;

const groceries: Category = {
  id: 'cat.groceries',
  kind: 'expense',
  icon: 'Circle',
  sortOrder: 0,
  isArchived: 0,
  source: 'builtin',
  nameKey: 'categories:builtin.groceries',
  createdAt: NOW,
  updatedAt: NOW,
};
const profile = {
  id: 'p1',
  name: 'Dana',
  color: '#16794a',
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'ILS',
  openingBalanceDate: '2026-01-01',
  createdAt: NOW,
  updatedAt: NOW,
} as Profile;

/** Linked, with no credit rate of its own: until the catalog answers, nothing prices its קרדיט. */
const maxCard: PaymentMethod = {
  id: 'pm.max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card: { billingDay: 10, catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 } },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
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
  await db.transactions.clear();
});

describe('a purchase on a linked card whose catalog entry is still loading', () => {
  it('does not save an interest-bearing deal at 0% before the card’s rate is known', async () => {
    renderWithProviders(
      <TransactionSheet
        target={{ mode: 'add', kind: 'expense' }}
        onOpenChange={() => undefined}
        profiles={[profile]}
        categories={[groceries]}
        paymentMethods={[maxCard]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={() => undefined}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Amount'), '3000');
    await user.click(screen.getByRole('combobox', { name: /Paid with/ }));
    await user.click(await screen.findByRole('option', { name: /Max/ }));
    await user.click(await screen.findByRole('radio', { name: 'Credit installment' }));

    expect(screen.getByLabelText('Annual interest')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Typed by hand, the rate is the person's own, and the save goes ahead.
    await user.type(screen.getByLabelText('Annual interest'), '15.5');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    gate.release();
  });
});
