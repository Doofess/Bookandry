import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';
import { txFormSchema, type TxFormValues } from '@/domain/tx-form';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import { buildMoney, RateMissingError, saveNewTransaction, type SaveInput } from './save-transaction';

const TODAY = d('2026-09-15');
const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

function form(over: Partial<TxFormValues> = {}) {
  const result = txFormSchema.safeParse({
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    paymentMethodId: '',
    amount: '45',
    currency: 'EUR',
    date: TODAY,
    note: '',
    mode: 'one_time',
    dayOfMonth: '15',
    endDate: '',
    installmentCount: '',
    frequency: '',
    annualRate: '',
    ...over,
  });
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join(', '));
  return result.data;
}

const input = (over: Partial<SaveInput> = {}): SaveInput => ({
  parsed: form(),
  baseCurrency: 'ILS',
  rate: { rate: '3.9644', rateDate: d('2026-09-14'), rateSource: 'frankfurter' },
  now: NOW,
  newId: counterIdFactory('tx'),
  ...over,
});

describe('buildMoney', () => {
  it('converts once, from the original amount', () => {
    // 45.00 EUR at 3.9644 = 178.398 ILS, rounded half away from zero.
    expect(buildMoney(input())).toEqual({
      amountMinor: 4500,
      currency: 'EUR',
      baseCurrency: 'ILS',
      baseAmountMinor: 17_840,
      rateUsed: '3.9644',
      rateDate: '2026-09-14',
      rateSource: 'frankfurter',
    });
  });

  it('keeps the identity exact for a domestic row', () => {
    /*
     * `rateUsed: '1'` here is not the fabricated rate §4 fell back to: the
     * currencies genuinely match, which is the case `convertMinor`
     * short-circuits without arithmetic. That is what makes an ILS -> USD -> ILS
     * reconvert round trip return bit-identical integers.
     */
    const money = buildMoney(input({ parsed: form({ currency: 'ILS' }) }));

    expect(money).toMatchObject({
      amountMinor: 4500,
      baseAmountMinor: 4500,
      rateUsed: '1',
      rateDate: TODAY,
    });
  });

  it('refuses a foreign-currency row with no rate rather than inventing one', () => {
    // There is no rateUsed = 1 path anywhere. That fallback would have turned a
    // 500 shekel expense into $500 instead of $163.75 - a 3.05x error in the
    // largest number on the screen.
    expect(() => buildMoney(input({ rate: undefined }))).toThrow(RateMissingError);
  });

  it('does not need a rate for a domestic row', () => {
    expect(() => buildMoney(input({ parsed: form({ currency: 'ILS' }), rate: undefined }))).not.toThrow();
  });

  it('carries a manual rate and its date through unchanged', () => {
    const money = buildMoney(input({ rate: { rate: '4.05', rateDate: TODAY, rateSource: 'manual' } }));

    expect(money).toMatchObject({ rateUsed: '4.05', rateSource: 'manual', baseAmountMinor: 18_225 });
  });

  it.each([
    // ¥4,500 at 0.0067 = $30.15. The minor units differ by a factor of 100
    // between the two, so a missing shift term shows up as exactly that.
    ['JPY', 'USD', '0.0067', 4500, 3015],
    // $45.00 at 147.25 = ¥6,626.25, rounded half away from zero.
    ['USD', 'JPY', '147.25', 4500, 6626],
    // 4.500 KWD at 481 = ¥2,164.5 -> 2,165, away from zero rather than to even.
    ['KWD', 'JPY', '481', 4500, 2165],
  ])('converts %s -> %s across the exponent table', (from, to, rate, amountMinor, expected) => {
    const money = buildMoney(
      input({
        parsed: { ...form({ currency: from }), amountMinor },
        baseCurrency: to,
        rate: { rate, rateDate: TODAY, rateSource: 'frankfurter' },
      }),
    );

    expect(money.baseAmountMinor).toBe(expected);
  });
});

describe('saveNewTransaction', () => {
  it('writes one row and makes it its own series root', async () => {
    const { transaction } = await saveNewTransaction(handle.db, input());

    const stored = await handle.db.transactions.get(transaction.id);

    expect(stored).toMatchObject({
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.groceries',
      // Seeded with the id, so every row's lineage is answerable without a
      // null check even before it has ever been split.
      seriesRootId: transaction.id,
      isDeleted: 0,
    });
  });

  it('materialises the denormalised interval fields', async () => {
    // These exist only so the interval index works; a row written around
    // materialize() is invisible to every feed query.
    const { transaction } = await saveNewTransaction(handle.db, input());

    expect(transaction.seriesStart).toBe(TODAY);
    expect(transaction.seriesEnd).toBe(TODAY);
  });

  it('omits an absent payment method rather than storing undefined', async () => {
    const { transaction } = await saveNewTransaction(handle.db, input());

    expect(Object.hasOwn(transaction, 'paymentMethodId')).toBe(false);
  });

  it('keeps a chosen payment method', async () => {
    const { transaction } = await saveNewTransaction(
      handle.db,
      input({ parsed: form({ paymentMethodId: 'pm1' }) }),
    );

    expect(transaction.paymentMethodId).toBe('pm1');
  });

  it('stores no note rather than an empty one', async () => {
    const { transaction } = await saveNewTransaction(handle.db, input({ parsed: form({ note: '   ' }) }));

    expect(Object.hasOwn(transaction, 'note')).toBe(false);
  });

  describe('תשלומים', () => {
    const plan = (amount: string, count: string) =>
      input({
        parsed: form({ amount, mode: 'installments', installmentCount: count, currency: 'ILS' }),
        baseCurrency: 'ILS',
        rate: undefined,
      });

    it('splits an uneven total so the payments sum to it EXACTLY', async () => {
      // 1,000 over three is 333.34 + 333.33 + 333.33, the FIRST absorbing the
      // remainder - the Israeli card-issuer convention, and the only invariant
      // an interest-free instalment plan has.
      const { transaction, firstPaymentOverride } = await saveNewTransaction(handle.db, plan('1000', '3'));

      expect(transaction.money.amountMinor).toBe(33_333);
      expect(firstPaymentOverride?.patch?.money?.amountMinor).toBe(33_334);
      expect(33_334 + 33_333 * 2).toBe(100_000);
    });

    it('keys the remainder override to the first occurrence', async () => {
      const { firstPaymentOverride } = await saveNewTransaction(handle.db, plan('1000', '3'));

      expect(firstPaymentOverride?.occurrenceDate).toBe(TODAY);
    });

    it('writes NO override when the split is exact', async () => {
      // A row that says nothing is worse than no row: it survives export,
      // import and integrity checks, all to encode "no change".
      const { firstPaymentOverride } = await saveNewTransaction(handle.db, plan('1200', '3'));

      expect(firstPaymentOverride).toBeUndefined();
      await expect(handle.db.overrides.count()).resolves.toBe(0);
    });

    it('persists both rows together', async () => {
      await saveNewTransaction(handle.db, plan('1000', '3'));

      await expect(handle.db.transactions.count()).resolves.toBe(1);
      await expect(handle.db.overrides.count()).resolves.toBe(1);
    });
  });
});
