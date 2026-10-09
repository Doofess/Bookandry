import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { banks } from '@/data/card-catalog/banks';
import type { PaymentMethod } from '@/types/domain';

import { bankKey, CARD_COLOR_KEYS, cardKey, issuerKey, isCardColor, methodKey } from './money-key';

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

const method = (
  patch: Partial<PaymentMethod>,
): Pick<PaymentMethod, 'type' | 'color' | 'card' | 'account'> => ({
  type: 'credit_card',
  ...patch,
});

describe('bankKey', () => {
  it('normalises the code as BankMark does: "012" is Hapoalim', () => {
    expect(bankKey('012')).toBe('bank-12');
    expect(bankKey('10')).toBe('bank-10');
  });

  it('is neutral for a bank with no colour of its own, an unknown code, or none', () => {
    expect(bankKey('54')).toBe('neutral'); // Bank of Jerusalem: a real bank, with no colour in §1.3
    expect(bankKey('999')).toBe('neutral');
    expect(bankKey(undefined)).toBe('neutral');
    expect(bankKey('')).toBe('neutral');
  });

  it('has a colour for every bank in the card catalog', () => {
    for (const bank of banks) expect(bankKey(bank.id), bank.id).not.toBe('neutral');
  });
});

describe('issuerKey', () => {
  it('keys a card company by its issuer id', () => {
    expect(issuerKey('cal')).toBe('issuer-cal');
    expect(issuerKey('isracard')).toBe('issuer-isracard');
  });

  it('is neutral for "other" and for no issuer', () => {
    expect(issuerKey('other')).toBe('neutral');
    expect(issuerKey(undefined)).toBe('neutral');
  });
});

describe('cardKey', () => {
  it('is the card’s own colour when it has one', () => {
    expect(cardKey({ color: 'gold', card: { issuer: 'max' } })).toBe('card-gold');
  });

  it('is its issuer’s when it has none, or one this build does not know', () => {
    expect(cardKey({ card: { issuer: 'max' } })).toBe('issuer-max');
    expect(cardKey({ color: '#ff0000', card: { issuer: 'cal' } })).toBe('issuer-cal');
    expect(cardKey({ color: 'mauve', card: { issuer: 'amex' } })).toBe('issuer-amex');
  });

  it('is neutral with neither', () => {
    expect(cardKey({})).toBe('neutral');
    expect(cardKey({ card: { issuer: 'other' } })).toBe('neutral');
  });
});

describe('methodKey', () => {
  it('covers cash, cards and bank accounts', () => {
    expect(methodKey(method({ type: 'cash' }))).toBe('cash');
    expect(methodKey(method({ card: { issuer: 'diners' } }))).toBe('issuer-diners');
    expect(methodKey(method({ type: 'debit_card', card: { issuer: 'cal' } }))).toBe('issuer-cal');
    expect(methodKey(method({ type: 'bank_account', account: { bank: '20', holding: 'personal' } }))).toBe(
      'bank-20',
    );
  });

  it('takes the colour the person gave it over the bank’s', () => {
    expect(
      methodKey(method({ type: 'bank_account', color: 'red', account: { bank: '10', holding: 'personal' } })),
    ).toBe('card-red');
  });

  it('is neutral for any other kind of method without a colour, and its own colour with one', () => {
    expect(methodKey(method({ type: 'standing_order' }))).toBe('neutral');
    expect(methodKey(method({ type: 'other', color: 'teal' }))).toBe('card-teal');
  });
});

describe('the keys and the token file agree', () => {
  it('knows the ten card colours, and recognises only them', () => {
    expect(CARD_COLOR_KEYS).toHaveLength(10);
    expect(isCardColor('teal')).toBe(true);
    expect(isCardColor('#ff0000')).toBe(false);
    expect(isCardColor(undefined)).toBe(false);
  });

  it('has a sheet in index.css for every key it can return', () => {
    const keys = [
      ...['10', '12', '11', '20', '17', '31', '52', '14', '26', '46', '4', '18'].map((code) => bankKey(code)),
      ...(['isracard', 'cal', 'max', 'amex', 'diners'] as const).map((issuer) => issuerKey(issuer)),
      ...CARD_COLOR_KEYS.map((color) => cardKey({ color })),
      'cash',
    ];
    for (const key of keys) expect(CSS, key).toContain(`[data-money='${key}']`);
  });
});
