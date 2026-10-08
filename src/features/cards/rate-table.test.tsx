import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedCard } from '@/data/card-catalog/resolve';
import type { CatalogRate, DealRule } from '@/data/card-catalog/types';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { CardDetails } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { RateTable } from './rate-table';

vi.mock('@/app/prime', () => ({
  usePrime: () => ({
    primeRate: '4.75',
    boiRate: '3.25',
    source: { kind: 'built_in', asOf: '2026-10-04' },
  }),
}));

const SOURCE = { url: 'https://example.test/rates', seen: '2026-09-01' as LocalDate };
const rate = (over: Partial<CatalogRate> = {}): CatalogRate => ({
  basis: { kind: 'prime', margin: '10.5' },
  quality: 'exact',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'purchase',
  fixedAtPurchase: true,
  source: SOURCE,
  ...over,
});
const deal = (
  kind: DealRule['kind'],
  en: string,
  r?: CatalogRate,
  over: Partial<DealRule> = {},
): DealRule => ({
  kind,
  label: { en, he: `${en}-he` },
  abroad: false,
  ...(r ? { rate: r } : {}),
  source: SOURCE,
  ...over,
});

function resolvedOf(deals: DealRule[], extra: ResolvedCard['extra'] = {}): ResolvedCard {
  return {
    issuer: { id: 'max' } as ResolvedCard['issuer'],
    bank: undefined,
    tier: 'basic',
    billingDays: [2],
    foreignPosting: 'immediate',
    deals: deals.map((d) => ({ ...d, from: 'issuer' as const })),
    extra,
  };
}

const card: CardDetails = { catalog: { issuer: 'max', bank: 'none', tier: 'basic', version: 1 } };

function setup(resolved: ResolvedCard, c: CardDetails = card) {
  const onOverride = vi.fn();
  // The editor keeps the overrides, as the card editor does.
  function Held() {
    const [overrides, setOverrides] = useState(c.overrides);
    return (
      <RateTable
        card={{ ...c, ...(overrides === undefined ? {} : { overrides }) }}
        resolved={resolved}
        onOverride={(kind, term) => {
          onOverride(kind, term);
          const { [kind]: _was, ...rest } = overrides ?? {};
          setOverrides(term === null ? rest : { ...rest, [kind]: term });
        }}
      />
    );
  }
  renderWithProviders(<Held />);
  return { onOverride, user: userEvent.setup() };
}
const row = (kind: string) => within(screen.getByTestId(`rate-${kind}`));

beforeEach(async () => {
  await initTestI18n('en');
});

describe('rate table', () => {
  it('shows prime plus margin, the annual rate and the effective rate', () => {
    setup(resolvedOf([deal('credit', 'Credit', rate())]));
    // prime 4.75 + 10.5 = 15.25
    expect(screen.getByTestId('rate-credit')).toHaveTextContent(
      'Prime + 10.50 · 15.25% annual · 16.36% effective (מתואמת)',
    );
  });

  it('uses four periods for a quarterly rate', () => {
    setup(resolvedOf([deal('credit', 'Credit', rate({ compounding: 4 }))]));
    expect(screen.getByTestId('rate-credit')).toHaveTextContent('15.25% annual · 16.14% effective');
  });

  it('tags a maximum, a published, a derived, a statement and a changed rate', () => {
    setup(
      resolvedOf([
        deal('credit', 'Credit', rate({ quality: 'max' })),
        deal('installments', 'Installments', rate()),
        deal('deferred', 'Deferred', rate({ quality: 'derived' })),
        deal('regular', 'Regular', rate({ basis: null })),
        deal('long_credit', 'Long', rate()),
      ]),
      {
        ...card,
        overrides: {
          regular: { basis: 'fixed', rate: '12' },
          long_credit: { basis: 'fixed', rate: '9' },
        },
      },
    );
    expect(row('credit').getByText('Up to')).toBeInTheDocument();
    expect(row('installments').getByText('Published')).toBeInTheDocument();
    expect(row('deferred').getByText('Worked out from the published margin')).toBeInTheDocument();
    expect(row('regular').getByText('From your statement')).toBeInTheDocument();
    expect(row('long_credit').getByText('Changed by you')).toBeInTheDocument();
  });

  it('asks for an unpublished rate and saves what is typed as an override', async () => {
    const { onOverride, user } = setup(resolvedOf([deal('credit', 'Credit', rate({ basis: null }))]));
    expect(row('credit').getByText('Enter it from your statement or welcome letter')).toBeInTheDocument();
    await user.type(row('credit').getByRole('textbox'), '1.5');
    expect(onOverride).toHaveBeenLastCalledWith('credit', { basis: 'prime', margin: '1.5' });
    await user.click(row('credit').getByRole('radio', { name: 'Fixed' }));
    expect(onOverride).toHaveBeenLastCalledWith('credit', { basis: 'fixed', rate: '1.5' });
  });

  it('writes an override from Change, and clears it with "Back to the catalog\'s rate"', async () => {
    const { onOverride, user } = setup(resolvedOf([deal('credit', 'Credit', rate())]), {
      ...card,
      overrides: { credit: { basis: 'prime', margin: '8' } },
    });
    expect(screen.getByTestId('rate-credit')).toHaveTextContent('Prime + 8.00 · 12.75%');
    await user.click(row('credit').getByRole('button', { name: /^Back to the catalog's rate for Credit$/ }));
    expect(onOverride).toHaveBeenCalledWith('credit', null);
  });

  it('opens an edit on a published row', async () => {
    const { onOverride, user } = setup(resolvedOf([deal('credit', 'Credit', rate())]));
    await user.click(row('credit').getByRole('button', { name: 'Change Credit' }));
    const input = row('credit').getByRole('textbox');
    await user.clear(input);
    await user.type(input, '7');
    expect(onOverride).toHaveBeenLastCalledWith('credit', { basis: 'prime', margin: '7' });
  });

  it('explains the reset rule, the source and the caveat in the info panel', async () => {
    const { user } = setup(
      resolvedOf([
        deal(
          'long_credit',
          'Max long credit',
          rate({ reset: { atPayment: 19, rule: 'prime_delta' }, caveat: 'UNCONFIRMED for bank cards' }),
          { payments: { min: 19, max: 60 }, minDealMinor: 100000, abroad: false },
        ),
      ]),
    );
    await user.click(row('long_credit').getByRole('button', { name: /About Max long credit/ }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByText(
        'Fixed for payments 1–18. From payment 19 it moves by any change in prime since you bought.',
      ),
    ).toBeInTheDocument();
    expect(dialog.getByText('UNCONFIRMED for bank cards')).toBeInTheDocument();
    expect(dialog.getByRole('link', { name: 'Source' })).toHaveAttribute('href', SOURCE.url);
    expect(dialog.getByText('Payments')).toBeInTheDocument();
  });

  it('follows prime in the footer, and says when the card list updated the rates', () => {
    const updatedOn = '2026-10-01' as LocalDate;
    setup(resolvedOf([deal('credit', 'Credit', rate())]), {
      catalog: { issuer: 'max', bank: 'none', tier: 'basic', version: 1, updatedOn },
    });
    expect(screen.getByText(/Rates follow prime: 4\.75% today \(/)).toBeInTheDocument();
    expect(screen.getByText(/The card list updated these rates on /)).toBeInTheDocument();
  });

  it('marks cash and over-limit as shown for reference', () => {
    setup(
      resolvedOf([], {
        cash: { rate: rate({ basis: { kind: 'fixed', rate: '20' } }), from: 'issuer' },
        over_limit: { rate: rate(), from: 'issuer' },
        late: { rate: rate(), from: 'issuer' },
      }),
    );
    expect(within(screen.getByTestId('rate-cash')).getByText(/Shown for reference/)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('rate-over_limit')).getByText(/Shown for reference/),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('rate-late')).queryByText(/Shown for reference/)).toBeNull();
    expect(screen.getByTestId('rate-cash')).toHaveTextContent('20.00% annual');
  });

  it('shows a Bank of Israel row at the BOI rate plus its margin', () => {
    setup(resolvedOf([deal('credit', 'Credit', rate({ basis: { kind: 'boi', margin: '2' } }))]));
    expect(screen.getByTestId('rate-credit')).toHaveTextContent(
      'Bank of Israel rate + 2.00 · 5.25% annual · 5.38% effective',
    );
  });

  it('renders a negative margin with a minus sign', () => {
    setup(resolvedOf([deal('credit', 'Credit', rate({ basis: { kind: 'prime', margin: '-0.4' } }))]));
    expect(screen.getByTestId('rate-credit')).toHaveTextContent(
      'Prime − 0.40 · 4.35% annual · 4.44% effective',
    );
  });

  it('shows no figure for an unpublished rate, and never the raw source note', () => {
    setup(
      resolvedOf([
        deal(
          'credit',
          'Credit',
          rate({
            basis: null,
            source: { ...SOURCE, note: 'published nominal: 9; published effective: 9.5' },
          }),
        ),
        deal(
          'installments',
          'Installments',
          rate({ source: { ...SOURCE, note: 'published nominal: 15.25' } }),
        ),
      ]),
    );
    expect(screen.getByTestId('rate-credit')).not.toHaveTextContent(/[0-9]%/);
    expect(document.body).not.toHaveTextContent('published nominal');
  });

  it('tags a typical rate as typical, not published', () => {
    setup(resolvedOf([deal('credit', 'Credit', rate({ quality: 'typical' }))]));
    expect(row('credit').getByText('Typical')).toBeInTheDocument();
    expect(row('credit').queryByText('Published')).toBeNull();
  });

  it('moves focus into the editor on Change and back to Change after Back', async () => {
    const { user } = setup(resolvedOf([deal('credit', 'Credit', rate())]), {
      ...card,
      overrides: { credit: { basis: 'prime', margin: '8' } },
    });
    const change = row('credit').getByRole('button', { name: 'Change Credit' });
    await user.click(change);
    expect(change).toHaveAttribute('aria-expanded', 'true');
    expect(change).toHaveAttribute('aria-controls');
    expect(row('credit').getByRole('textbox')).toHaveFocus();
    await user.click(row('credit').getByRole('button', { name: /^Back to the catalog/ }));
    expect(row('credit').getByRole('button', { name: 'Change Credit' })).toHaveFocus();
  });

  it('uses a Remove wording on an unpublished row, and ties the error to the input', async () => {
    const { onOverride, user } = setup(resolvedOf([deal('credit', 'Credit', rate({ basis: null }))]), {
      ...card,
      overrides: { credit: { basis: 'fixed', rate: '12' } },
    });
    const input = row('credit').getByRole('textbox');
    await user.clear(input);
    await user.type(input, '1..');
    expect(row('credit').getByRole('alert')).toHaveAttribute('id', input.getAttribute('aria-describedby'));
    await user.click(row('credit').getByRole('button', { name: 'Remove my rate for Credit' }));
    expect(onOverride).toHaveBeenLastCalledWith('credit', null);
    expect(row('credit').queryByText("Back to the catalog's rate")).toBeNull();
  });

  it('renders in Hebrew', async () => {
    await initTestI18n('he');
    setup(resolvedOf([deal('credit', 'Credit', rate())]));
    const r = screen.getByTestId('rate-credit');
    expect(r).toHaveTextContent('פריים + 10.50 · 15.25% שנתית ·');
    expect(r).toHaveTextContent('פריים + 10.50 · 15.25% שנתית · 16.36% מתואמת');
    expect(r).toHaveTextContent('מפורסם');
    expect(screen.getByText(/הריביות צמודות לפריים: 4\.75% היום/)).toBeInTheDocument();
    for (const bdi of r.querySelectorAll('bdi')) expect(bdi).toHaveAttribute('dir', 'ltr');
  });
});
