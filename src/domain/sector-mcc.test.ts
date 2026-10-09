import { describe, expect, it } from 'vitest';

import { isMcc } from './mcc';
import { HINT_SECTORS, SECTORS, sectorMcc } from './sector-mcc';

describe('sectorMcc', () => {
  it.each(SECTORS.map(([sector, code]) => [sector, code]))('maps "%s" to %s', (sector, code) => {
    expect(isMcc(code)).toBe(true);
    expect(sectorMcc(sector)).toBe(code);
  });

  it('lists each sector once, as a mapping or as a hint, never both', () => {
    const keys = [...SECTORS.map(([sector]) => sector), ...HINT_SECTORS].map((s) => s.trim().toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(HINT_SECTORS)(
    'gives nothing for the broad sector "%s", which goes to Claude as a hint (final review C2)',
    (sector) => {
      expect(sectorMcc(sector)).toBeUndefined();
    },
  );

  it('keeps the specific sectors a Max export prints, next to the broad ones it drops', () => {
    expect(sectorMcc('מסעדות, קפה וברים')).toBe('5812');
    expect(sectorMcc('שירותי תקשורת')).toBe('4814');
    expect(sectorMcc('חשמל ומחשבים')).toBe('5732');
    expect(sectorMcc('מזון וצריכה')).toBeUndefined();
    expect(sectorMcc('תחבורה ורכבים')).toBeUndefined();
    expect(sectorMcc('דלק, חשמל וגז')).toBeUndefined();
    expect(sectorMcc('פנאי, בידור וספורט')).toBeUndefined();
    expect(sectorMcc('עירייה וממשלה')).toBeUndefined();
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
