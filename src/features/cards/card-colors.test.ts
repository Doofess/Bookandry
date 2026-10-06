import { describe, expect, it } from 'vitest';

import { CARD_COLORS, cardGradient, issuerTint } from './card-colors';

describe('a card’s face', () => {
  it('is the colour it was given', () => {
    expect(cardGradient({ color: 'gold', card: { issuer: 'max' } })).toBe(
      CARD_COLORS.find((c) => c.key === 'gold')?.gradient,
    );
  });

  it('is its company’s tint when it was given none, or one this version does not know', () => {
    expect(cardGradient({ card: { issuer: 'max' } })).toBe(issuerTint('max'));
    expect(cardGradient({ color: '#ff0000', card: { issuer: 'cal' } })).toBe(issuerTint('cal'));
    expect(cardGradient({})).toBe(issuerTint('other'));
  });
});
