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
        fxFee: { cal: '3' },
        fxFeeTiers: [{ issuer: 'cal', tier: 'gold', fee: '2', source: { ...src } }],
        billingDays: [2, 10],
        foreignPosting: 'immediate',
        sources: {
          issuers: { ...src },
          billingDays: { ...src },
          foreignPosting: { ...src },
          fxFee: { cal: { ...src } },
        },
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

  it('flags an unsound source on a card company’s own figures', () => {
    const bad = { url: 'http://x.com', seen: '2026-13-01' as LocalDate };
    const p = broken((c) => {
      const i = c.issuers[0]!;
      i.sources = { billingDays: bad };
      i.tiers[0]!.source = bad;
      i.clubs[0]!.source = bad;
      i.cardFees![0]!.source = bad;
    });
    for (const where of ['cal.sources.billingDays', 'cal.tier.gold', 'cal.club.a', 'cal.fee.gold'])
      expect(
        p.filter((x) => x.startsWith(`${where}:`)),
        where,
      ).toHaveLength(2);
  });

  it('flags a tier, club or card company FX fee that is not a decimal', () => {
    const p = broken((c) => {
      const i = c.issuers[0]!;
      i.fxFee = '3%';
      i.tiers[0]!.fxFee = '2,5';
      i.clubs[0]!.fxFee = '';
    });
    expect(p.filter((x) => x.includes('FX fee is not a decimal'))).toHaveLength(3);
  });

  it('flags waivers out of spend order, or a reduced fee not below the fee', () => {
    const fee = (c: Catalog) => c.issuers[0]!.cardFees![0]!;
    expect(
      broken((c) => {
        fee(c).waivers = [
          { spendMinor: 750_000, feeMinor: 0 },
          { spendMinor: 500_000, feeMinor: 990 },
        ];
      }).join(),
    ).toContain('waivers not in ascending spend');
    expect(
      broken((c) => {
        fee(c).waivers = [{ spendMinor: 500_000, feeMinor: 1500 }];
      }).join(),
    ).toContain('waiver fee not below the fee');
    expect(
      broken((c) => {
        fee(c).waivers = [
          { spendMinor: 500_000, feeMinor: 990 },
          { spendMinor: 750_000, feeMinor: 0 },
        ];
      }),
    ).toEqual([]);
  });

  it('flags a higher minimum payment outside the payment range, or not higher', () => {
    const deal = (c: Catalog) => c.issuers[0]!.deals[0]!;
    const set = (c: Catalog, from: number, minimum: number) => {
      Object.assign(deal(c), {
        payments: { min: 3, max: 36 },
        minPaymentMinor: 2_500,
        minPaymentFrom: { payments: from, minPaymentMinor: minimum },
      });
    };
    expect(
      broken((c) => {
        set(c, 40, 5_000);
      }).join(),
    ).toContain('minPaymentFrom outside the payment range');
    expect(
      broken((c) => {
        set(c, 19, 2_500);
      }).join(),
    ).toContain('minPaymentFrom not above the minimum payment');
    expect(
      broken((c) => {
        set(c, 19, 5_000);
        delete deal(c).payments;
      }).join(),
    ).toContain('minPaymentFrom outside the payment range');
    expect(
      broken((c) => {
        set(c, 19, 5_000);
      }),
    ).toEqual([]);
  });

  it('flags a bank rates row naming an unknown club, or naming neither tier nor club', () => {
    const row = (c: Catalog) => c.banks[0]!.rates![0]!;
    expect(
      broken((c) => {
        row(c).club = 'nope';
      }).join(),
    ).toContain('unknown club');
    expect(
      broken((c) => {
        delete row(c).tier;
      }).join(),
    ).toContain('names neither a tier nor a club');
    expect(
      broken((c) => {
        delete row(c).tier;
        row(c).club = 'a';
      }),
    ).toEqual([]);
  });

  it('flags a bank FX fee that is not a decimal, or a card-type fee the bank cannot apply', () => {
    expect(broken((c) => (c.banks[0]!.fxFee = { cal: '3%' })).join()).toContain('FX fee is not a decimal');
    const tier = (c: Catalog) => c.banks[0]!.fxFeeTiers![0]!;
    expect(broken((c) => (tier(c).fee = 'two')).join()).toContain('FX fee is not a decimal');
    expect(broken((c) => (tier(c).tier = 'nope')).join()).toContain('FX fee for unknown tier');
    expect(broken((c) => (tier(c).issuer = 'max')).join()).toContain('FX fee for undistributed max');
  });

  it('flags a bank figure with no source, and an unsound bank source', () => {
    const p = broken((c) => {
      c.banks[0]!.sources = {};
    });
    for (const k of ['issuers', 'billingDays', 'foreignPosting', 'fxFee.cal'])
      expect(p.join(), k).toContain(`b1.sources.${k}: no source`);
    const bad = { url: 'http://x.com', seen: '2026-13-01' as LocalDate };
    const q = broken((c) => {
      const b = c.banks[0]!;
      b.sources = { issuers: bad, billingDays: bad, foreignPosting: bad, fxFee: { cal: bad } };
      b.fxFeeTiers![0]!.source = bad;
    });
    expect(q.filter((x) => x.includes('not https'))).toHaveLength(5);
    expect(q.filter((x) => x.includes('not a valid date'))).toHaveLength(5);
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

describe('the card companies, as the research gives them', () => {
  const issuer = async (id: string) => (await loadCatalog()).issuers.find((i) => i.id === id)!;

  it('has all five card companies', async () => {
    expect((await loadCatalog()).issuers.map((i) => i.id)).toEqual([
      'isracard',
      'amex',
      'cal',
      'diners',
      'max',
    ]);
  });

  it('has Max קרדיט פלוס as the research gives it', async () => {
    const max = await issuer('max');
    const long = max.deals.find((d) => d.kind === 'long_credit')!;
    expect(long).toMatchObject({
      label: { he: 'קרדיט פלוס' },
      payments: { min: 19, max: 36 },
      minDealMinor: 95_000,
      minPaymentMinor: 5_000,
      abroad: false,
    });
    expect(long.rate?.reset).toEqual({ atPayment: 19, rule: 'prime_delta' });
  });

  it('has Isracard late interest compounding quarterly on the Bank of Israel rate', async () => {
    const isr = await issuer('isracard');
    expect(isr.extraRates?.late).toMatchObject({
      basis: { kind: 'boi', margin: '16.40' },
      compounding: 4,
      dayCount: 'actual/365',
    });
  });

  it('no longer offers FlyCard under Cal', async () => {
    const cal = await issuer('cal');
    expect(cal.clubs.find((c) => /fly ?card/i.test(c.name))?.issued ?? false).toBe(false);
  });

  it('offers FlyCard and Hever under Isracard', async () => {
    const isr = await issuer('isracard');
    expect(isr.clubs.find((c) => c.id === 'flycard')).toMatchObject({ issued: true, fxFee: '2.5' });
    expect(isr.clubs.find((c) => c.id === 'hever')).toMatchObject({
      issued: true,
      monthlyMinor: 0,
      fxFee: '1',
    });
  });

  it('has each card company’s billing days, posting and FX fee', async () => {
    expect(await issuer('isracard')).toMatchObject({
      billingDays: [2, 10, 15, 20],
      foreignPosting: 'immediate',
      fxFee: '2.9',
    });
    expect((await issuer('isracard')).sources?.billingDays?.note).toMatch(/undated/i);
    expect(await issuer('amex')).toMatchObject({ fxFee: '2.5' });
    expect(await issuer('cal')).toMatchObject({
      billingDays: [2, 10, 15],
      foreignPosting: 'immediate',
      fxFee: '3',
    });
    expect(await issuer('diners')).toMatchObject({
      billingDays: [2, 10, 15],
      foreignPosting: 'billing_date',
    });
    expect(await issuer('max')).toMatchObject({
      billingDays: [2, 10, 15],
      foreignPosting: 'immediate',
      fxFee: '3',
    });
  });

  it('has Max’s per-tier FX fees', async () => {
    const max = await issuer('max');
    expect(max.tiers.find((t) => t.id === 'first')?.fxFee).toBe('2');
    expect(max.tiers.find((t) => t.id === 'world_elite')?.fxFee).toBe('1.5');
    expect(max.clubs.find((c) => c.id === 'skymax')?.fxFee).toBe('2.8');
    expect(max.clubs.find((c) => c.id === 'skymax_premium')?.fxFee).toBe('1.9');
  });

  it('has the card fees with their spend waivers as published', async () => {
    const fee = async (id: string, tier: string) => (await issuer(id)).cardFees?.find((f) => f.tier === tier);
    expect(await fee('isracard', 'international')).toMatchObject({
      monthlyMinor: 1790,
      waivers: [
        { spendMinor: 500_000, feeMinor: 1530 },
        { spendMinor: 750_000, feeMinor: 0 },
      ],
    });
    expect(await fee('max', 'classic')).toMatchObject({
      monthlyMinor: 1290,
      waivers: [
        { spendMinor: 175_000, feeMinor: 790 },
        { spendMinor: 500_000, feeMinor: 0 },
      ],
    });
    expect(await fee('cal', 'platinum')).toMatchObject({
      monthlyMinor: 1790,
      waivers: [
        { spendMinor: 750_000, feeMinor: 1590 },
        { spendMinor: 1_200_000, feeMinor: 0 },
      ],
    });
  });

  it('has קרדיט 3–18 at ₪75 / ₪25, Spitzer at 30/360, accruing as each company says', async () => {
    const accrues = { isracard: 'billing_date', amex: 'billing_date', cal: 'merchant_paid', max: 'purchase' };
    for (const [id, from] of Object.entries(accrues)) {
      const credit = (await issuer(id)).deals.find((d) => d.kind === 'credit')!;
      expect(credit, id).toMatchObject({
        payments: { min: 3, max: 18 },
        minDealMinor: 7_500,
        minPaymentMinor: 2_500,
      });
      expect(credit.rate, id).toMatchObject({
        basis: null,
        compounding: 12,
        dayCount: '30/360',
        accrues: from,
      });
    }
    expect((await issuer('isracard')).deals.find((d) => d.kind === 'credit')?.label.he).toBe(
      'קרדיט בתשלומים קבועים',
    );
  });

  it('has Amex long credit up to 36 at ₪50 a payment, fixed', async () => {
    const long = (await issuer('amex')).deals.find((d) => d.kind === 'long_credit')!;
    expect(long).toMatchObject({ payments: { min: 20, max: 36 }, minPaymentMinor: 5_000 });
    expect(long.rate).toMatchObject({ fixedAtPurchase: true });
    expect(long.rate?.reset).toBeUndefined();
  });

  it('has Cal 30+ compounding quarterly and floating with prime', async () => {
    const d = (await issuer('cal')).deals.find((x) => x.kind === 'deferred')!;
    expect(d.rate).toMatchObject({
      basis: null,
      compounding: 4,
      fixedAtPurchase: false,
      accrues: 'billing_date',
    });
  });

  it('has Max חלוקת עסקה with its two payment minimums', async () => {
    const d = (await issuer('max')).deals.find((x) => x.kind === 'split_purchase')!;
    expect(d).toMatchObject({
      label: { he: 'חלוקת עסקה' },
      payments: { min: 3, max: 36 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      minPaymentFrom: { payments: 19, minPaymentMinor: 5_000 },
      abroad: false,
    });
  });

  it('accrues an after-the-fact split from the day it is asked for', async () => {
    for (const id of ['isracard', 'amex', 'max']) {
      const split = (await issuer(id)).deals.find((d) => d.kind === 'split_purchase');
      expect(split?.rate?.accrues, id).toBe('request');
    }
    expect((await issuer('amex')).deals.find((d) => d.kind === 'split_purchase')).toMatchObject({
      label: { he: 'העברה לקרדיט' },
      rate: { basis: null, quality: 'typical' },
    });
  });

  it('marks the qualities the research leaves open', async () => {
    const isr = await issuer('isracard');
    expect(isr.extraRates?.late?.quality).toBe('typical');
    expect(isr.extraRates?.over_limit).toMatchObject({ basis: null, quality: 'max' });
    expect((await issuer('max')).deals.find((d) => d.kind === 'deferred')?.rate?.quality).toBe('typical');
  });

  it('cites Cal’s fee schedule for legacy FlyCard, and records Diners FlyCard Premium’s ₪4 off', async () => {
    expect((await issuer('cal')).clubs.find((c) => c.id === 'flycard')?.source?.url).toBe(
      'https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf',
    );
    expect((await issuer('diners')).clubs.find((c) => c.id === 'flycard_premium')?.monthlyMinor).toBe(3490);
  });

  it('gives every issuer-level figure a source', async () => {
    for (const i of (await loadCatalog()).issuers) {
      for (const k of ['tiers', 'clubs', 'billingDays', 'foreignPosting', 'fxFee'] as const)
        expect(i.sources?.[k], `${i.id}.${k}`).toBeDefined();
      for (const f of i.cardFees ?? []) expect(f.source, `${i.id}.fee.${f.tier}`).toBeDefined();
      for (const t of i.tiers)
        if (t.fxFee !== undefined || t.foreignPosting !== undefined)
          expect(t.source, `${i.id}.tier.${t.id}`).toBeDefined();
      for (const c of i.clubs)
        if (c.fxFee !== undefined || c.monthlyMinor !== undefined || c.foreignPosting !== undefined)
          expect(c.source, `${i.id}.club.${c.id}`).toBeDefined();
    }
  });
});
