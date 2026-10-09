import { describe, expect, it } from 'vitest';

import { isMcc } from './mcc';
import { SECTORS, sectorMcc } from './sector-mcc';

describe('sectorMcc', () => {
  it.each(SECTORS.map(([sector, code]) => [sector, code]))('maps "%s" to %s', (sector, code) => {
    expect(isMcc(code)).toBe(true);
    expect(sectorMcc(sector)).toBe(code);
  });

  it('lists each sector once', () => {
    const keys = SECTORS.map(([sector]) => sector.trim().toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reads the sector as printed: case, spacing, commas and niqqud do not matter', () => {
    expect(sectorMcc('מסעדות')).toBe('5812');
    expect(sectorMcc('  מסעדות,  קפה   וברים ')).toBe('5812');
    expect(sectorMcc('סופרמרקטים')).toBe('5411');
    expect(sectorMcc('דלק')).toBe('5541');
    expect(sectorMcc('RESTAURANTS')).toBe('5812');
  });

  it('knows nothing of a sector it does not list, which then goes to Claude as a hint', () => {
    expect(sectorMcc('שונות')).toBeUndefined();
    expect(sectorMcc('')).toBeUndefined();
  });
});
