import { describe, expect, it } from 'vitest';

import { ordinalDay } from './ordinal';

describe('ordinalDay', () => {
  it('says the English ordinal, and the plain number in Hebrew', () => {
    expect([1, 2, 3, 10, 11, 12, 13, 15, 21, 22, 23, 31].map((day) => ordinalDay(day, 'en'))).toEqual([
      '1st',
      '2nd',
      '3rd',
      '10th',
      '11th',
      '12th',
      '13th',
      '15th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
    expect(ordinalDay(10, 'he')).toBe('10');
  });
});
