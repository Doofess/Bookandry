import { describe, expect, it } from 'vitest';

import { coverSquare } from '@/features/account/avatar-image';

import { initialsOf } from './account-avatar';

describe('initials, for an account without a picture', () => {
  it('takes the first and last names', () => {
    expect(initialsOf('Dana Levi', 'dana@example.com')).toBe('DL');
    expect(initialsOf('Dana Ruth Levi', undefined)).toBe('DL');
  });

  it('takes one letter from one name', () => {
    expect(initialsOf('Dana', undefined)).toBe('D');
  });

  it('reads Hebrew names as written', () => {
    expect(initialsOf('דנה לוי', undefined)).toBe('דל');
  });

  it('falls back to the email', () => {
    expect(initialsOf(undefined, 'noa@example.com')).toBe('N');
    expect(initialsOf('   ', 'noa@example.com')).toBe('N');
  });

  it('is empty without either', () => {
    expect(initialsOf(undefined, undefined)).toBe('');
  });
});

describe('the square a picture is cut to', () => {
  it('is the largest centred one', () => {
    expect(coverSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(coverSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(coverSquare(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });
});
