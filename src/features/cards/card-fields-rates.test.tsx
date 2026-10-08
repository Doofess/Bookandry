import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CatalogModule from '@/data/card-catalog';
import type { Catalog } from '@/data/card-catalog/types';
import { cardFromDraft, EMPTY_CARD_DRAFT, type CardDraft } from '@/domain/card-draft';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { LocalDate } from '@/types/money';

import { CardFields } from './card-fields';

const SOURCE = { url: 'https://example.test', seen: '2026-09-01' as LocalDate };
const FIXTURE: Catalog = {
  version: 1,
  banks: [],
  issuers: [
    {
      id: 'max',
      name: { en: 'Max', he: 'מקס' },
      tiers: [{ id: 'basic', name: { en: 'Basic', he: 'בסיס' }, issued: true }],
      clubs: [],
      billingDays: [2],
      foreignPosting: 'immediate',
      deals: [
        {
          kind: 'credit',
          label: { en: 'Credit', he: 'קרדיט' },
          abroad: false,
          source: SOURCE,
          rate: {
            basis: { kind: 'prime', margin: '2' },
            quality: 'exact',
            compounding: 12,
            dayCount: '30/360',
            accrues: 'purchase',
            fixedAtPurchase: true,
            source: SOURCE,
          },
        },
      ],
    },
  ],
};

vi.mock('@/app/prime', () => ({
  usePrime: () => ({ primeRate: '4.75', boiRate: '3.25', source: { kind: 'built_in', asOf: '2026-10-04' } }),
}));
vi.mock('@/data/card-catalog', async (original) => ({
  ...(await original<typeof CatalogModule>()),
  loadCatalog: () => Promise.resolve(FIXTURE),
}));

function Harness({ start }: { start?: Partial<CardDraft> }) {
  const [draft, setDraft] = useState<CardDraft>({ ...EMPTY_CARD_DRAFT, ...start });
  return (
    <>
      <CardFields
        draft={draft}
        onChange={(p) => {
          setDraft((d) => ({ ...d, ...p }));
        }}
        invalid={[]}
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

beforeEach(async () => {
  await initTestI18n('en');
});

describe('the card editor rates', () => {
  it('keeps the credit and late inputs for a card that is not linked', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('Credit (קרדיט) interest')).toBeInTheDocument();
    expect(screen.queryByTestId('rate-credit')).toBeNull();
  });

  it('shows the rate table for a linked card, and an override reaches the saved card', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness start={{ catalog: { issuer: 'max', bank: 'none', tier: 'basic', version: 1 } }} />,
    );
    const credit = within(await screen.findByTestId('rate-credit'));
    expect(screen.queryByText('Credit (קרדיט) interest')).toBeNull();
    await user.click(credit.getByRole('button', { name: 'Change Credit' }));
    const input = credit.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '3');
    const draft = JSON.parse(screen.getByTestId('draft').textContent) as CardDraft;
    expect(draft.overrides).toEqual({ credit: { basis: 'prime', margin: '3' } });
    const saved = cardFromDraft(draft, { month: '2026-09' });
    expect(saved.ok && saved.card?.overrides).toEqual({ credit: { basis: 'prime', margin: '3' } });
    await user.click(credit.getByRole('button', { name: /^Back to the catalog's rate for Credit$/ }));
    expect((JSON.parse(screen.getByTestId('draft').textContent) as CardDraft).overrides).toBeUndefined();
  });
});
