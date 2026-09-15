import { describe, expect, it } from 'vitest';

import { toDecimalString } from '@/lib/money';

import { currencyName, formatMoney, formatRateSentence, MINUS_SIGN, signedMinor } from './money-format';

/**
 * Note what is and is not asserted here.
 *
 * Literal `Intl` output is compared ONLY where this suite computes the
 * expectation with `Intl` itself, or where the property is structural (no bidi
 * marks, a leading U+2212). Pinning "$1,234.50" as a string would fail the next
 * time ICU changes a space to an NNBSP, which it has done before.
 */
const BIDI = /[‎‏؜‪-‮⁦-⁩]/;

describe('formatMoney', () => {
  it('formats a positive amount with no sign', () => {
    const money = formatMoney(123_450, 'USD', { locale: 'en' });
    expect(money.sign).toBe('');
    expect(money.magnitude).toContain('1,234.50');
    expect(money.text).toBe(money.magnitude);
  });

  it('uses a real minus sign, not a hyphen', () => {
    const money = formatMoney(-123_450, 'USD', { locale: 'en' });
    expect(money.sign).toBe(MINUS_SIGN);
    expect(money.text.startsWith(MINUS_SIGN)).toBe(true);
    expect(money.text).not.toContain('-');
  });

  it('shows a plus only when asked, and never on zero', () => {
    expect(formatMoney(100, 'USD', { locale: 'en', signMode: 'always' }).sign).toBe('+');
    expect(formatMoney(0, 'USD', { locale: 'en', signMode: 'always' }).sign).toBe('');
    expect(formatMoney(-100, 'USD', { locale: 'en', signMode: 'never' }).sign).toBe('');
  });

  it('treats negative zero as zero, not as a negative', () => {
    // Object.is(-0, 0) is false, so a naive `minor < 0` test is not enough on
    // its own - and a balance rendered as "−$0.00" looks like a bug.
    expect(formatMoney(-0, 'USD', { locale: 'en' }).sign).toBe('');
  });

  it('strips every bidi mark CLDR injects into Hebrew', () => {
    const raw = new Intl.NumberFormat('he', { style: 'currency', currency: 'ILS' }).format(1234.5);
    // The raw string really does carry them; this test is only meaningful
    // because of that.
    expect(BIDI.test(raw)).toBe(true);

    const money = formatMoney(123_450, 'ILS', { locale: 'he' });
    expect(BIDI.test(money.magnitude)).toBe(false);
    expect(money.magnitude).toContain('1,234.50');
  });

  it('honours the frozen exponent, not the ICU minor units', () => {
    // JPY has none, KWD has three. The stored integer means nothing without it.
    expect(formatMoney(1234, 'JPY', { locale: 'en' }).magnitude).toContain('1,234');
    expect(formatMoney(1234, 'JPY', { locale: 'en' }).magnitude).not.toContain('.');
    expect(formatMoney(1_234_500, 'KWD', { locale: 'en' }).magnitude).toContain('1,234.500');
  });

  it('keeps every digit near the safe-integer ceiling', () => {
    // The reason the value reaches Intl as a STRING. Passing
    // Number("90071992547409.91") would silently drop the last digits.
    const minor = 9_007_199_254_740_991;
    const decimal = toDecimalString(minor, 'USD');
    const digits = formatMoney(minor, 'USD', { locale: 'en' }).magnitude.replace(/[^\d]/g, '');
    expect(digits).toBe(decimal.replace(/[^\d]/g, ''));
  });

  it('names the currency for screen readers', () => {
    // "1,234.50 US dollars" reads better than "$1,234.50", and Hebrew gets the
    // localised name for free.
    expect(formatMoney(123_450, 'USD', { locale: 'en' }).aria).toContain('dollars');
    expect(formatMoney(123_450, 'ILS', { locale: 'he' }).aria).toContain('שקלים');
    expect(formatMoney(-123_450, 'USD', { locale: 'en' }).aria.startsWith(MINUS_SIGN)).toBe(true);
  });

  it('agrees with Intl on the digits, computed rather than pinned', () => {
    const expected = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: 'USD',
      signDisplay: 'never',
    }).format(1234.5);
    expect(formatMoney(123_450, 'USD', { locale: 'en' }).magnitude).toBe(expected);
  });
});

describe('signedMinor', () => {
  it('takes the sign from the kind, never from the number', () => {
    expect(signedMinor('income', 500)).toBe(500);
    expect(signedMinor('expense', 500)).toBe(-500);
  });
});

describe('formatRateSentence', () => {
  it('keeps both units, because a bare rate is ambiguous', () => {
    const sentence = formatRateSentence('EUR', 'ILS', '3.9644', 'en');
    expect(sentence).toEqual({ from: 'EUR', to: 'ILS', rate: '3.9644' });
  });

  it('does not group the digits of a rate', () => {
    expect(formatRateSentence('JPY', 'ILS', '1234.5', 'en').rate).toBe('1234.5');
  });

  it('keeps an integer rate integral', () => {
    expect(formatRateSentence('USD', 'USD', '1', 'en').rate).toBe('1');
  });

  it('caps the displayed precision', () => {
    expect(formatRateSentence('A', 'B', '1.123456789012', 'en').rate).toBe('1.12345679');
  });
});

describe('currencyName', () => {
  it('localises the name', () => {
    expect(currencyName('USD', 'en')).toMatch(/dollar/i);
    expect(currencyName('ILS', 'he')).toMatch(/שקל/);
  });

  it('falls back to the code for anything ICU does not know', () => {
    expect(currencyName('ZZZ', 'en')).toBe('ZZZ');
  });
});
