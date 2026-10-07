import { describe, expect, it } from 'vitest';

import { readRow } from '@/domain/import-check';
import { wireRow } from '@/domain/test-factories';
import { defaultFormValues } from '@/domain/tx-form';
import type { PaymentMethod } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { applyBatch, holderOfMethod, linkToCard, type ReviewItem } from './review-items';

const TODAY = '2026-10-06' as LocalDate;
const NOW = '2026-10-06T00:00:00.000Z' as IsoInstant;
const item = (l4: string, over: Partial<ReviewItem> = {}): ReviewItem => {
  const found = readRow(wireRow({ l4 }), `r${l4}`, {
    file: 0,
    base: 'ILS',
    known: new Set(['ILS']),
    anchor: TODAY,
    today: TODAY,
  });
  return {
    id: found.id,
    found,
    values: { ...defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }), kind: 'expense' },
    flags: [],
    ticked: true,
    confirmed: false,
    ...over,
  };
};
const card = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'visa',
  profileId: 'p2',
  type: 'credit_card',
  label: 'Visa',
  card: { lastDigits: '3214' },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('rows and the card they were charged to', () => {
  it('a card just added takes the rows its last four digits are printed beside, and their owner', () => {
    const [mine, other, settled] = linkToCard(
      [item('3214'), item('9999'), item('3214', { confirmed: true })],
      card(),
    );
    expect(mine?.values).toMatchObject({ paymentMethodId: 'visa', profileId: 'p2' });
    expect(other?.values?.paymentMethodId).toBe('');
    expect(settled?.values?.paymentMethodId).toBe('');
    // A household card leaves the row's person as it was.
    expect(linkToCard([item('3214')], card({ profileId: '*' }))[0]?.values?.profileId).toBe('p1');
    // An account, or a card with no digits, takes nothing.
    expect(linkToCard([item('3214')], card({ card: {} }))[0]?.values?.paymentMethodId).toBe('');
  });

  it("a statement's card takes its rows: by the digits in its header, else by its name", () => {
    const byDigits = item('', {});
    const header = {
      ...byDigits,
      found: { ...byDigits.found, statementCard: { label: 'Max', lastDigits: '3214' } },
    };
    expect(linkToCard([header], card())[0]?.values?.paymentMethodId).toBe('visa');
    // A statement that names its card but not its digits: the card of that name, digits or none.
    const byName = { ...byDigits, found: { ...byDigits.found, statementCard: { label: ' visa ' } } };
    expect(linkToCard([byName], card({ card: {} }))[0]?.values?.paymentMethodId).toBe('visa');
    expect(linkToCard([byName], card({ label: 'Cal' }))[0]?.values?.paymentMethodId).toBe('');
  });

  it('the batch "Paid with" leaves a row whose card its digits name', () => {
    const visa = card();
    const [named, plain] = applyBatch(
      [item('3214', { values: { ...item('3214').values!, paymentMethodId: 'visa' } }), item('')],
      { methodId: 'cash', profileId: 'p1' },
      [visa],
    );
    expect(named?.values?.paymentMethodId).toBe('visa');
    expect(plain?.values?.paymentMethodId).toBe('cash');
  });
});

describe('whose a row is', () => {
  it('the batch "For" answers a row nobody was named for, and leaves one the document named', () => {
    const waiting = item('', {
      values: { ...item('').values!, profileId: '' },
      flags: ['whose_unknown'],
      ticked: false,
    });
    const named = item('', { values: { ...item('').values!, profileId: 'p2' }, holder: 'p2' });
    const [answered, kept] = applyBatch([waiting, named], { methodId: '', profileId: 'p1' }, []);
    expect(answered).toMatchObject({ values: { profileId: 'p1' }, flags: [], ticked: true });
    expect(kept?.values?.profileId).toBe('p2');
  });

  it("a found card or account goes to whoever its file's rows were read as being of - when that is one person", () => {
    const of = (l4: string, holder?: string) => item(l4, holder === undefined ? {} : { holder });
    expect(holderOfMethod([of('3214', 'p2'), of('3214', 'p2')], 0, '3214')).toBe('p2');
    // Another card's rows do not count; a file read as two people's gives nobody.
    expect(holderOfMethod([of('3214', 'p2'), of('9999', 'p1')], 0, '3214')).toBe('p2');
    expect(holderOfMethod([of('3214', 'p2'), of('9999', 'p1')], 0, undefined)).toBeUndefined();
    expect(holderOfMethod([of('3214', 'p2'), of('3214')], 0, '3214')).toBeUndefined();
    expect(holderOfMethod([], 0, undefined)).toBeUndefined();
  });
});
