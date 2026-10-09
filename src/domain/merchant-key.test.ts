import { describe, expect, it } from 'vitest';

import { merchantKey } from './merchant-key';

describe('merchantKey', () => {
  it.each([
    // Branch numbers, card-terminal numbers and punctuation go; the city stays.
    ['שופרסל דיל 123 ת"א', 'שופרסל דיל 45 ת״א', 'שופרסל דיל ת א'],
    ['WOLT *ORDER 8812', 'Wolt order 1290', 'wolt order'],
    ['רמי לוי סניף 12 מודיעין', 'רמי לוי סניף 7 מודיעין', 'רמי לוי מודיעין'],
    ['אלקטרה בע"מ', 'אלקטרה בעמ', 'אלקטרה'],
    ['Acme Ltd.', 'ACME LTD', 'acme'],
    ['Globex Inc', 'GLOBEX, INC.', 'globex'],
  ])('merges "%s" and "%s" as "%s"', (a, b, key) => {
    expect(merchantKey(a)).toBe(key);
    expect(merchantKey(b)).toBe(key);
  });

  it.each([
    // Two different chains.
    ['סופר פארם', 'סופר יודה'],
    // The same chain in two cities: merging two businesses is worse than missing a match.
    ['שופרסל דיל 123 ת"א', 'שופרסל דיל 45'],
    ['PAYPAL *SPOTIFY', 'PAYPAL *NETFLIX'],
  ])('keeps "%s" and "%s" apart', (a, b) => {
    expect(merchantKey(a)).not.toBe(merchantKey(b));
  });

  it.each([
    // Review Focus 1: only a payment service or a transfer word is left, so there is no merchant to key.
    'PAYPAL *4029357733',
    'PAYPAL *4029357744',
    'העברה בביט 0501234567',
    'ביט 0527654321',
    'העברה ל-0541234567',
    'PayBox 3321',
    'פייבוקס',
    '',
    '   ',
    '12345',
    'סניף 12',
  ])('gives "%s" no key at all', (text) => {
    expect(merchantKey(text)).toBe('');
  });
});
