import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import { catalogProblems } from './check';
import { loadCatalog } from './index';
import type { Catalog, CatalogRate } from './types';

const src = { url: 'https://example.com/x', seen: '2026-10-01' as LocalDate };

function fixedRate(rate: string, note?: string): CatalogRate {
  return {
    basis: { kind: 'fixed', rate },
    quality: 'exact',
    compounding: 12,
    dayCount: '30/360',
    accrues: 'purchase',
    fixedAtPurchase: true,
    source: note ? { ...src, note } : { ...src },
  };
}

/** A small sound catalog; each broken case below changes one thing in a copy. */
function sound(): Catalog {
  return {
    version: 1,
    issuers: [
      {
        id: 'cal',
        name: { he: 'כאל', en: 'Cal' },
        tiers: [
          { id: 'gold', name: { he: 'זהב', en: 'Gold' }, issued: true },
          { id: 'old', name: { he: 'ישן', en: 'Old' }, issued: false },
        ],
        clubs: [
          { id: 'a', name: 'A', issued: true },
          { id: 'b', name: 'B', issued: false, movedTo: 'a' },
        ],
        billingDays: [2],
        foreignPosting: 'immediate',
        cardFees: [{ tier: 'gold', monthlyMinor: 1500, waivers: [] }],
        deals: [
          {
            kind: 'credit',
            label: { he: 'קרדיט', en: 'Credit' },
            abroad: false,
            rate: fixedRate('12', 'published nominal: 12; published effective: 12.68'),
            source: { ...src },
          },
        ],
      },
    ],
    banks: [
      {
        id: 'b1',
        name: { he: 'בנק', en: 'Bank' },
        issuers: ['cal'],
        rates: [{ issuer: 'cal', tier: 'gold', deal: 'credit', rate: fixedRate('10') }],
        dealOverrides: [{ issuer: 'cal', deal: { kind: 'credit', source: { ...src } } }],
      },
    ],
  };
}

function broken(change: (c: Catalog) => void): string[] {
  const c = sound();
  change(c);
  return catalogProblems(c);
}

describe('the data checks catch what they are for', () => {
  it('pass a sound catalog', () => {
    expect(catalogProblems(sound())).toEqual([]);
  });

  it('flags an http source', () => {
    const p = broken((c) => (c.issuers[0]!.deals[0]!.source = { ...src, url: 'http://x.com' }));
    expect(p.join()).toContain('not https');
  });

  it('flags a bad seen date', () => {
    const p = broken((c) => {
      c.banks[0]!.rates![0]!.rate.source.seen = '2026-02-30' as LocalDate;
    });
    expect(p.join()).toContain('not a valid date');
  });

  it('flags a rates row naming an unknown card company, tier or deal', () => {
    const row = (c: Catalog) => c.banks[0]!.rates![0]!;
    expect(broken((c) => (row(c).tier = 'nope')).join()).toContain('unknown tier');
    expect(broken((c) => (row(c).deal = 'deferred')).join()).toContain('unknown deal');
    expect(broken((c) => (row(c).issuer = 'amex')).join()).toContain('unknown card company');
  });

  it('flags a bank naming an unknown card company', () => {
    expect(broken((c) => c.banks[0]!.issuers.push('max')).join()).toContain('unknown card company max');
  });

  it('flags a pair that is off by 0.02, and accepts one off by 0.01', () => {
    const note = (c: Catalog, text: string) => {
      c.issuers[0]!.deals[0]!.rate!.source.note = text;
    };
    expect(
      broken((c) => {
        note(c, 'published nominal: 12; published effective: 12.70');
      }).join(),
    ).toContain('effective 12.68 vs published 12.70');
    expect(
      broken((c) => {
        note(c, 'published nominal: 12; published effective: 12.69');
      }),
    ).toEqual([]);
  });

  it('flags a note that is nearly, but not exactly, the agreed format', () => {
    for (const bad of [
      'published nominal: 12%; published effective: 12.68',
      'published nominal:12; published effective: 12.68',
      'published nominal: 12; published effective: 12.68 (Cal site)',
      'published effective: 12.68',
    ]) {
      const p = broken((c) => {
        c.issuers[0]!.deals[0]!.rate!.source.note = bad;
      });
      expect(p.join(), bad).toContain('malformed published-pair note');
    }
  });

  it('ignores an ordinary note', () => {
    expect(
      broken((c) => {
        c.issuers[0]!.deals[0]!.rate!.source.note = 'from the fee table';
      }),
    ).toEqual([]);
  });

  it('flags a pair on a rate with no basis', () => {
    const p = broken((c) => {
      c.issuers[0]!.deals[0]!.rate!.basis = null;
    });
    expect(p.join()).toContain('no basis');
  });

  it('flags a note nominal that differs from a fixed rate', () => {
    const p = broken((c) => {
      c.issuers[0]!.deals[0]!.rate!.basis = { kind: 'fixed', rate: '11' };
    });
    expect(p.join()).toContain('differs from fixed rate');
  });

  it('flags a dangling or retired movedTo', () => {
    expect(broken((c) => (c.issuers[0]!.clubs[1]!.movedTo = 'zzz')).join()).toContain('unknown club');
    expect(
      broken((c) => {
        c.issuers[0]!.clubs[0]!.issued = false;
      }).join(),
    ).toContain('which is not issued');
  });

  it('flags duplicate ids', () => {
    expect(broken((c) => (c.issuers = [...c.issuers, structuredClone(c.issuers[0]!)])).join()).toContain(
      'duplicate issuer cal',
    );
    expect(broken((c) => (c.banks = [...c.banks, structuredClone(c.banks[0]!)])).join()).toContain(
      'duplicate bank b1',
    );
    expect(
      broken((c) => c.issuers[0]!.tiers.push(structuredClone(c.issuers[0]!.tiers[0]!))).join(),
    ).toContain('duplicate tier gold');
    expect(
      broken((c) => c.issuers[0]!.deals.push(structuredClone(c.issuers[0]!.deals[0]!))).join(),
    ).toContain('duplicate deal credit');
  });

  it('flags rows and overrides for a card company the bank does not distribute', () => {
    const p = broken((c) => {
      c.banks[0]!.issuers = [];
    });
    expect(p.filter((x) => x.includes('does not distribute'))).toHaveLength(2);
  });

  it('flags a card fee for an unknown tier', () => {
    const p = broken((c) => (c.issuers[0]!.cardFees![0]!.tier = 'nope'));
    expect(p.join()).toContain('card fee for unknown tier');
  });

  it('flags an override whose own source is not sound', () => {
    const p = broken((c) => {
      c.banks[0]!.dealOverrides![0]!.deal.source = { url: 'ftp://x', seen: 'soon' as LocalDate };
    });
    expect(p.filter((x) => x.includes('override'))).toHaveLength(2);
  });

  it('flags a late rate given twice', () => {
    const p = broken((c) => {
      c.banks[0]!.lateRate = fixedRate('9');
      c.banks[0]!.extraRates = { late: fixedRate('9') };
    });
    expect(p.join()).toContain('late rate given twice');
  });
});

describe('the real card catalog', () => {
  it('loads once and returns the same catalog', async () => {
    expect(await loadCatalog()).toBe(await loadCatalog());
  });

  it('has no problems', async () => {
    expect(catalogProblems(await loadCatalog())).toEqual([]);
  });
});
