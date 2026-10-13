import { describe, expect, it } from 'vitest';

import { avatarTone, PROFILE_PALETTE } from './palette';

describe('avatarTone', () => {
  it('draws the first person on the ink box and the second on sapphire, as the concept does', () => {
    expect(avatarTone(PROFILE_PALETTE[0].hex)).toBe('ink');
    expect(avatarTone(PROFILE_PALETTE[1].hex)).toBe('sapphire');
    expect(avatarTone(PROFILE_PALETTE[2].hex)).toBe('ring');
    expect(avatarTone(PROFILE_PALETTE[3].hex)).toBe('ink');
  });
  it('gives a colour from outside the palette a stable tone', () => {
    expect(avatarTone('#123456')).toBe(avatarTone('#123456'));
    expect(['ink', 'sapphire', 'ring']).toContain(avatarTone('#123456'));
  });
});
