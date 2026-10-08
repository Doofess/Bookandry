import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Minor } from '@/types/money';

import { CURRENCY_EXPONENTS, exponentOf } from './currency-meta';
import {
  add,
  annualEffectiveRate,
  longCreditPayments,
  resetRate,
  withMonthOfInterest,
  AmountOverflowError,
  convertMinor,
  creditSchedule,
  crossRate,
  decimalToRational,
  divideMinor,
  divRound,
  InvalidDecimalError,
  invertRate,
  isPositiveRate,
  multiplyRates,
  normalizeAmountInput,
  normalizeAnnualRate,
  normalizeRateMargin,
  addRates,
  presentValueMinor,
  parseStatementAmount,
  minorFromNumber,
  addPercentFee,
  rateDeviationExceeds,
  rateFromAmounts,
  spitzerPayment,
  sum,
  toDecimalString,
  toMinor,
  prorateMinor,
} from './money';

describe('decimalToRational', () => {
  it.each([
    ['1.0865', 10865n, 10000n],
    ['-0.5', -5n, 10n],
    ['1500', 1500n, 1n],
    ['0', 0n, 1n],
    ['.5', 5n, 10n],
    // String(0.00000061) is "6.1e-7": exponential input is real, not theoretical.
    ['6.1e-7', 61n, 100000000n],
    ['1.5e2', 150n, 1n],
  ])('parses %s exactly', (input, n, d) => {
    expect(decimalToRational(input)).toEqual({ n, d });
  });

  it.each(['', 'abc', '1.2.3', '--1', '1,5'])('rejects %s', (bad) => {
    expect(() => decimalToRational(bad)).toThrow(InvalidDecimalError);
  });
});

describe('divRound (half away from zero)', () => {
  it.each([
    [5n, 2n, 3n],
    [-5n, 2n, -3n],
    [3n, 2n, 2n],
    [-3n, 2n, -2n],
    [1n, 2n, 1n],
    [-1n, 2n, -1n],
    [4n, 2n, 2n],
    [0n, 3n, 0n],
  ])('divRound(%s, %s) === %s', (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected);
  });

  it('is sign-symmetric where Math.round is not', () => {
    // Math.round(-2.5) === -2, which would break convert(-x) === -convert(x).
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(Math.round(-2.5)).toBe(-2);
  });

  it('throws on division by zero', () => {
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
  });
});

describe('toMinor', () => {
  it.each([
    // The classic float failures. Math.round(1.005 * 100) === 100, not 101,
    // because 1.005 is really 1.00499999999999989341858963598.
    ['1.005', 'USD', 101],
    ['-1.005', 'USD', -101],
    ['8.615', 'USD', 862],
    ['0.615', 'USD', 62],
    ['1234.56', 'USD', 123456],
    ['45.00', 'EUR', 4500],
    ['0', 'USD', 0],
    ['1500', 'JPY', 1500],
    ['1500.4', 'JPY', 1500],
    ['1500.5', 'JPY', 1501],
    ['-1500.5', 'JPY', -1501],
    ['0.0005', 'KWD', 1],
    ['1.2345', 'KWD', 1235],
    ['100.5', 'JPY', 101],
  ])('toMinor(%s, %s) === %s', (display, currency, expected) => {
    expect(toMinor(display, currency)).toBe(expected);
  });

  it('accepts locale grouping and pasted European formats', () => {
    expect(toMinor('1,234.56', 'USD')).toBe(123456);
    expect(toMinor('1.234,56', 'USD')).toBe(123456);
    expect(toMinor('1 234.56', 'USD')).toBe(123456);
  });

  it('strips currency symbols and the bidi marks Intl injects', () => {
    // he-IL currency output carries RLM marks. A user pasting it back must not
    // produce a parse error or a wrong number.
    expect(toMinor('\u200F1,234.56 ₪', 'ILS')).toBe(123456);
    expect(toMinor('$45.00', 'USD')).toBe(4500);
  });

  it('throws rather than silently overflowing', () => {
    expect(() => toMinor('99999999999999999999', 'USD')).toThrow(AmountOverflowError);
  });
});

describe('toDecimalString', () => {
  it.each([
    [123456, 'USD', '1234.56'],
    [5, 'USD', '0.05'],
    [0, 'USD', '0.00'],
    [-4500, 'USD', '-45.00'],
    [1500, 'JPY', '1500'],
    [1235, 'KWD', '1.235'],
  ])('toDecimalString(%s, %s) === %s', (minor, currency, expected) => {
    expect(toDecimalString(minor, currency)).toBe(expected);
  });
});

describe('convertMinor', () => {
  it.each([
    // The spec's own example: EUR 45.00 at 1.091 -> USD 49.10
    [4500, 'EUR', 'USD', '1.091', 4910],
    // Exponent 2 -> 0. Operand order matters in float: 0.0067*100 evaluates to
    // 0.6699999999999999, which is why this path is BigInt.
    [10000, 'JPY', 'USD', '0.0067', 6700],
    [10000, 'USD', 'JPY', '147.25', 14725],
    [1, 'USD', 'JPY', '147.25', 1],
    [-1, 'USD', 'JPY', '147.25', -1],
    [1, 'USD', 'JPY', '150', 2],
    [-1, 'USD', 'JPY', '150', -2],
    [1000, 'JPY', 'KWD', '0.002078', 2078],
    [1, 'JPY', 'KWD', '0.002078', 2],
    [1000, 'KWD', 'JPY', '481', 481],
    // ILS at a realistic rate: the case the rateUsed=1 fallback got wrong by
    // 3.05x, inside the largest number on the screen.
    [50000, 'ILS', 'USD', '0.3275037', 16375],
    [0, 'USD', 'EUR', '1.5', 0],
  ])('convertMinor(%s, %s->%s @ %s) === %s', (amount, from, to, rate, expected) => {
    expect(convertMinor(amount, from, to, rate)).toBe(expected);
  });

  it('short-circuits identity exactly, without consulting the rate', () => {
    // Structural, not numerical. This is what makes USD->ILS->USD lossless.
    expect(convertMinor(12345, 'USD', 'USD', 'not-a-rate')).toBe(12345);
  });

  it('is sign-symmetric', () => {
    const pos = convertMinor(4500, 'EUR', 'USD', '1.091');
    expect(convertMinor(-4500, 'EUR', 'USD', '1.091')).toBe(-pos);
  });

  it('rejects non-positive rates instead of producing nonsense', () => {
    expect(() => convertMinor(100, 'USD', 'EUR', '0')).toThrow(RangeError);
    expect(() => convertMinor(100, 'USD', 'EUR', '-1.5')).toThrow(RangeError);
  });

  it('throws on overflow rather than returning a wrong integer', () => {
    expect(() => convertMinor(9_000_000_000_000_000, 'JPY', 'KWD', '1000')).toThrow(AmountOverflowError);
  });

  it('shows why round-tripping through the base must never be a code path', () => {
    // 1.000 KWD -> JPY -> KWD loses a fils. Every reconvert therefore recomputes
    // from (amountMinor, currency), never from baseAmountMinor.
    const jpy = convertMinor(1000, 'KWD', 'JPY', '500.50421');
    expect(jpy).toBe(501);
    // 1/500.50421 = 0.0019979851917729125; a rounded inverse would
    // accidentally round-trip cleanly and hide the loss.
    expect(convertMinor(jpy, 'JPY', 'KWD', '0.0019979851917729125')).toBe(1001);
  });
});

describe('crossRate', () => {
  it('derives a rate via a third currency', () => {
    expect(crossRate('3.72', '147.25')).toBe('39.5833333333');
  });

  it('is exact for a clean ratio', () => {
    expect(crossRate('2', '4')).toBe('2');
    expect(crossRate('4', '2')).toBe('0.5');
  });

  it('rejects non-positive inputs', () => {
    expect(() => crossRate('0', '1')).toThrow(RangeError);
  });
});

describe('add and sum', () => {
  it('adds integers', () => {
    expect(add(4500, 250)).toBe(4750);
    expect(sum([100, 200, 300])).toBe(600);
    expect(sum([])).toBe(0);
  });

  it('is order-independent', () => {
    expect(sum([1, 2, 3])).toBe(sum([3, 1, 2]));
  });

  it('throws on overflow', () => {
    expect(() => add(Number.MAX_SAFE_INTEGER, 1)).toThrow(AmountOverflowError);
  });
});

describe('currency exponents', () => {
  it('uses the frozen ISO table', () => {
    expect(exponentOf('USD')).toBe(2);
    expect(exponentOf('ILS')).toBe(2);
    expect(exponentOf('JPY')).toBe(0);
    expect(exponentOf('KWD')).toBe(3);
    expect(exponentOf('BHD')).toBe(3);
    expect(exponentOf('ISK')).toBe(0);
    expect(exponentOf('CLF')).toBe(4);
    expect(exponentOf('ZZZ')).toBe(2);
  });

  it('is frozen so it cannot drift at runtime', () => {
    expect(Object.isFrozen(CURRENCY_EXPONENTS)).toBe(true);
  });
});

describe('properties', () => {
  it('toMinor and toDecimalString round-trip for all safe amounts', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), fc.constantFrom('USD', 'JPY', 'KWD'), (m, c) => {
        expect(toMinor(toDecimalString(m, c), c)).toBe(m);
      }),
      { numRuns: 400 },
    );
  });

  it('conversion is sign-symmetric for every pair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e9 }),
        fc.constantFrom('USD', 'JPY', 'KWD', 'ILS'),
        fc.constantFrom('USD', 'JPY', 'KWD', 'ILS'),
        (amount, from, to) => {
          // + 0 normalises -0 to +0: Object.is(-0, +0) is false, and a
          // sub-minor-unit amount legitimately rounds to zero.
          expect(convertMinor(-amount, from, to, '1.2345') + 0).toBe(
            -convertMinor(amount, from, to, '1.2345') + 0,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('stays within half a minor unit of the true value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e9 }),
        fc.constantFrom('USD', 'JPY', 'KWD'),
        fc.constantFrom('USD', 'JPY', 'KWD'),
        (amount, from, to) => {
          // from === to short-circuits to the identity and never multiplies,
          // which is the property that makes a base round trip lossless.
          if (from === to) {
            expect(convertMinor(amount, from, to, '1.2345')).toBe(amount);
            return;
          }
          const got = convertMinor(amount, from, to, '1.2345');
          const expected = (amount / 10 ** exponentOf(from)) * 1.2345 * 10 ** exponentOf(to);
          // The float reference itself carries ~1e-16 relative error, which at
          // 1e12 magnitudes exceeds a fixed epsilon. Bound by the reference's
          // own precision, not by an absolute fudge factor - convertMinor is
          // exact, so any real violation would be on the order of a whole unit.
          const referenceError = Math.abs(expected) * 1e-12;
          expect(Math.abs(got - expected)).toBeLessThanOrEqual(0.5 + referenceError);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('is monotonic in the amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e8 }), fc.integer({ min: 0, max: 1e8 }), (a, b) => {
        if (a < b) {
          expect(convertMinor(a, 'USD', 'JPY', '147.25')).toBeLessThanOrEqual(
            convertMinor(b, 'USD', 'JPY', '147.25'),
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('normalizeAmountInput', () => {
  it.each([
    ['1,234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ['1234', '1234'],
    ['0,5', '0.5'],
    ['0.5', '0.5'],
    ['-45.00', '-45.00'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeAmountInput(input)).toBe(expected);
  });
});

describe('input guards', () => {
  it('rejects a non-integer minor amount in toDecimalString', () => {
    expect(() => toDecimalString(1.5, 'USD')).toThrow(RangeError);
  });

  it('rejects a non-integer minor amount in convertMinor', () => {
    expect(() => convertMinor(1.5, 'USD', 'EUR', '1.1')).toThrow(RangeError);
  });

  it('rejects a malformed rate string', () => {
    expect(() => convertMinor(100, 'USD', 'EUR', 'abc')).toThrow(InvalidDecimalError);
  });

  it('parses a plus-signed decimal', () => {
    expect(decimalToRational('+1.5')).toEqual({ n: 15n, d: 10n });
  });

  it('handles a trailing-zero fraction in crossRate', () => {
    expect(crossRate('1', '2.5000')).toBe('2.5');
  });
});

describe('divRound sign handling', () => {
  it('handles a negative denominator', () => {
    expect(divRound(5n, -2n)).toBe(-3n);
    expect(divRound(-5n, -2n)).toBe(3n);
  });

  it('handles an exactly divisible negative pair', () => {
    expect(divRound(-4n, 2n)).toBe(-2n);
    expect(divRound(4n, -2n)).toBe(-2n);
  });
});

describe('multiplyRates', () => {
  it('composes two rates exactly', () => {
    // 1 EUR = 3.95 ILS, 1 ILS = 0.32 USD  =>  1 EUR = 1.264 USD
    expect(multiplyRates('3.95', '0.32')).toBe('1.264');
  });

  it('is the identity when one leg is 1', () => {
    expect(multiplyRates('3.95', '1')).toBe('3.95');
    expect(multiplyRates('1', '0.32')).toBe('0.32');
  });

  it('round-trips through an inverse to within the stated precision', () => {
    const composed = multiplyRates('3.95', '0.2531645569');
    expect(Number(composed)).toBeCloseTo(1, 8);
  });

  it('composing rates rounds ONCE, unlike converting twice', () => {
    // The point of the function. Two sequential conversions round at each step;
    // composing first applies a single rounding to the original amount.
    const twice = convertMinor(convertMinor(4500, 'EUR', 'ILS', '3.95'), 'ILS', 'USD', '0.32');
    const once = convertMinor(4500, 'EUR', 'USD', multiplyRates('3.95', '0.32'));
    expect(once).toBe(5688);
    expect(Math.abs(once - twice)).toBeLessThanOrEqual(1);
  });

  it('rejects non-positive rates', () => {
    expect(() => multiplyRates('0', '1')).toThrow(RangeError);
    expect(() => multiplyRates('1', '-2')).toThrow(RangeError);
  });
});

describe('multiplyRates formatting', () => {
  it('emits a whole number with no trailing decimal point', () => {
    expect(multiplyRates('2', '3')).toBe('6');
    expect(multiplyRates('4', '0.25')).toBe('1');
  });

  it('strips trailing zeros from the fraction', () => {
    expect(multiplyRates('1.5', '2')).toBe('3');
    expect(multiplyRates('1.25', '2')).toBe('2.5');
  });
});

describe('rateFromAmounts', () => {
  it('refuses a non-integer amount', () => {
    // The caller has already lost precision by this point; rounding here would
    // hide where it happened.
    expect(() => rateFromAmounts(45.5, 'EUR', 17_840, 'ILS')).toThrow(RangeError);
    expect(() => rateFromAmounts(4500, 'EUR', 178.4, 'ILS')).toThrow(RangeError);
  });

  it('refuses a non-positive amount on either side', () => {
    expect(() => rateFromAmounts(0, 'EUR', 17_840, 'ILS')).toThrow(RangeError);
    expect(() => rateFromAmounts(-4500, 'EUR', 17_840, 'ILS')).toThrow(RangeError);
    expect(() => rateFromAmounts(4500, 'EUR', 0, 'ILS')).toThrow(RangeError);
    expect(() => rateFromAmounts(4500, 'EUR', -1, 'ILS')).toThrow(RangeError);
  });

  it('emits a whole number with no trailing decimal point', () => {
    expect(rateFromAmounts(10_000, 'USD', 40_000, 'ILS')).toBe('4');
  });

  it.each([
    // The exponent shift, in both directions and at both extremes of the
    // table. Applied the wrong way round, USD -> KWD is out by a factor of
    // ten and JPY -> KWD by a factor of a million.
    [10_000, 'USD', 15_000, 'JPY', '150'],
    [15_000, 'JPY', 46_125, 'KWD', '0.003075'],
    [10_000, 'USD', 30_750, 'KWD', '0.3075'],
    [30_750, 'KWD', 10_000, 'USD', '3.2520325203'],
    [10_000, 'USD', 36_500, 'ILS', '3.65'],
  ])('%i %s charged as %i %s is %s', (amount, from, charged, to, expected) => {
    expect(rateFromAmounts(amount, from, charged, to)).toBe(expected);
  });

  it('honours the requested precision', () => {
    expect(rateFromAmounts(30_000, 'USD', 10_000, 'ILS', 4)).toBe('0.3333');
  });
});

describe('invertRate', () => {
  it('round-trips an exact reciprocal', () => {
    expect(invertRate('4')).toBe('0.25');
    expect(invertRate('0.25')).toBe('4');
  });

  it('rounds a repeating reciprocal at the requested precision', () => {
    expect(invertRate('3', 4)).toBe('0.3333');
  });

  it('rejects a non-positive rate', () => {
    expect(() => invertRate('0')).toThrow(RangeError);
    expect(() => invertRate('-2')).toThrow(RangeError);
  });
});

describe('isPositiveRate', () => {
  it.each([
    ['1', true],
    ['0.0001', true],
    ['0', false],
    ['-1', false],
  ])('%s is positive: %s', (value, expected) => {
    expect(isPositiveRate(value)).toBe(expected);
  });

  it('is false rather than throwing on junk', () => {
    // It guards a form field that is re-evaluated on every keystroke, so a
    // half-typed value must not throw into a render.
    expect(isPositiveRate('abc')).toBe(false);
    expect(isPositiveRate('')).toBe(false);
  });
});

describe('rateDeviationExceeds', () => {
  it('is false for identical values at zero tolerance', () => {
    expect(rateDeviationExceeds('3.9644', '3.9644', 0n, 1n)).toBe(false);
  });

  it('is true for any difference at zero tolerance', () => {
    expect(rateDeviationExceeds('3.96441', '3.9644', 0n, 1n)).toBe(true);
  });

  it('is symmetric about the reference, not about zero', () => {
    // A quarter ABOVE and a quarter BELOW are different absolute distances,
    // because the denominator is the reference. Both must land inside.
    expect(rateDeviationExceeds('5', '4', 1n, 4n)).toBe(false);
    expect(rateDeviationExceeds('3', '4', 1n, 4n)).toBe(false);
    expect(rateDeviationExceeds('5.01', '4', 1n, 4n)).toBe(true);
    expect(rateDeviationExceeds('2.99', '4', 1n, 4n)).toBe(true);
  });

  it('treats a non-positive value as out of band rather than dividing by it', () => {
    expect(rateDeviationExceeds('0', '4', 1n, 4n)).toBe(true);
    expect(rateDeviationExceeds('4', '0', 1n, 4n)).toBe(true);
  });
});

describe('divideMinor', () => {
  it('rounds half away from zero, like every other rounding here', () => {
    expect(divideMinor(100, 3)).toBe(33);
    expect(divideMinor(101, 3)).toBe(34);
    expect(divideMinor(5, 2)).toBe(3);
    expect(divideMinor(-5, 2)).toBe(-3);
  });

  it('turns a yearly premium into a monthly equivalent', () => {
    // The only reason this exists: a 1,200 yearly bill has to be comparable
    // with a 100 monthly one.
    expect(divideMinor(120_000, 12)).toBe(10_000);
    expect(divideMinor(100_000, 12)).toBe(8333);
  });

  it('refuses a zero or fractional divisor rather than returning Infinity', () => {
    expect(() => divideMinor(100, 0)).toThrow(RangeError);
    expect(() => divideMinor(100, 1.5)).toThrow(RangeError);
  });

  it('refuses a non-integer amount rather than rounding it twice', () => {
    // A float here means precision was already lost upstream, and silently
    // rounding it would hide where.
    expect(() => divideMinor(100.5, 12)).toThrow(RangeError);
  });
});

describe('לוח שפיצר', () => {
  /*
   * The formula an Israeli card issuer uses for עסקת קרדיט:
   *
   *   PMT = PV · r(1+r)^n / ((1+r)^n − 1),  r = annual / 12
   *
   * Expectations are computed from the formula in floating point and compared
   * to the exact BigInt implementation, which is the only comparison worth
   * making: agreeing with a number I typed by hand would only prove I can type.
   */
  const reference = (principal: number, annualPercent: number, months: number): number => {
    const r = annualPercent / 100 / 12; // money-allow: a reference implementation, in floats, on purpose.
    if (r === 0) return Math.round(principal / months); // money-allow: same.
    const grown = (1 + r) ** months;
    return Math.round((principal * r * grown) / (grown - 1));
  };

  it.each([
    [120_000, '12', 6],
    [120_000, '15.5', 12],
    [1_000_000, '9.9', 36],
    [45_000, '3', 24],
    [999_999, '21.75', 60],
  ])('matches the formula for %i at %s%% over %i months', (principal, rate, months) => {
    expect(spitzerPayment(principal, rate, months)).toBe(reference(principal, Number(rate), months));
  });

  it('gives the worked example everybody checks first', () => {
    // ₪1,200 over 6 payments at 12% annual: 1% a month, ₪207.06 a payment.
    expect(spitzerPayment(120_000, '12', 6)).toBe(20_706);
  });

  it('falls back to a plain split at zero interest', () => {
    // Not a special case in the domain - it is exactly תשלומים - but it IS a
    // hole in the formula: the denominator goes to zero.
    expect(spitzerPayment(120_000, '0', 6)).toBe(20_000);
    expect(spitzerPayment(100_000, '0.0', 3)).toBe(33_333);
  });

  it('keeps the three figures consistent with each other', () => {
    /*
     * The total is payment × count, not an independently rounded number,
     * because that is what the card will actually charge. The interest is the
     * difference, so the three can never disagree.
     */
    const plan = creditSchedule(120_000, '12', 6);

    expect(plan.paymentMinor).toBe(20_706);
    expect(plan.totalMinor).toBe(20_706 * 6);
    expect(plan.interestMinor).toBe(20_706 * 6 - 120_000);
    expect(plan.interestMinor).toBeGreaterThan(0);
  });

  it('costs nothing at zero interest', () => {
    const plan = creditSchedule(120_000, '0', 6);
    expect(plan.totalMinor).toBe(120_000);
    expect(plan.interestMinor).toBe(0);
  });

  it('refuses inputs that have no answer', () => {
    expect(() => spitzerPayment(120_000, '-1', 6)).toThrow(RangeError);
    expect(() => spitzerPayment(120_000, '12', 0)).toThrow(RangeError);
    expect(() => spitzerPayment(-1 as Minor, '12', 6)).toThrow(RangeError);
    expect(() => spitzerPayment(120_000, 'not a rate', 6)).toThrow();
  });

  it('rounds once, not per payment', () => {
    // An implementation that rounded the monthly rate first, or divided in
    // steps, drifts by an agora on exactly this kind of input.
    expect(spitzerPayment(333_333, '7.35', 17)).toBe(reference(333_333, 7.35, 17));
  });
});

describe('presentValueMinor', () => {
  it('gives back the principal of a whole Spitzer plan', () => {
    // Six payments of 207.06 at 12% are worth the ₪1,200 they were priced from,
    // to within the agora the payment was rounded by.
    expect(
      presentValueMinor(
        Array.from({ length: 6 }, () => 20_706),
        '12',
      ),
    ).toBe(120_001);
    const payment = spitzerPayment(1_000_000, '9.9', 36);
    expect(
      Math.abs(
        presentValueMinor(
          Array.from({ length: 36 }, () => payment),
          '9.9',
        ) - 1_000_000,
      ),
    ).toBeLessThanOrEqual(18);
  });

  it('is what is still owed part-way through', () => {
    // After two of six at 1% a month, four payments remain: 207.06 × (1 − 1.01⁻⁴) / 0.01.
    const left = presentValueMinor([20_706, 20_706, 20_706, 20_706], '12');
    const reference = Math.round((20_706 * (1 - 1.01 ** -4)) / 0.01); // money-allow: a float reference, on purpose.
    expect(left).toBe(reference);
  });

  it('discounts each payment by its own month, uneven ones too', () => {
    // 10,100 a month away at 1% a month is worth 10,000; 10,201 two months away likewise.
    expect(presentValueMinor([10_100], '12')).toBe(10_000);
    expect(presentValueMinor([10_100, 10_201], '12')).toBe(20_000);
  });

  it('is the plain sum with no interest, or no payments', () => {
    expect(presentValueMinor([100, 200, 300], '0')).toBe(600);
    expect(presentValueMinor([], '12')).toBe(0);
  });

  it('refuses inputs that have no answer', () => {
    expect(() => presentValueMinor([100], '-1')).toThrow(RangeError);
    expect(() => presentValueMinor([-1 as Minor], '12')).toThrow(RangeError);
    expect(() => presentValueMinor([0.5], '12')).toThrow(RangeError);
  });
});

describe('parseStatementAmount', () => {
  it.each([
    ['1,234', 123_400],
    ['1,234.50', 123_450],
    ['1.234,56', 123_456],
    ['1,234,567', 123_456_700],
    ['1.234.567', 123_456_700],
    ['12.5', 1_250],
    ['12,5', 1_250],
    ['12,50', 1_250],
    ['.5', 50],
    ['0', 0],
    ['₪ 1,234.50', 123_450],
    ['\u200F₪1,234', 123_400],
    ['1,234.50 ש"ח', 123_450],
    ['USD 45.99', 4_599],
    ['+20', 2_000],
    ['1\u00A0234,00', 123_400],
  ])('reads %j', (text, minor) => {
    expect(parseStatementAmount(text, 'ILS')).toBe(minor);
  });

  it.each([
    ['-150.00', -15_000],
    ['150.00-', -15_000],
    ['(150.00)', -15_000],
    ['\u2212150', -15_000],
    ['(-150)', -15_000],
    ['₪-1,234.50', -123_450],
  ])('reads %j as money going the other way', (text, minor) => {
    expect(parseStatementAmount(text, 'ILS')).toBe(minor);
  });

  it.each([
    '',
    'abc',
    '1.234',
    '1,2,3',
    '12,34,567',
    '1.2.3,4.5',
    '12.345',
    '1,234.5.6',
    '₪',
    '--',
    '1,23,456.00',
  ])('refuses %j rather than guess', (text) => {
    expect(parseStatementAmount(text, 'ILS')).toBeUndefined();
  });

  it('follows the currency: three decimals, or none', () => {
    expect(parseStatementAmount('1.234', 'KWD')).toBe(1_234);
    expect(parseStatementAmount('1,234', 'KWD')).toBeUndefined();
    expect(parseStatementAmount('1.234', 'JPY')).toBe(1_234);
    expect(parseStatementAmount('1,234', 'JPY')).toBe(1_234);
    expect(parseStatementAmount('12.5', 'JPY')).toBeUndefined();
  });

  it('takes the decimal mark a column has already shown', () => {
    expect(parseStatementAmount('1.234', 'ILS', ',')).toBe(123_400);
    expect(parseStatementAmount('1,234', 'ILS', '.')).toBe(123_400);
    expect(parseStatementAmount('1234,5', 'ILS', ',')).toBe(123_450);
    expect(parseStatementAmount('1234.56', 'ILS', ',')).toBeUndefined();
    expect(parseStatementAmount('1,2,3', 'ILS', ',')).toBeUndefined();
  });
});

describe('minorFromNumber', () => {
  it('stops a cell’s binary noise at the minor unit, rounding once', () => {
    expect(minorFromNumber(1234.5000000001, 'ILS')).toBe(123_450);
    expect(minorFromNumber(-0.005, 'ILS')).toBe(-1);
    expect(minorFromNumber(1e-7, 'ILS')).toBe(0);
    expect(minorFromNumber(42, 'JPY')).toBe(42);
    expect(minorFromNumber(Number.NaN, 'ILS')).toBeUndefined();
    expect(minorFromNumber(Number.POSITIVE_INFINITY, 'ILS')).toBeUndefined();
  });
});

describe('normalizeAnnualRate', () => {
  it.each([
    ['12', '12'],
    [' 12.5 ', '12.5'],
    ['12.', '12.'],
    ['.5', '.5'],
    ['0', '0'],
    ['100', '100'],
    ['100.00', '100.00'],
  ])('accepts %j', (input, expected) => {
    expect(normalizeAnnualRate(input)).toBe(expected);
  });

  it.each(['', '.', '1.2.3', '-1', '+5', '1e1', '100.01', '1200', '12%', 'abc'])('refuses %j', (input) => {
    // Every one of these either crashes the BigInt parser, means something
    // other than it looks like, or is a typo rather than a loan.
    expect(normalizeAnnualRate(input)).toBeUndefined();
  });

  it('accepts every rate it returns, so a stored rate always re-validates', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (basisPoints) => {
        const rate = (basisPoints / 100).toFixed(2); // money-allow: generating input text, not money.
        const normalized = normalizeAnnualRate(rate);
        expect(normalized).toBe(rate);
        expect(normalizeAnnualRate(normalized!)).toBe(normalized);
      }),
    );
  });
});

describe('creditSchedule never costs less than the purchase', () => {
  it('costs exactly the purchase even when it does not divide evenly', () => {
    // payment × count would be 333.33 × 3 = ₪999.99, and the lost agora would
    // be displayed as a negative interest charge.
    expect(creditSchedule(100_000, '0', 3)).toEqual({
      paymentMinor: 33_333,
      totalMinor: 100_000,
      interestMinor: 0,
    });
    expect(creditSchedule(100_000, '0.00', 3).interestMinor).toBe(0);
  });

  it('treats a rate too small to survive rounding as interest-free', () => {
    // Found by the property below. One agora over 3 at 0.01%: the payment
    // rounds to zero, and payment × 3 would say the plan costs LESS than the
    // purchase. Where the interest vanishes in rounding, the plan is תשלומים.
    expect(creditSchedule(1, '0.01', 3)).toEqual({ paymentMinor: 0, totalMinor: 1, interestMinor: 0 });
    expect(creditSchedule(100_000, '0.01', 3).totalMinor).toBeGreaterThanOrEqual(100_000);
  });

  it('never charges negative interest at any positive rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 120 }),
        (principal, basisPoints, months) => {
          const rate = (basisPoints / 100).toFixed(2); // money-allow: generating input text, not money.
          expect(creditSchedule(principal, rate, months).interestMinor).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe('prorateMinor', () => {
  it('takes the part of an amount its days cover, rounded once', () => {
    expect(prorateMinor(30000, 15, 30)).toBe(15000);
    expect(prorateMinor(10000, 16, 31)).toBe(5161);
    expect(prorateMinor(10000, 0, 30)).toBe(0);
    expect(prorateMinor(10000, 30, 30)).toBe(10000);
  });

  it('refuses a part that is not one', () => {
    expect(() => prorateMinor(100, 31, 30)).toThrow(RangeError);
    expect(() => prorateMinor(100, 1, 0)).toThrow(RangeError);
    expect(() => prorateMinor(100, -1, 30)).toThrow(RangeError);
    expect(() => prorateMinor(1.5, 1, 30)).toThrow(RangeError);
  });
});

describe('normalizeRateMargin', () => {
  it.each([
    ['1.5', '1.5'],
    ['+2', '2'],
    ['-0.5', '-0.5'],
    [' -.25 ', '-.25'],
    ['', '0'],
    ['  ', '0'],
    ['100', '100'],
    ['-100', '-100'],
  ])('reads %j as %j', (input, expected) => {
    expect(normalizeRateMargin(input)).toBe(expected);
  });

  it.each(['1.2.3', '--1', '1e1', 'abc', '100.5', '-101', '+'])('refuses %j', (input) => {
    expect(normalizeRateMargin(input)).toBeUndefined();
  });
});

describe('addRates', () => {
  it.each([
    ['4.75', '1.5', '6.25'],
    ['4.75', '-0.4', '4.35'],
    ['4.75', '-4.75', '0'],
    ['3.25', '1.5', '4.75'],
    ['0.5', '-1', '-0.5'],
    ['4', '0', '4'],
    ['4.', '.125', '4.125'],
    ['0.05', '0.05', '0.1'],
  ])('%s + %s = %s, exactly', (a, b, expected) => {
    expect(addRates(a, b)).toBe(expected);
  });
});

describe('addPercentFee', () => {
  it.each([
    [10_000, '2.5', 10_250],
    [10_000, '0', 10_000],
    [333, '3', 343],
    // 0.5 agora rounds away from zero.
    [50, '1', 51],
    [12_345, '2.75', 12_684],
  ])('%i + %s%% = %i', (minor, percent, expected) => {
    expect(addPercentFee(minor, percent)).toBe(expected);
  });
});

describe('annualEffectiveRate', () => {
  it('matches the published pairs', () => {
    expect(annualEffectiveRate('15.25', 12)).toBe('16.36');
    expect(annualEffectiveRate('14.15', 12)).toBe('15.10');
    expect(annualEffectiveRate('8.75', 12)).toBe('9.11');
    expect(annualEffectiveRate('20.90', 4)).toBe('22.60'); // Isracard late interest, quarterly
    expect(annualEffectiveRate('0', 12)).toBe('0.00');
  });
});
describe('resetRate', () => {
  it('moves by the change in prime', () => {
    expect(resetRate('15.5', '4.75', '5.25')).toBe('16');
    expect(resetRate('15.5', '4.75', '4.25')).toBe('15');
  });
  it('never goes below zero', () => {
    expect(resetRate('1', '5', '3')).toBe('0');
    expect(resetRate('1', '-2', '-3')).toBe('0');
    expect(resetRate('1', '-2', '-1')).toBe('2');
    expect(resetRate('15.5', '0', '0.75')).toBe('16.25');
  });
});
describe('longCreditPayments', () => {
  it('is plain Spitzer with no reset, and re-amortizes the balance at payment 19', () => {
    const plain = longCreditPayments(300_000, '15.5', 24, undefined);
    expect(plain.first).toBe(spitzerPayment(300_000, '15.5', 24));
    const same = longCreditPayments(300_000, '15.5', 24, { atPayment: 19, rate: '15.5' });
    expect(Math.abs(same.afterReset! - same.first)).toBeLessThanOrEqual(1); // unchanged rate, same payment within an agora
    const up = longCreditPayments(300_000, '15.5', 24, { atPayment: 19, rate: '16.5' });
    expect(up.afterReset!).toBeGreaterThan(up.first);
  });
  it('handles an interest-free plan, a reset on the first payment, and bad input', () => {
    const free = longCreditPayments(120_000, '0', 12, { atPayment: 7, rate: '12' });
    expect(free.first).toBe(10_000);
    expect(free.afterReset).toBe(spitzerPayment(60_000, '12', 6));
    // The balance is the exact share P*(months-k)/months = 5/8 -> 1, not P minus rounded-up payments.
    expect(longCreditPayments(5, '0', 8, { atPayment: 8, rate: '10' }).afterReset).toBe(1);
    const atOnce = longCreditPayments(300_000, '15.5', 24, { atPayment: 1, rate: '10' });
    expect(atOnce.afterReset).toBe(spitzerPayment(300_000, '10', 24));
    expect(() => longCreditPayments(1000, '10', 12, { atPayment: 0, rate: '10' })).toThrow(RangeError);
    expect(() => longCreditPayments(1000, '10', 12, { atPayment: 13, rate: '10' })).toThrow(RangeError);
  });
});
describe('longCreditPayments balance', () => {
  it('matches a month-by-month amortization in exact rationals', () => {
    const P = 300_000n;
    const i = { n: 155n, d: 12000n }; // 15.5% / 12
    const n = 24;
    // Exact level payment p = P·i / (1 − (1+i)^−n), as a fraction N/D.
    const g = i.d + i.n;
    const gn = g ** BigInt(n);
    const dn = i.d ** BigInt(n);
    const pN = P * i.n * gn;
    const pD = i.d * (gn - dn);
    // Walk 18 payments, B <- B(1+i) − p, keeping B exactly as num/(den·pD).
    let num = P * pD;
    let den = 1n;
    for (let m = 0; m < 18; m++) {
      num = num * g - pN * den * i.d;
      den = den * i.d;
    }
    const balance = Number((2n * num + den * pD) / (2n * den * pD));
    const out = longCreditPayments(300_000, '15.5', 24, { atPayment: 19, rate: '16.5' });
    expect(out.afterReset).toBe(spitzerPayment(balance, '16.5', 6));
  });
});
describe('annualEffectiveRate guards', () => {
  it('rejects a negative rate', () => {
    expect(() => annualEffectiveRate('-1', 12)).toThrow(RangeError);
  });
});

describe('withMonthOfInterest', () => {
  it('adds one month of interest at the annual rate, rounded once', () => {
    // ₪1,000 × (1 + 15.5% / 12) = ₪1,012.91666…
    expect(withMonthOfInterest(100_000, '15.5')).toBe(101_292);
    // ₪100 × (1 + 6% / 12) = ₪100.50 exactly.
    expect(withMonthOfInterest(10_000, '6')).toBe(10_050);
    expect(withMonthOfInterest(100_000, '0')).toBe(100_000);
  });

  it('rejects a negative rate', () => {
    expect(() => withMonthOfInterest(100, '-1')).toThrow(RangeError);
  });
});
