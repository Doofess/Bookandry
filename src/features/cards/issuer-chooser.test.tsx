import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CatalogModule from '@/data/card-catalog';
import type { Catalog, CatalogIssuer } from '@/data/card-catalog/types';
import { EMPTY_CARD_DRAFT, type CardDraft } from '@/domain/card-draft';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { CardFields } from './card-fields';

const issuer = (
  id: CatalogIssuer['id'],
  en: string,
  he: string,
  extra: Partial<CatalogIssuer> = {},
): CatalogIssuer => ({
  id,
  name: { en, he },
  tiers: [
    { id: 'classic', name: { en: `${en} Classic`, he: `${he} קלאסי` }, issued: true },
    { id: 'gold', name: { en: `${en} Gold`, he: `${he} זהב` }, issued: true },
    { id: 'retired', name: { en: `${en} Retired`, he: `${he} ישן` }, issued: false },
  ],
  clubs: [
    { id: 'fly', name: `${en} Fly`, issued: true },
    { id: 'old', name: `${en} Old Club`, issued: false },
  ],
  billingDays: [2, 10],
  foreignPosting: 'immediate',
  fxFee: '3',
  deals: [],
  ...extra,
});

const FIXTURE: Catalog = {
  version: 1,
  issuers: [
    issuer('max', 'Max', 'מקס', {
      tiers: [{ id: 'basic', name: { en: 'Max Basic', he: 'מקס בסיס' }, issued: true }],
    }),
    issuer('cal', 'Cal', 'כאל'),
    issuer('isracard', 'Isracard', 'ישראכרט'),
  ],
  banks: [
    {
      id: '20',
      name: { en: 'Mizrahi', he: 'מזרחי' },
      issuers: ['max', 'isracard'],
      billingDays: [15],
      fxFee: { max: '2.5', isracard: '2.7' },
    },
    { id: '10', name: { en: 'Leumi', he: 'לאומי' }, issuers: ['cal'], fxFee: { cal: '2' } },
  ],
};

const mocks = vi.hoisted(() => ({ fail: false }));

vi.mock('@/data/card-catalog', async (original) => ({
  ...(await original<typeof CatalogModule>()),
  loadCatalog: () => (mocks.fail ? Promise.reject(new Error('offline')) : Promise.resolve(FIXTURE)),
}));

/** The editor's card fields over a draft held in state, with the draft readable. */
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
const drafted = (): CardDraft => JSON.parse(screen.getByTestId('draft').textContent) as CardDraft;
/** The chooser's own fieldset: the card editor has a 'Card company' control of its own too. */
const chooser = () =>
  within(screen.getByRole('group', { name: /^(Who issues this card|מי מנפיק את הכרטיס)$/ }));
const group = (name: string) => within(chooser().getByRole('radiogroup', { name }));
const labels = (name: string) =>
  group(name)
    .getAllByRole('radio')
    .map((r) => r.textContent);

async function choose(user: ReturnType<typeof userEvent.setup>, groupName: string, option: string) {
  const radios = within(await chooser().findByRole('radiogroup', { name: groupName }));
  await user.click(radios.getByRole('radio', { name: option }));
}

beforeEach(async () => {
  mocks.fail = false;
  await initTestI18n('en');
});

describe('the chooser', () => {
  it('shows a loading state, then the banks, with "Not through a bank" and "Not in the list"', async () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('Loading the card list…')).toBeInTheDocument();
    await screen.findByRole('group', { name: 'Who issues this card' });
    await chooser().findByRole('radiogroup', { name: 'Bank' });
    expect(labels('Bank')).toEqual(['Not through a bank', 'Mizrahi', 'Leumi', 'Not in the list']);
  });

  it('narrows the card companies to the chosen bank', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await choose(user, 'Bank', 'Mizrahi');
    expect(labels('Card company')).toEqual(['Max', 'Isracard', 'Not in the list']);
  });

  it('narrows the tiers to the issued ones, and the clubs to issued clubs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await choose(user, 'Bank', 'Not through a bank');
    await choose(user, 'Card company', 'Max');
    expect(labels('Card type')).toEqual(['Max Basic']);
    await choose(user, 'Card company', 'Cal');
    expect(labels('Card type')).toEqual(['Cal Classic', 'Cal Gold']);
    await choose(user, 'Card type', 'Cal Gold');
    expect(labels('Club')).toEqual(['No club', 'Cal Fly']);
  });

  it('links on the tier and fills the billing day and the FX fee into the draft', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await choose(user, 'Bank', 'Mizrahi');
    await choose(user, 'Card company', 'Max');
    expect(drafted().catalog).toBeUndefined();
    await choose(user, 'Card type', 'Max Basic');
    const d = drafted();
    expect(d.catalog).toMatchObject({ issuer: 'max', bank: '20', tier: 'basic' });
    expect(d.billingDay).toBe('15'); // the bank's one billing day
    expect(d.fxFee).toBe('2.5');
    expect(d.issuer).toBe('max');
    expect(d.kind).toBe('bank');
    expect(d.bank).toBe('Mizrahi');
  });

  it('"Not in the list" leaves the card unlinked and the manual fields in place', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await choose(user, 'Bank', 'Not in the list');
    expect(chooser().queryByRole('radiogroup', { name: 'Card company' })).toBeNull();
    expect(drafted().catalog).toBeUndefined();
    expect(screen.getByLabelText('Card level')).toBeInTheDocument();
  });

  it('says so when the list cannot be loaded, and the manual fields stay', async () => {
    mocks.fail = true;
    renderWithProviders(<Harness />);
    expect(
      await screen.findByText("Couldn't load the card list. You can still fill the card in yourself."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Card level')).toBeInTheDocument();
  });
});

describe('a card that is already linked', () => {
  const linked: Partial<CardDraft> = {
    catalog: { issuer: 'cal', bank: '10', tier: 'classic', version: 1 },
    fxFee: '9',
    issuer: 'cal',
  };

  it('relinks without asking when the person entered no rates', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={linked} />);
    await choose(user, 'Card type', 'Cal Gold');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(drafted().catalog?.tier).toBe('gold');
  });

  const withOverride: Partial<CardDraft> = {
    ...linked,
    overrides: { credit: { basis: 'prime', margin: '1' } },
  };

  it('asks whether to keep the rates entered, and "Keep mine" keeps the overrides', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={withOverride} />);
    await choose(user, 'Card type', 'Cal Gold');
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Keep the rates you entered?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep mine' }));
    await waitFor(() => {
      expect(drafted().catalog?.tier).toBe('gold');
    });
    expect(drafted().overrides).toEqual({ credit: { basis: 'prime', margin: '1' } });
  });

  it('"Use the new card\'s rates" drops the overrides', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={withOverride} />);
    await choose(user, 'Card type', 'Cal Gold');
    await user.click(await screen.findByRole('button', { name: "Use the new card's rates" }));
    await waitFor(() => {
      expect(drafted().catalog?.tier).toBe('gold');
    });
    expect(drafted().overrides).toBeUndefined();
  });

  it('changes nothing when the question is dismissed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={withOverride} />);
    await choose(user, 'Card type', 'Cal Gold');
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(drafted().catalog?.tier).toBe('classic');
    expect(drafted().overrides).toBeDefined();
  });

  it('unlinks on "Not in the list", keeping the fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={linked} />);
    await choose(user, 'Card company', 'Not in the list');
    expect(drafted().catalog).toBeUndefined();
    expect(drafted().fxFee).toBe('9');
  });
});

describe('an existing unlinked card', () => {
  const legacy: Partial<CardDraft> = { issuer: 'cal', bank: 'leumi', tier: 'Cal Gold', fxFee: '9' };

  it('offers to link it, and changes nothing until Link', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={legacy} />);
    expect(
      await screen.findByText('This looks like a Cal card through Leumi. Link it to fill in its real rates?'),
    ).toBeInTheDocument();
    expect(drafted().catalog).toBeUndefined();
    expect(drafted().fxFee).toBe('9');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    expect(drafted().catalog).toMatchObject({ issuer: 'cal', bank: '10', tier: 'gold' });
    expect(drafted().fxFee).toBe('2');
  });

  it('"Not now" dismisses the banner and changes nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness start={legacy} />);
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
    expect(drafted().catalog).toBeUndefined();
  });

  it('stays quiet when nothing in the catalog matches', async () => {
    renderWithProviders(<Harness start={{ issuer: 'cal', bank: 'Some other bank' }} />);
    await screen.findByRole('group', { name: 'Who issues this card' });
    await chooser().findByRole('radiogroup', { name: 'Bank' });
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
  });
});

describe('in Hebrew', () => {
  it('renders the labels', async () => {
    await initTestI18n('he');
    renderWithProviders(<Harness />);
    expect(await screen.findByText('מי מנפיק את הכרטיס')).toBeInTheDocument();
    expect(chooser().getByRole('radiogroup', { name: 'בנק' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'לא דרך בנק' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'לא ברשימה' })).toBeInTheDocument();
  });
});
