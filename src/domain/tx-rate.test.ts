import { describe, expect, it } from 'vitest';

import { convertMinor, invertRate, rateDeviationExceeds, rateFromAmounts } from '@/lib/money';

import { d } from './test-factories';
import {
  chargedFor,
  needsRestamp,
  prefillRate,
  resolveRate,
  type KnownRate,
  type RateFieldInput,
} from './tx-rate';

const TODAY = d('2026-09-15');

/** The ECB figure this install last saw, three days stale. */
const KNOWN: KnownRate = {
  rate: '3.9644',
  rateDate: d('2026-09-12'),
  rateSource: 'frankfurter',
};

function field(over: Partial<RateFieldInput> = {}): RateFieldInput {
  return {
    amount: '45',
    currency: 'EUR',
    baseCurrency: 'ILS',
    rate: '',
    charged: '',
    entry: 'rate',
    known: KNOWN,
    ...over,
  };
}

describe('resolveRate', () => {
  it('short-circuits when there is nothing to convert', () => {
    expect(resolveRate(field({ currency: 'ILS' }), TODAY)).toEqual({ status: 'same_currency' });
  });

  it('prefills the last known rate rather than leaving the field blank', () => {
    const result = resolveRate(field({ rate: '' }), TODAY);

    expect(result).toMatchObject({
      status: 'resolved',
      rate: '3.9644',
      // Its OWN date, not today: the field says "Rate from 12 Sep", and
      // stamping today would claim a freshness the number does not have.
      rateDate: d('2026-09-12'),
      rateSource: 'frankfurter',
    });
  });

  it('blocks only when the pair has genuinely never been seen', () => {
    expect(resolveRate(field({ rate: '', known: undefined }), TODAY)).toEqual({
      status: 'invalid',
      problem: { code: 'rate_required' },
    });
  });

  it('marks a typed rate as manual and stamps it today', () => {
    const result = resolveRate(field({ rate: '4.05' }), TODAY);

    expect(result).toMatchObject({ status: 'resolved', rateSource: 'manual', rateDate: TODAY });
  });

  it('keeps the provider attribution when the typed rate is the cached one', () => {
    // Otherwise every user who tabs through the prefilled field converts a
    // provider rate into a "manual" one, which excludes the row from the
    // reconvert prefetch for a value they never actually chose.
    const result = resolveRate(field({ rate: ' 3.9644 ' }), TODAY);

    expect(result).toMatchObject({ rateSource: 'frankfurter', rateDate: d('2026-09-12') });
  });

  it.each([
    ['0', 'rate_not_positive'],
    ['abc', 'rate_not_a_number'],
    ['-2', 'rate_not_a_number'],
    ['3.9.6', 'rate_not_a_number'],
  ])('rejects %s', (rate, code) => {
    expect(resolveRate(field({ rate }), TODAY)).toEqual({ status: 'invalid', problem: { code } });
  });

  it('derives the charged amount from the rate', () => {
    const result = resolveRate(field({ rate: '3.9644' }), TODAY);

    // 45.00 EUR at 3.9644 = 178.398 ILS, rounded half away from zero.
    expect(result).toMatchObject({ chargedMinor: 17_840 });
  });
});

describe('the charged-amount entry', () => {
  /*
   * The case this whole affordance exists for: an Israeli buys EUR 45 online
   * and the card charges ILS 178.40 INCLUDING the foreign-transaction fee.
   * They know the shekel figure from the bank's SMS; they have no idea what
   * rate the issuer used, and it is not the ECB one.
   */
  it('derives the rate from what the card actually charged', () => {
    const result = resolveRate(field({ entry: 'charged', charged: '178.40' }), TODAY);

    expect(result).toMatchObject({
      status: 'resolved',
      rate: '3.9644444444',
      chargedMinor: 17_840,
      // The user's figure, not the provider's - it carries their issuer's fee.
      rateSource: 'manual',
      rateDate: TODAY,
    });
  });

  it('keeps the charged amount EXACTLY as entered', () => {
    // Deriving a rate and converting back would round twice and could land a
    // shekel off the figure printed on the statement, which is the one number
    // the user can check.
    const charged = '199.99';
    const result = resolveRate(field({ entry: 'charged', charged, amount: '45' }), TODAY);

    expect(result).toMatchObject({ chargedMinor: 19_999 });
  });

  it('round-trips back to the entered charge through the derived rate', () => {
    const result = resolveRate(field({ entry: 'charged', charged: '178.40' }), TODAY);
    if (result.status !== 'resolved') throw new Error('expected a resolution');

    expect(convertMinor(4500, 'EUR', 'ILS', result.rate)).toBe(17_840);
  });

  it.each([
    ['', 'charged_not_positive'],
    ['0', 'charged_not_positive'],
  ])('rejects a charge of %s', (charged, code) => {
    expect(resolveRate(field({ entry: 'charged', charged }), TODAY)).toEqual({
      status: 'invalid',
      problem: { code },
    });
  });

  it('cannot derive a rate before the amount is entered', () => {
    expect(resolveRate(field({ entry: 'charged', charged: '178.40', amount: '' }), TODAY)).toEqual({
      status: 'invalid',
      problem: { code: 'rate_required' },
    });
  });

  it('handles an exponent-0 base currency', () => {
    // 45.00 EUR charged as JPY 7,200 -> 160 JPY per EUR, with no decimal point
    // anywhere in the base currency to hide a shift error.
    const result = resolveRate(
      field({ entry: 'charged', charged: '7200', baseCurrency: 'JPY', known: undefined }),
      TODAY,
    );

    expect(result).toMatchObject({ rate: '160', chargedMinor: 7200 });
  });

  it('handles an exponent-3 base currency', () => {
    // 45.00 EUR charged as KWD 14.625 -> 0.325 per EUR.
    const result = resolveRate(
      field({ entry: 'charged', charged: '14.625', baseCurrency: 'KWD', known: undefined }),
      TODAY,
    );

    expect(result).toMatchObject({ rate: '0.325', chargedMinor: 14_625 });
  });
});

describe('sanity warnings', () => {
  it('says nothing about the rate it prefilled', () => {
    const result = resolveRate(field({ rate: '' }), TODAY);

    expect(result).toMatchObject({ warnings: [] });
  });

  it('accepts ordinary drift silently', () => {
    // 4.05 is 2% off 3.9644 - a fortnight of currency movement, not an error.
    const result = resolveRate(field({ rate: '4.05' }), TODAY);

    expect(result).toMatchObject({ warnings: [] });
  });

  it('catches a rate entered backwards and offers the right one', () => {
    /*
     * The failure mode this exists for: the label reads "1 EUR = [ ] ILS" and
     * the user types what they think of as "the euro rate", 0.25. The hero
     * balance is then wrong by ~15x, in the direction that makes them feel
     * richer.
     */
    const result = resolveRate(field({ rate: '0.2522' }), TODAY);

    expect(result).toMatchObject({
      warnings: [{ code: 'rate_inverted', suggestion: '3.9644' }],
    });
  });

  it('reports inversion INSTEAD of the deviation band, not alongside it', () => {
    const result = resolveRate(field({ rate: '0.2522' }), TODAY);
    if (result.status !== 'resolved') throw new Error('expected a resolution');

    expect(result.warnings).toHaveLength(1);
  });

  it('warns beyond a quarter off the last known rate', () => {
    const result = resolveRate(field({ rate: '5.5' }), TODAY);

    expect(result).toMatchObject({
      warnings: [{ code: 'rate_far_from_known', known: '3.9644', on: d('2026-09-12') }],
    });
  });

  it('warns rather than blocks - the user may simply be right', () => {
    const result = resolveRate(field({ rate: '5.5' }), TODAY);

    expect(result.status).toBe('resolved');
  });

  it('has nothing to compare against for an unseen pair', () => {
    const result = resolveRate(field({ rate: '999', known: undefined }), TODAY);

    expect(result).toMatchObject({ status: 'resolved', warnings: [] });
  });
});

describe('the deviation boundary', () => {
  // Exact, because it is computed in bigint rationals rather than floats: a
  // fuzzy boundary on a warning is a warning that fires differently on
  // different machines.
  it.each([
    ['4.9555', false],
    ['4.95551', true],
    ['2.9733', false],
    ['2.97329', true],
  ])('%s exceeds a quarter: %s', (value, expected) => {
    expect(rateDeviationExceeds(value, '3.9644', 1n, 4n)).toBe(expected);
  });
});

describe('chargedFor', () => {
  it('is undefined when there is nothing to derive from', () => {
    expect(chargedFor('', 'EUR', 'ILS', '3.9644')).toBeUndefined();
    expect(chargedFor('0', 'EUR', 'ILS', '3.9644')).toBeUndefined();
    expect(chargedFor('45', 'EUR', 'ILS', '0')).toBeUndefined();
  });

  it('is undefined - not zero - for a same-currency transaction', () => {
    expect(chargedFor('45', 'ILS', 'ILS', '1')).toBeUndefined();
  });

  it('converts once', () => {
    expect(chargedFor('45', 'EUR', 'ILS', '3.9644')).toBe(17_840);
  });
});

describe('needsRestamp', () => {
  const previous = { currency: 'EUR', date: d('2024-03-01'), baseCurrency: 'ILS' };

  it('does NOT re-derive when only the amount was corrected', () => {
    // §4 re-converted at today's rate on any edit, so fixing a typo in a 2024
    // row rewrote that row's history at 2026 prices.
    expect(needsRestamp(previous, previous)).toBe(false);
  });

  it.each([
    ['currency', { ...previous, currency: 'USD' }],
    ['date', { ...previous, date: d('2024-04-01') }],
    ['baseCurrency', { ...previous, baseCurrency: 'USD' }],
  ])('re-derives when the %s changes', (_label, next) => {
    expect(needsRestamp(previous, next)).toBe(true);
  });
});

describe('prefillRate', () => {
  const onDate: KnownRate = { rate: '3.99', rateDate: d('2026-09-15'), rateSource: 'frankfurter' };

  it('prefers a quote for the transaction date', () => {
    expect(prefillRate(onDate, KNOWN)).toBe(onDate);
  });

  it('falls back to any rate the install has ever seen', () => {
    expect(prefillRate(undefined, KNOWN)).toBe(KNOWN);
  });

  it('is undefined only when the pair is genuinely unknown', () => {
    expect(prefillRate(undefined, undefined)).toBeUndefined();
  });
});

describe('rate primitives', () => {
  it('inverts exactly enough to round-trip', () => {
    expect(invertRate('4')).toBe('0.25');
    expect(invertRate('0.25')).toBe('4');
  });

  it('derives a rate from amounts across every exponent pair', () => {
    // USD(2) -> JPY(0): $100.00 charged as 15,000 yen.
    expect(rateFromAmounts(10_000, 'USD', 15_000, 'JPY')).toBe('150');
    // JPY(0) -> KWD(3): 15,000 yen charged as 46.125 dinars. Both the yen
    // and the dinar are at the far ends of the exponent table, so a shift
    // applied in the wrong direction here is off by a factor of a million.
    expect(rateFromAmounts(15_000, 'JPY', 46_125, 'KWD')).toBe('0.003075');
    // The same-exponent baseline.
    expect(rateFromAmounts(10_000, 'USD', 36_500, 'ILS')).toBe('3.65');
  });

  it('refuses to divide by an absent amount', () => {
    expect(() => rateFromAmounts(0, 'EUR', 17_840, 'ILS')).toThrow(RangeError);
    expect(() => rateFromAmounts(4500, 'EUR', 0, 'ILS')).toThrow(RangeError);
  });
});
