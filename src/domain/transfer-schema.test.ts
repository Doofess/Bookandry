import { describe, expect, it } from 'vitest';

import { rowSchemas } from './transfer-schema';

const AT = '2026-10-01T00:00:00.000Z';

const transaction = {
  id: 'tx1',
  profileId: 'p1',
  kind: 'income',
  categoryId: 'cat.salary',
  money: {
    amountMinor: 1_240_000,
    currency: 'ILS',
    baseCurrency: 'ILS',
    baseAmountMinor: 1_240_000,
    rateUsed: '1',
    rateDate: '2026-10-01',
    rateSource: 'manual',
  },
  recurrence: { type: 'one_time' },
  date: '2026-10-01',
  seriesStart: '2026-10-01',
  seriesEnd: '2026-10-01',
  isDeleted: 0,
  seriesRootId: 'tx1',
  createdAt: AT,
  updatedAt: AT,
};

/*
 * Section 6 of the cash design: what this build writes must read back
 * whole, and what an older build wrote must still read.
 */
describe('a transaction row, read by the schema sync and import share', () => {
  it('keeps where income went and the recount tag', () => {
    const parsed = rowSchemas.transactions.parse({
      ...transaction,
      destinationId: 'pm.cash',
      cashCount: true,
    });
    expect(parsed).toMatchObject({ destinationId: 'pm.cash', cashCount: true });
  });

  it('still reads a row from before either existed, and adds neither', () => {
    const parsed = rowSchemas.transactions.parse(transaction);
    expect(parsed).not.toHaveProperty('destinationId');
    expect(parsed).not.toHaveProperty('cashCount');
  });

  it('refuses a recount tag that is not exactly true', () => {
    expect(rowSchemas.transactions.safeParse({ ...transaction, cashCount: false }).success).toBe(false);
    expect(rowSchemas.transactions.safeParse({ ...transaction, destinationId: '' }).success).toBe(false);
  });

  it('reads an override that sends one payment elsewhere, or clears where it went', () => {
    for (const destinationId of ['pm.cash', null]) {
      const override = {
        id: 'o1',
        transactionId: 'tx1',
        occurrenceDate: '2026-10-01',
        action: 'modify',
        patch: { destinationId },
        createdAt: AT,
        updatedAt: AT,
      };
      expect(rowSchemas.overrides.safeParse(override).success).toBe(true);
    }
  });
});

describe('a cash move', () => {
  const move = {
    id: 'm1',
    profileId: 'p1',
    kind: 'withdraw',
    amountMinor: 20_000,
    date: '2026-10-01',
    isDeleted: 0,
    createdAt: AT,
    updatedAt: AT,
  };

  it('is read with its account and note', () => {
    expect(rowSchemas.cashMoves.parse({ ...move, accountId: 'pm.leumi', note: 'ATM' })).toMatchObject({
      accountId: 'pm.leumi',
      note: 'ATM',
    });
  });

  it('keeps a kind a later build added, rather than refusing the row', () => {
    expect(rowSchemas.cashMoves.parse({ ...move, kind: 'exchange' }).kind).toBe('exchange');
  });

  it('takes a count of zero', () => {
    expect(rowSchemas.cashMoves.safeParse({ ...move, kind: 'count', amountMinor: 0 }).success).toBe(true);
  });

  it('refuses the shared owner, a negative or fractional amount, a bad date and an empty kind', () => {
    for (const bad of [
      { profileId: '*' },
      { amountMinor: -1 },
      { amountMinor: 1.5 },
      { date: '2026-02-30' },
      { kind: '' },
    ]) {
      expect(rowSchemas.cashMoves.safeParse({ ...move, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('a category’s hue', () => {
  const category = {
    id: 'c1',
    kind: 'expense',
    icon: 'Dog',
    sortOrder: 30,
    isArchived: 0,
    source: 'custom',
    name: 'Pets',
    createdAt: AT,
    updatedAt: AT,
  };

  it('is accepted as a loose optional string, so a newer build’s key survives an import', () => {
    expect(rowSchemas.categories.safeParse({ ...category, hue: 'teal-2' }).success).toBe(true);
    expect(rowSchemas.categories.safeParse({ ...category, hue: 'some-future-hue' }).success).toBe(true);
  });

  it('is optional: a file from before it is still fine', () => {
    expect(rowSchemas.categories.safeParse(category).success).toBe(true);
  });

  it('is never empty', () => {
    expect(rowSchemas.categories.safeParse({ ...category, hue: '' }).success).toBe(false);
  });
});

const METHOD = {
  id: 'pm-1',
  profileId: '*',
  label: 'Future card',
  isArchived: 0,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
} as const;

describe('an open payment-method type', () => {
  it('accepts a type a later build writes, and keeps it as written', () => {
    const parsed = rowSchemas.paymentMethods.safeParse({ ...METHOD, type: 'prepaid_card' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.type).toBe('prepaid_card');
  });

  it('still refuses an empty or over-long type', () => {
    expect(rowSchemas.paymentMethods.safeParse({ ...METHOD, type: '' }).success).toBe(false);
    expect(rowSchemas.paymentMethods.safeParse({ ...METHOD, type: 'x'.repeat(31) }).success).toBe(false);
  });
});

describe('card keys of every kind', () => {
  it('parses and keeps funding, gift, prepaid and issuer keys', () => {
    const card = {
      funding: 'gift',
      issuerName: 'BuyMe',
      loadCardId: 'pm-credit',
      loadFeeMinor: 350,
      acceptedAt: '60 chains',
      issuerBank: '11',
      productName: 'Dream Card VIP',
      checked: true,
    };
    const parsed = rowSchemas.paymentMethods.parse({ ...METHOD, type: 'debit_card', card });
    expect(parsed.card).toEqual(card);
  });

  it('accepts a funding value this build does not know', () => {
    const parsed = rowSchemas.paymentMethods.safeParse({
      ...METHOD,
      type: 'debit_card',
      card: { funding: 'crypto' },
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses an issuing bank that is not a bank code', () => {
    const parsed = rowSchemas.paymentMethods.safeParse({
      ...METHOD,
      type: 'credit_card',
      card: { issuerBank: 'Leumi' },
    });
    expect(parsed.success).toBe(false);
  });
});
