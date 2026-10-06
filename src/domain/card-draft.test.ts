import { describe, expect, it } from 'vitest';

import type { CardDetails, PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  cardDraftOf,
  cardFromDraft as fromDraft,
  EMPTY_CARD_DRAFT,
  parseExpires,
  type CardDraft,
} from './card-draft';

const cardFromDraft = (value: CardDraft, previous?: CardDetails) =>
  fromDraft(value, { month: '2026-10', ...(previous === undefined ? {} : { previous }) });

const NOW = '2026-01-01T00:00:00.000Z' as IsoInstant;
const method = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'visa',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Visa',
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const draft = (over: Partial<CardDraft> = {}): CardDraft => ({ ...EMPTY_CARD_DRAFT, ...over });

describe('the card editor', () => {
  it('reads the expiry the way the card prints it', () => {
    expect(parseExpires('09/28')).toBe('2028-09');
    expect(parseExpires('9/2028')).toBe('2028-09');
    expect(parseExpires(' 12-30 ')).toBe('2030-12');
    expect(parseExpires('')).toBe('');
    for (const bad of ['13/28', '00/28', '0928', 'soon', '09/1999']) {
      expect(parseExpires(bad), bad).toBeUndefined();
    }
  });

  it('stores what was filled in, and nothing for what was not', () => {
    const result = cardFromDraft(
      draft({
        issuer: 'max',
        network: 'mastercard',
        kind: 'non_bank',
        bank: ' Leumi ',
        tier: 'Platinum',
        club: '  ',
        expires: '04/29',
        billingDay: '10',
        creditLimit: '15,000',
        monthlyFee: '14.90',
        fxFee: '2.5',
        credit: { basis: 'prime', value: '+3.5' },
        late: { basis: 'fixed', value: '18' },
      }),
    );
    expect(result).toEqual({
      ok: true,
      creditAnnualRate: null,
      card: {
        issuer: 'max',
        network: 'mastercard',
        kind: 'non_bank',
        bank: 'Leumi',
        tier: 'Platinum',
        expiresMonth: '2029-04',
        billingDay: 10,
        creditLimitMinor: 1_500_000,
        monthlyFeeMinor: 1_490,
        feeSince: '2026-10',
        fxFeeRate: '2.5',
        creditPrimeMargin: '3.5',
        lateRate: { basis: 'fixed', rate: '18' },
      },
    });
  });

  it('keeps a fixed קרדיט rate where it always was, on the method', () => {
    expect(cardFromDraft(draft({ credit: { basis: 'fixed', value: '12' } }))).toEqual({
      ok: true,
      card: undefined,
      creditAnnualRate: '12',
    });
    expect(cardFromDraft(draft({ late: { basis: 'prime', value: '-1' } }))).toMatchObject({
      card: { lateRate: { basis: 'prime', margin: '-1' } },
    });
  });

  it('names every field it cannot read', () => {
    const result = cardFromDraft(
      draft({
        expires: '13/28',
        billingDay: '32',
        creditLimit: 'lots',
        monthlyFee: '1.2.3',
        fxFee: 'x',
        credit: { basis: 'prime', value: '--1' },
        late: { basis: 'fixed', value: '-3' },
      }),
    );
    expect(result).toEqual({
      ok: false,
      invalid: ['expires', 'billingDay', 'creditLimit', 'monthlyFee', 'fxFee', 'credit', 'late'],
    });
  });

  it('opens a saved card as it was saved', () => {
    const saved = method({
      card: {
        issuer: 'cal',
        expiresMonth: '2028-11',
        billingDay: 2,
        creditLimitMinor: 1_200_000,
        monthlyFeeMinor: 990,
        feeSince: '2026-04',
        feeDiscount: { minSpendMinor: 300_000, percent: '50', until: '2027-09' },
        fxFeeRate: '3',
        creditPrimeMargin: '4',
        lateRate: { basis: 'prime', margin: '8' },
      },
    });
    const opened = cardDraftOf(saved);
    expect(opened).toMatchObject({
      issuer: 'cal',
      expires: '11/28',
      billingDay: '2',
      creditLimit: '12000.00',
      monthlyFee: '9.90',
      fxFee: '3',
      credit: { basis: 'prime', value: '4' },
      late: { basis: 'prime', value: '8' },
    });
    expect(opened).toMatchObject({ discountSpend: '3000.00', discountPercent: '50', discountUntil: '09/27' });
    // And round-trips, keeping the month the fee started.
    expect(cardFromDraft(opened, saved.card)).toMatchObject({ ok: true, card: saved.card });

    expect(
      cardDraftOf(method({ creditAnnualRate: '12', card: { lateRate: { basis: 'fixed', rate: '18' } } })),
    ).toMatchObject({
      credit: { basis: 'fixed', value: '12' },
      late: { basis: 'fixed', value: '18' },
    });
    expect(cardDraftOf(method())).toEqual({ ...EMPTY_CARD_DRAFT });
    expect(cardDraftOf(undefined)).toBe(EMPTY_CARD_DRAFT);
  });

  it('starts the fee this month, keeps that month after, and takes a discount only with a fee', () => {
    const withFee = draft({
      monthlyFee: '14.90',
      discountSpend: '3,000',
      discountPercent: '',
      discountUntil: '10/27',
    });
    expect(cardFromDraft(withFee)).toMatchObject({
      ok: true,
      card: {
        monthlyFeeMinor: 1_490,
        feeSince: '2026-10',
        feeDiscount: { minSpendMinor: 300_000, percent: '100', until: '2027-10' },
      },
    });
    expect(cardFromDraft(withFee, { monthlyFeeMinor: 990, feeSince: '2025-01' })).toMatchObject({
      card: { feeSince: '2025-01' },
    });
    // No end date: for good.
    expect(cardFromDraft(draft({ monthlyFee: '9.90', discountSpend: '1000' }))).toMatchObject({
      card: { feeDiscount: { minSpendMinor: 100_000, percent: '100' } },
    });
    // A zero fee is no fee, and no discount without one.
    expect(cardFromDraft(draft({ monthlyFee: '0', discountSpend: '1000' }))).toEqual({
      ok: true,
      card: undefined,
      creditAnnualRate: null,
    });
    expect(
      cardFromDraft(
        draft({ monthlyFee: '9', discountSpend: 'x', discountPercent: '101', discountUntil: '13/27' }),
      ),
    ).toEqual({
      ok: false,
      invalid: ['discountSpend', 'discountPercent', 'discountUntil'],
    });
  });
});

describe('the account a card is paid from', () => {
  it('round-trips, and is left out when none is picked', () => {
    const linked = cardFromDraft({ ...EMPTY_CARD_DRAFT, accountId: 'acc', bank: 'Bank Leumi' });
    expect(linked).toMatchObject({ ok: true, card: { accountId: 'acc', bank: 'Bank Leumi' } });
    expect(cardDraftOf(method({ card: { accountId: 'acc' } })).accountId).toBe('acc');
    expect(cardFromDraft(EMPTY_CARD_DRAFT)).toMatchObject({ ok: true, card: undefined });
  });
});

describe('a card’s last four digits', () => {
  it('are kept as typed, four digits and nothing else', () => {
    expect(cardFromDraft({ ...EMPTY_CARD_DRAFT, lastDigits: '3214' })).toMatchObject({
      ok: true,
      card: { lastDigits: '3214' },
    });
    expect(cardFromDraft({ ...EMPTY_CARD_DRAFT, lastDigits: '321' })).toEqual({
      ok: false,
      invalid: ['lastDigits'],
    });
    expect(cardDraftOf(method({ card: { lastDigits: '0427' } })).lastDigits).toBe('0427');
  });
});
