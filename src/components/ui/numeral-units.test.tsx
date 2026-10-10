import { describe, expect, it } from 'vitest';

import { KARANTINA_ADVANCE, numeralUnits } from './numeral-units';

describe('numeralUnits', () => {
  it("measures the concept's balance exactly: ₪58,555 is 2.096em", () => {
    expect(numeralUnits({ sign: '', symbol: '₪', digits: '58,555' })).toBe(2096);
  });

  it('counts the minus, and the symbol at half size with its 0.04em', () => {
    expect(numeralUnits({ sign: '−', symbol: '₪', digits: '244' })).toBe(280 + 326 + 40 + 307 + 383 + 383);
  });

  it('adds nothing for a figure without a symbol', () => {
    expect(numeralUnits({ sign: '', symbol: '', digits: '10' })).toBe(243 + 350);
  });

  it('takes the widest digit for a glyph it does not know, so it never overflows', () => {
    expect(numeralUnits({ sign: '', symbol: '', digits: '?' })).toBe(KARANTINA_ADVANCE['4']);
  });

  it('ignores the direction marks a Hebrew format adds', () => {
    expect(numeralUnits({ sign: '', symbol: '', digits: '‏1‎' })).toBe(243);
  });
});
