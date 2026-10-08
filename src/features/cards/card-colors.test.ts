import { describe, expect, it } from 'vitest';

import { CARD_COLORS, cardColorValue, cardGradient, issuerTint } from './card-colors';

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

describe('a colour as one value', () => {
  it('is the light end of its gradient, for an edge or a dot', () => {
    expect(cardColorValue('red')).toBe('#b8323f');
    expect(cardColorValue('black')).toBe('#3d3d3d');
  });

  it('is nothing for no colour, or one this version does not know', () => {
    expect(cardColorValue(undefined)).toBeUndefined();
    expect(cardColorValue('#ff0000')).toBeUndefined();
  });
});
