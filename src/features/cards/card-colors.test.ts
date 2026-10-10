import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CARD_COLORS } from './card-colors';

describe('the colours a card can be given', () => {
  it('keeps the stored keys, in the order the picker shows them', () => {
    // Data stores these keys: renaming one would lose every card that has it.
    expect(CARD_COLORS.map((color) => color.key)).toEqual([
      'black',
      'silver',
      'blue',
      'teal',
      'green',
      'gold',
      'orange',
      'red',
      'rose',
      'purple',
    ]);
  });

  it('is a solid money sheet each, not a gradient', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
    for (const { key } of CARD_COLORS) expect(css).toContain(`--money-card-${key}:`);
  });
});
