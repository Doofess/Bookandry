import { describe, expect, it } from 'vitest';

import { readRow } from '@/domain/import-check';
import { wireRow } from '@/domain/test-factories';
import { defaultFormValues } from '@/domain/tx-form';
import type { PaymentMethod } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { applyBatch, linkToCard, type ReviewItem } from './review-items';

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
  card: { lastDigits: '3200' },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('rows and the card they were charged to', () => {
  it('a card just added takes the rows its last four digits are printed beside, and their owner', () => {
    const [mine, other, settled] = linkToCard(
      [item('3200'), item('9999'), item('3200', { confirmed: true })],
      card(),
    );
    expect(mine?.values).toMatchObject({ paymentMethodId: 'visa', profileId: 'p2' });
    expect(other?.values?.paymentMethodId).toBe('');
    expect(settled?.values?.paymentMethodId).toBe('');
    // A household card leaves the row's person as it was.
    expect(linkToCard([item('3200')], card({ profileId: '*' }))[0]?.values?.profileId).toBe('p1');
    // An account, or a card with no digits, takes nothing.
    expect(linkToCard([item('3200')], card({ card: {} }))[0]?.values?.paymentMethodId).toBe('');
  });

  it("a statement's card takes its rows: by the digits in its header, else by its name", () => {
    const byDigits = item('', {});
    const header = {
      ...byDigits,
      found: { ...byDigits.found, statementCard: { label: 'Max', lastDigits: '3200' } },
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
      [item('3200', { values: { ...item('3200').values!, paymentMethodId: 'visa' } }), item('')],
      { methodId: 'cash', profileId: 'p1' },
      [visa],
    );
    expect(named?.values?.paymentMethodId).toBe('visa');
    expect(plain?.values?.paymentMethodId).toBe('cash');
  });
});
