import { describe, expect, it } from 'vitest';

import type { PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  accountDraftDetails,
  accountMissing,
  bankFromName,
  buildMethodReview,
  cardMissing,
  combineAccountReads,
  combineCardReads,
  existingAccount,
  existingCard,
  groundAccounts,
  groundCards,
  mergeAccounts,
  mergeCards,
  planCard,
  rateFromText,
  readAccount,
  readCard,
  type FoundCard,
} from './import-cards';
import type { WireAccount, WireCard } from './import-wire';

const NOW = '2026-10-06T00:00:00.000Z' as IsoInstant;
const wireCard = (over: Partial<WireCard> = {}): WireCard => ({
  s: 0,
  n: 'max executive',
  l4: '3200',
  nw: 'מאסטרקארד',
  is: 'MAX',
  cr: '5.9%',
  lim: '',
  bd: '',
  ...over,
});
const wireAccount = (over: Partial<WireAccount> = {}): WireAccount => ({
  s: 0,
  n: 'בנק הפועלים',
  bk: '',
  br: '532',
  no: '123456',
  h: '',
  ...over,
});
const card = (over: Partial<WireCard> = {}, prime = '4.75%'): FoundCard =>
  readCard(wireCard(over), 'k0', 0, prime);
const method = (over: Partial<PaymentMethod>): PaymentMethod => ({
  id: 'visa',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Visa',
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('reading a card', () => {
  it('reads Max’s card list: digits, network, issuer, and קרדיט as prime plus its margin', () => {
    expect(card()).toMatchObject({
      label: 'max executive',
      lastDigits: '3200',
      network: 'mastercard',
      issuer: 'max',
      credit: { basis: 'prime', margin: '1.15' },
      creditRate: '5.9',
    });
  });

  it('keeps a rate as printed when no prime is named, and reads Hebrew and English names', () => {
    expect(card({ n: 'Dream Card VIP', nw: 'ויזה', cr: '14.65 %' }, '')).toMatchObject({
      network: 'visa',
      credit: { basis: 'fixed', rate: '14.65' },
    });
    expect(card({ n: 'Cal Gold', nw: '', is: '', cr: '' })).toMatchObject({ issuer: 'cal' });
    expect(card({ nw: 'American Express', is: 'ישראכרט' })).toMatchObject({
      network: 'amex',
      issuer: 'isracard',
    });
    expect(card({ nw: 'דיינרס', is: 'Diners' })).toMatchObject({ network: 'diners', issuer: 'diners' });
    expect(card({ nw: 'כרטיס ישראכרט', is: '' })).toMatchObject({ network: 'isracard' });
  });

  it('reads a limit and a billing day, and leaves out what does not read', () => {
    expect(card({ lim: '₪15,000', bd: 'ב-10 לחודש' })).toMatchObject({
      creditLimitMinor: 1_500_000,
      billingDay: 10,
    });
    const odd = card({ lim: 'n/a', bd: '45', cr: 'high', nw: 'Unknown', is: 'Some bank', n: 'Card' });
    expect(odd.creditLimitMinor).toBeUndefined();
    expect(odd.billingDay).toBeUndefined();
    expect(odd.credit).toBeUndefined();
    expect(odd.network).toBeUndefined();
    expect(odd.issuer).toBeUndefined();
    expect(card({ l4: '' }).lastDigits).toBeUndefined();
  });

  it('reads a percentage', () => {
    expect(rateFromText('5.90%')).toBe('5.9');
    expect(rateFromText('‎11 %')).toBe('11');
    expect(rateFromText('')).toBeUndefined();
    expect(rateFromText('abc')).toBeUndefined();
  });
});

describe('checking cards', () => {
  it('compares two reads card by card', () => {
    const first = [card(), card({ n: 'Dream Card VIP', l4: '0400', cr: '14.65%' })];
    const second = [
      card(),
      card({ n: 'Dream Card VIP', l4: '0400', cr: '14.56%' }),
      card({ n: 'X', l4: '9999' }),
    ];
    const out = combineCardReads(first, second);
    expect(out.map((c) => c.flags)).toEqual([[], ['reads_disagree'], ['one_read_only']]);
    expect(out[1]?.otherRead?.creditRate).toBe('14.56');
    expect(combineCardReads([card()], [])[0]?.flags).toEqual(['one_read_only']);
  });

  it('finds a text card’s digits and rate in the text', () => {
    expect(groundCards([card()], 'max executive 3200 קרדיט 5.9%')[0]?.flags).toEqual([]);
    expect(groundCards([card()], 'max executive 3215 קרדיט 5.9%')[0]?.flags).toEqual(['not_in_source']);
    expect(groundCards([card()], 'max executive 3200 קרדיט 6.9%')[0]?.flags).toEqual(['not_in_source']);
  });

  it('keeps one entry per card across files, filling in what the first lacked', () => {
    const merged = mergeCards([
      card({ bd: '' }),
      card({ bd: '10', cr: '' }),
      card({ n: 'Other', l4: '1111' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ billingDay: 10, creditRate: '5.9' });
  });
});

describe('the household’s cards', () => {
  const visa = method({ id: 'visa', label: 'max executive', card: { lastDigits: '3200', billingDay: 2 } });

  it('matches a found card by its last digits, else by name', () => {
    expect(existingCard(card(), [visa])?.id).toBe('visa');
    expect(existingCard(card({ n: 'Renamed' }), [visa])?.id).toBe('visa');
    const named = method({ id: 'named', label: 'Max Executive' });
    expect(existingCard(card(), [named])?.id).toBe('named');
    expect(existingCard(card({ l4: '9999' }), [visa])).toBeUndefined();
    expect(
      existingCard(card(), [method({ type: 'debit_card', card: { lastDigits: '3200' } })]),
    ).toBeUndefined();
  });

  it('plans a new card, and an update with only what is new', () => {
    expect(planCard(card(), undefined)).toEqual({
      card: { lastDigits: '3200', network: 'mastercard', issuer: 'max', creditPrimeMargin: '1.15' },
      creditAnnualRate: null,
      changes: ['new'],
    });
    const update = planCard(card(), visa);
    expect(update.card).toMatchObject({ billingDay: 2, creditPrimeMargin: '1.15' });
    expect(update.changes).toEqual(['network', 'issuer', 'credit']);
    const fixed = planCard(card({}, ''), method({ card: { creditPrimeMargin: '3' } }));
    expect(fixed.card.creditPrimeMargin).toBeUndefined();
    expect(fixed.creditAnnualRate).toBe('5.9');
    const same = method({
      card: {
        lastDigits: '3200',
        network: 'mastercard',
        issuer: 'max',
        creditPrimeMargin: '1.15',
        creditLimitMinor: 5,
        billingDay: 3,
      },
    });
    expect(planCard(card({ lim: '0.05', bd: '3' }), same).changes).toEqual([]);
    expect(planCard(card({ lim: '0.06', bd: '4' }), same).changes).toEqual(['limit', 'billingDay']);
  });

  it('says what a card still lacks', () => {
    expect(cardMissing({})).toEqual(['lastDigits', 'billingDay']);
    expect(cardMissing({ lastDigits: '1234', billingDay: 10 })).toEqual([]);
  });
});

describe('bank accounts', () => {
  it('finds the bank by its code, or by its name in the text', () => {
    expect(readAccount(wireAccount({ bk: '012', n: '' }), 'b0', 0).bank).toBe('12');
    expect(bankFromName('בנק לאומי לישראל בע"מ')).toBe('10');
    expect(bankFromName('Bank Hapoalim B.M.')).toBe('12');
    expect(bankFromName('בנק מרכנתיל דיסקונט')).toBe('17');
    expect(bankFromName('بنك فلسطين')).toBe('89');
    expect(bankFromName('Some shop')).toBeUndefined();
  });

  it('reads what is printed, and says what is missing', () => {
    const full = readAccount(wireAccount({ br: '0532' }), 'b0', 0);
    expect(full).toMatchObject({ bank: '12', branch: '532', number: '123456' });
    expect(accountMissing(full)).toEqual([]);
    const part = readAccount(wireAccount({ n: 'בנק', br: '', no: '1', h: 'דנה ויוסי כהן' }), 'b1', 0);
    expect(accountMissing(part)).toEqual(['bank', 'branch', 'number', 'holders']);
  });

  it('starts a shared account as joint, with the household’s person on it', () => {
    const shared = readAccount(wireAccount({ h: 'Dana, Yossi' }), 'b0', 0);
    expect(accountDraftDetails(shared, 'p1')).toEqual({
      bank: '12',
      branch: '532',
      number: '123456',
      holding: 'joint',
      holders: ['p1'],
      otherHolders: 'Dana, Yossi',
    });
    expect(accountDraftDetails(readAccount(wireAccount({ n: '', bk: '', br: '' }), 'b1', 0), 'p1')).toEqual({
      bank: '',
      number: '123456',
      holding: 'personal',
    });
  });

  it('compares reads, finds a text account in its text, and merges', () => {
    const a = readAccount(wireAccount(), 'b0', 0);
    const b = readAccount(wireAccount({ br: '533' }), 'b1', 0);
    const other = readAccount(wireAccount({ no: '999999' }), 'b2', 0);
    expect(combineAccountReads([a], [a]).map((x) => x.flags)).toEqual([[]]);
    expect(combineAccountReads([a], [b])[0]?.flags).toEqual(['reads_disagree']);
    expect(combineAccountReads([a], [other]).map((x) => x.flags)).toEqual([
      ['one_read_only'],
      ['one_read_only'],
    ]);
    expect(groundAccounts([a], 'חשבון 12-532-123456')[0]?.flags).toEqual([]);
    expect(groundAccounts([a], 'חשבון 12-532-654321')[0]?.flags).toEqual(['not_in_source']);
    expect(mergeAccounts([a, a, other])).toHaveLength(2);
    const noNumber = readAccount(wireAccount({ no: '' }), 'b3', 0);
    expect(mergeAccounts([noNumber, noNumber])).toHaveLength(1);
  });

  it('matches the household’s account by bank and number', () => {
    const mine = method({
      id: 'acc',
      type: 'bank_account',
      account: { bank: '12', number: '123456', holding: 'personal' },
    });
    expect(existingAccount(readAccount(wireAccount(), 'b0', 0), [mine])?.id).toBe('acc');
    expect(existingAccount(readAccount(wireAccount({ no: '' }), 'b0', 0), [mine])).toBeUndefined();
    expect(existingAccount(readAccount(wireAccount({ bk: '10' }), 'b0', 0), [mine])).toBeUndefined();
  });
});

describe('the review list', () => {
  it('ticks only what is complete, certain and new', () => {
    const known = method({
      id: 'known',
      label: 'Known',
      card: { lastDigits: '1111', network: 'visa', issuer: 'max', billingDay: 2 },
    });
    const acc = method({
      id: 'acc',
      type: 'bank_account',
      account: { bank: '12', number: '777777', holding: 'personal' },
    });
    const items = buildMethodReview(
      [
        card({ bd: '10' }),
        card({ n: 'No day', l4: '2222' }),
        readCard(wireCard({ n: 'Known', l4: '1111', nw: 'Visa', cr: '' }), 'k2', 0, ''),
      ],
      [readAccount(wireAccount(), 'b0', 0), readAccount(wireAccount({ no: '777777' }), 'b1', 0)],
      [known, acc],
    );
    expect(items.map((i) => [i.kind, i.ticked, i.missing, i.flags])).toEqual([
      ['card', true, [], []],
      ['card', false, ['billingDay'], []],
      ['card', false, [], ['card_known']],
      ['account', true, [], []],
      ['account', false, [], ['card_known']],
    ]);
  });
});
