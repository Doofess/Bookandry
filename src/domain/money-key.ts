import type { CardIssuer, PaymentMethod } from '@/types/domain';

import { bankByCode } from './banks';

/**
 * Data to colour keys (§1.5).
 *
 * A component never writes a colour and never builds a key by hand: it calls
 * one of these and sets the result as `data-money`. src/index.css maps every
 * key to a fill, a tinted text colour and a lifted colour, and anything it
 * does not know to the neutral ink sheet - so an old or hand-edited value (a
 * hex in `color`, an issuer of "other") is drawn, never invisible.
 */

/**
 * The colours a person can give a card, as stored in `PaymentMethod.color`.
 * The keys predate this redesign and must not change: data stores the key.
 */
export const CARD_COLOR_KEYS = [
  'black',
  'silver',
  'blue',
  'teal',
  'green',
  'gold',
  'orange',
  'red',
  'rose',
  'purple',
] as const;

export type CardColor = (typeof CARD_COLOR_KEYS)[number];

export type MoneyKey = `bank-${string}` | `issuer-${CardIssuer}` | `card-${CardColor}` | 'cash' | 'neutral';

/** The banks with a colour of their own (§1.3), by Masav code. */
const BANKS_WITH_COLOUR: ReadonlySet<string> = new Set([
  '10',
  '12',
  '11',
  '20',
  '17',
  '31',
  '52',
  '14',
  '26',
  '46',
  '4',
  '18',
]);

/** The card companies with a colour of their own. "other" has none. */
const ISSUERS_WITH_COLOUR: ReadonlySet<CardIssuer> = new Set(['isracard', 'cal', 'max', 'amex', 'diners']);

/** A bank by its Masav code, normalised as `BankMark` normalises it ("012" is 12). */
export function bankKey(code: string | undefined): MoneyKey {
  const bank = bankByCode(code ?? '');
  return bank !== undefined && BANKS_WITH_COLOUR.has(bank.code) ? `bank-${bank.code}` : 'neutral';
}

/** A card company by its issuer id. */
export function issuerKey(issuer: CardIssuer | undefined): MoneyKey {
  return issuer !== undefined && ISSUERS_WITH_COLOUR.has(issuer) ? `issuer-${issuer}` : 'neutral';
}

/** Whether a stored colour is one this build knows. */
export function isCardColor(value: string | undefined): value is CardColor {
  return CARD_COLOR_KEYS.some((key) => key === value);
}

/** A card: its own colour, else its company's. */
export function cardKey(method: Pick<PaymentMethod, 'color' | 'card'>): MoneyKey {
  return isCardColor(method.color) ? `card-${method.color}` : issuerKey(method.card?.issuer);
}

/** Any payment method: cash, a card, a bank account, or anything else by its own colour. */
export function methodKey(method: Pick<PaymentMethod, 'type' | 'color' | 'card' | 'account'>): MoneyKey {
  if (method.type === 'cash') return 'cash';
  if (isCardColor(method.color)) return `card-${method.color}`;
  if (method.type === 'credit_card' || method.type === 'debit_card') return issuerKey(method.card?.issuer);
  if (method.type === 'bank_account') return bankKey(method.account?.bank);
  return 'neutral';
}
