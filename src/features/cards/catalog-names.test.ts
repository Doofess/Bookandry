import { describe, expect, it } from 'vitest';

import { loadCatalog } from '@/data/card-catalog';
import { resolveCard } from '@/data/card-catalog/resolve';

import { tierName } from './catalog-names';

describe('a linked card’s type, as the viewer reads it', () => {
  const link = { issuer: 'max', bank: '20', tier: 'international', version: 1 };
  // Linked by someone reading English: the stored text is English.
  const card = { tier: 'International', catalog: link };

  it('comes from the catalog in the viewer’s language, not the linker’s', async () => {
    const resolved = resolveCard(await loadCatalog(), link);
    const he = tierName(card, resolved, 'he');
    expect(he).toBe(resolved?.issuer.tiers.find((t) => t.id === 'international')?.name.he);
    expect(he).not.toBe('International');
    expect(tierName(card, resolved, 'en')).toBe(
      resolved?.issuer.tiers.find((t) => t.id === 'international')?.name.en,
    );
  });

  it('falls back to the stored text while the catalog has not loaded, or for a card not linked', () => {
    expect(tierName(card, undefined, 'he')).toBe('International');
    expect(tierName({ tier: 'Gold' }, undefined, 'he')).toBe('Gold');
  });
});
