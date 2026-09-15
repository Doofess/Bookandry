import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CURRENCY_EXPONENTS, exponentOf } from './currency-meta';
import {
  add,
  AmountOverflowError,
  convertMinor,
  crossRate,
  decimalToRational,
  divRound,
  InvalidDecimalError,
  multiplyRates,
  normalizeAmountInput,
  sum,
  toDecimalString,
  toMinor,
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
    expect(toMinor('‏1,234.56 ₪', 'ILS')).toBe(123456);
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
