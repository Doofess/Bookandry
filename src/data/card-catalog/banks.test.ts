import { describe, expect, it } from 'vitest';

import { addRates, annualEffectiveRate } from '@/lib/money';

import { loadCatalog } from './index';
import { rateToday, resolveCard, type ResolvedCard } from './resolve';
import type { IssuerId } from './types';

const bank = async (id: string) => (await loadCatalog()).banks.find((b) => b.id === id)!;
const deal = (r: ResolvedCard | undefined, kind: string) => r?.deals.find((d) => d.kind === kind);
const PAIR = /^published nominal: (\d+(?:\.\d+)?); published effective: (\d+(?:\.\d+)?)$/;

describe('the banks, as the research gives them', () => {
  it('resolves Max through Mizrahi, International, to Mizrahi’s published rates', async () => {
    const r = resolveCard(await loadCatalog(), { issuer: 'max', bank: '20', tier: 'international' })!;
    const credit = r.deals.find((d) => d.kind === 'credit')!;
    expect(credit.from).toBe('bank_table');
    expect(rateToday(credit.rate!, '4.75', '3.25')).toBe('15.5');
  });

  it('leaves Leumi’s rates unpublished, never invented', async () => {
    const r = resolveCard(await loadCatalog(), { issuer: 'max', bank: '10', tier: 'classic' })!;
    expect(r.deals.find((d) => d.kind === 'credit')!.rate?.basis).toBeNull();
  });

  it('has every bank by its Masav code, with the card companies it distributes', async () => {
    const issuers = Object.fromEntries((await loadCatalog()).banks.map((b) => [b.id, [...b.issuers].sort()]));
    const fibi = ['amex', 'cal', 'diners', 'isracard', 'max'];
    expect(issuers).toEqual({
      '10': ['cal', 'diners', 'isracard', 'max'],
      '12': ['amex', 'cal', 'diners', 'isracard', 'max'],
      '20': ['amex', 'cal', 'diners', 'isracard', 'max'],
      '11': ['cal', 'diners', 'max'],
      '17': ['cal', 'diners'],
      '31': fibi,
      '52': fibi,
      '14': fibi,
      '26': fibi,
      '46': ['amex', 'isracard', 'max'],
      '4': ['amex', 'cal', 'diners', 'isracard'],
      '18': ['isracard'],
    });
  });

  it('shares one FIBI table across FIBI, PAGI, Otsar HaHayal and U-Bank', async () => {
    const fibi = await bank('31');
    expect(fibi.rates?.length).toBeGreaterThan(0);
    for (const id of ['52', '14', '26']) expect((await bank(id)).rates, id).toBe(fibi.rates);
  });

  it('publishes no rates at Leumi, Hapoalim, Discount, Mercantile, Yahav or One Zero', async () => {
    for (const id of ['10', '12', '11', '17', '4', '18']) expect((await bank(id)).rates, id).toBeUndefined();
  });

  it('gives each Mizrahi and FIBI row a margin that is its published nominal on prime 4.75', async () => {
    for (const id of ['20', '31']) {
      const rows = (await bank(id)).rates ?? [];
      expect(rows.length, id).toBeGreaterThan(0);
      for (const row of rows) {
        const where = `${id}.${row.issuer}.${row.tier ?? ''}.${row.club ?? ''}.${row.deal}`;
        const pair = PAIR.exec(row.rate.source.note ?? '');
        expect(pair, where).not.toBeNull();
        expect(row.rate.basis?.kind, where).toBe('prime');
        expect(rateToday(row.rate, '4.75', '3.25'), where).toBe(addRates(pair![1]!, '0'));
      }
    }
  });

  it('has Mizrahi’s maximums and FIBI’s list rates, monthly, except Cal 30+ at FIBI, quarterly', async () => {
    for (const row of (await bank('20')).rates!) {
      expect(row.rate.quality).toBe('max');
      expect(row.rate.compounding).toBe(12);
    }
    for (const row of (await bank('31')).rates!) {
      expect(row.rate.quality).toBe('exact');
      const quarterly = row.deal === 'deferred' && row.issuer === 'cal';
      expect(row.rate.compounding, `${row.issuer}.${row.tier ?? ''}.${row.deal}`).toBe(quarterly ? 4 : 12);
    }
  });

  it('has Mizrahi’s club rates: Lifestyle, lawyers, local-authority staff, חייל יותר, Cal security forces', async () => {
    const c = await loadCatalog();
    const credit = (issuer: string, tier: string, club: string) =>
      rateToday(deal(resolveCard(c, { issuer, bank: '20', tier, club }), 'credit')!.rate!, '4.75', '3.25');
    expect(credit('isracard', 'international', 'lifestyle')).toBe('15.05');
    expect(credit('isracard', 'gold', 'lawyers')).toBe('9.75');
    expect(credit('isracard', 'international', 'olami')).toBe('13.55');
    expect(credit('isracard', 'gold', 'chayal_yoter')).toBe('15.25');
    expect(credit('cal', 'international', 'hever')).toBe('5.75');
  });

  it('has Mizrahi and FIBI-group spot figures from the tables', async () => {
    const c = await loadCatalog();
    const today = (issuer: string, bankId: string, tier: string, kind: string) =>
      rateToday(deal(resolveCard(c, { issuer, bank: bankId, tier }), kind)!.rate!, '4.75', '3.25');
    expect(today('isracard', '20', 'business', 'credit')).toBe('13.25');
    expect(today('amex', '20', 'centurion', 'credit')).toBe('6.45');
    expect(today('cal', '20', 'basic', 'deferred')).toBe('15.25');
    expect(today('diners', '20', 'platinum', 'credit')).toBe('13');
    expect(today('max', '20', 'first', 'credit')).toBe('8.25');
    expect(today('isracard', '31', 'world_elite', 'credit')).toBe('8');
    expect(today('amex', '52', 'green', 'credit')).toBe('13');
    expect(today('cal', '14', 'platinum', 'deferred')).toBe('9.25');
    expect(today('max', '26', 'international', 'deferred')).toBe('14.25');
  });

  it('has Massad’s table on prime 5.00% as derived margins that reproduce its published pairs', async () => {
    // [issuer, tier, deal, margin, published nominal, published effective], from its 10/7/2026 table.
    const published: [IssuerId, string, string, string, string, string][] = [
      ['isracard', 'world_elite', 'credit', '1', '6.00', '6.17'],
      ['isracard', 'platinum', 'credit', '3', '8.00', '8.30'],
      ['isracard', 'gold', 'credit', '7', '12.00', '12.68'],
      ['isracard', 'international', 'credit', '8.5', '13.50', '14.37'],
      ['amex', 'centurion', 'credit', '1', '6.00', '6.17'],
      ['max', 'platinum', 'credit', '6.5', '11.50', '12.13'],
      ['max', 'gold', 'deferred', '8.25', '13.25', '14.09'],
      ['max', 'international', 'credit', '9.5', '14.50', '15.50'],
    ];
    const rows = (await bank('46')).rates!;
    for (const row of rows) {
      expect(row.rate.quality).toBe('derived');
      expect(row.rate.source.note).toBe('table on prime 5.00%');
    }
    for (const [issuer, tier, kind, margin, nominal, effective] of published) {
      const row = rows.find((r) => r.issuer === issuer && r.tier === tier && r.deal === kind)!;
      const basis = row.rate.basis;
      expect(basis?.kind, `${issuer}.${tier}.${kind}`).toBe('prime');
      expect(basis?.kind === 'prime' && addRates(basis.margin, '0')).toBe(margin);
      const onOldPrime = rateToday(row.rate, '5', '3.5')!;
      expect(onOldPrime).toBe(addRates(nominal, '0'));
      expect(annualEffectiveRate(onOldPrime, row.rate.compounding)).toBe(effective);
    }
  });

  it('has each bank’s FX fee per card company, as researched', async () => {
    const fx = async (id: string) => (await bank(id)).fxFee;
    expect(await fx('10')).toEqual({ max: '3', cal: '3', isracard: '3', diners: '3' });
    expect(await fx('12')).toEqual({ isracard: '2.90', max: '2.90', cal: '2.90', amex: '2.5', diners: '3' });
    expect(await fx('20')).toEqual({ isracard: '2.7', amex: '2.5', cal: '3.00', max: '3' });
    expect(await fx('11')).toEqual({ cal: '3', max: '3' });
    expect(await fx('17')).toEqual({ cal: '3' });
    for (const id of ['31', '52', '14', '26'])
      expect(await fx(id), id).toEqual({ cal: '3', isracard: '2.7' });
    expect(await fx('46')).toEqual({ isracard: '2.7' });
    expect(await fx('4')).toEqual({ isracard: '2.7' });
    expect(await fx('18')).toEqual({ isracard: '0' });
  });

  it('applies First’s own FX fee at Leumi and Mizrahi', async () => {
    const c = await loadCatalog();
    expect(resolveCard(c, { issuer: 'max', bank: '10', tier: 'first' })?.fxFee).toBe('2');
    expect(resolveCard(c, { issuer: 'max', bank: '20', tier: 'first' })?.fxFee).toBe('2.00');
    expect(resolveCard(c, { issuer: 'max', bank: '20', tier: 'gold' })?.fxFee).toBe('3');
  });

  it('has the published late rates: Hapoalim and FIBI quarterly on prime, Mizrahi’s account rate', async () => {
    const hapoalim = (await bank('12')).lateRate!;
    expect(hapoalim).toMatchObject({ basis: { kind: 'prime', margin: '11.60' }, compounding: 4 });
    expect(hapoalim.source.note).toBe('published nominal: 16.35; published effective: 17.38');
    const fibi = (await bank('31')).lateRate!;
    expect(rateToday(fibi, '4.75', '3.25')).toBe('18.15');
    expect(fibi.compounding).toBe(4);
    for (const id of ['52', '14', '26']) expect((await bank(id)).lateRate, id).toBe(fibi);
    const mizrahi = (await bank('20')).lateRate!;
    expect(mizrahi).toMatchObject({
      basis: { kind: 'prime', margin: '13.80' },
      compounding: 4,
      quality: 'typical',
    });
    expect((await bank('10')).lateRate).toMatchObject({ basis: null, quality: 'max' });
  });

  it('has Discount’s קרדיט and קרדיט פלוס: fixed for life on Cal, reset at 19 on Max', async () => {
    const c = await loadCatalog();
    for (const [issuer, tier] of [
      ['cal', 'gold'],
      ['diners', 'classic'],
    ] as const) {
      const r = resolveCard(c, { issuer, bank: '11', tier });
      expect(deal(r, 'credit'), issuer).toMatchObject({
        payments: { min: 3, max: 18 },
        minDealMinor: 7_500,
        minPaymentMinor: 2_500,
        from: 'bank',
        rate: { basis: null, fixedAtPurchase: true, accrues: 'billing_date' },
      });
      const long = deal(r, 'long_credit');
      expect(long, issuer).toMatchObject({
        label: { he: 'קרדיט פלוס' },
        payments: { min: 19, max: 36 },
        minDealMinor: 95_000,
        minPaymentMinor: 5_000,
        rate: { basis: null, fixedAtPurchase: true },
      });
      expect(long?.rate?.reset, issuer).toBeUndefined();
    }
    const max = resolveCard(c, { issuer: 'max', bank: '11', tier: 'gold' });
    expect(deal(max, 'credit')).toMatchObject({ payments: { min: 3, max: 18 }, minDealMinor: 7_500 });
    expect(deal(max, 'long_credit')).toMatchObject({
      payments: { min: 19, max: 36 },
      minDealMinor: 95_000,
      minPaymentMinor: 5_000,
      abroad: false,
    });
    expect(deal(max, 'long_credit')?.rate?.reset).toEqual({ atPayment: 19, rule: 'prime_delta' });
    expect((await bank('11')).billingDays).toEqual([2, 10, 15]);
  });

  it('has Hapoalim’s own קרדיט בתשלומים rules on each card company its agreements cover', async () => {
    const c = await loadCatalog();
    for (const issuer of ['isracard', 'amex', 'cal', 'max'] as const) {
      const r = resolveCard(c, { issuer, bank: '12', tier: 'gold' });
      expect(deal(r, 'credit'), issuer).toMatchObject({
        payments: { min: 3, max: 18 },
        minDealMinor: 7_500,
        minPaymentMinor: 2_500,
        from: 'bank',
        rate: { basis: null, dayCount: '30/360', accrues: 'billing_date', fixedAtPurchase: true },
      });
      const long = deal(r, 'long_credit');
      expect(long, issuer).toMatchObject({
        payments: { min: 19, max: 36 },
        minDealMinor: 95_000,
        minPaymentMinor: 5_000,
        from: 'bank',
        rate: { basis: null, fixedAtPurchase: true },
      });
      expect(long?.rate?.reset, issuer).toBeUndefined(); // fixed per deal, even on Max
    }
  });

  it('bills One Zero’s foreign purchases on the billing date with no FX fee', async () => {
    const r = resolveCard(await loadCatalog(), { issuer: 'isracard', bank: '18', tier: 'international' });
    expect(r).toMatchObject({ fxFee: '0', foreignPosting: 'billing_date' });
  });

  it('gives every bank-level figure a source', async () => {
    for (const b of (await loadCatalog()).banks) {
      expect(b.sources?.issuers, `${b.id}.issuers`).toBeDefined();
      for (const k of Object.keys(b.fxFee ?? {}) as IssuerId[])
        expect(b.sources?.fxFee?.[k], `${b.id}.fxFee.${k}`).toBeDefined();
      if (b.billingDays) expect(b.sources?.billingDays, `${b.id}.billingDays`).toBeDefined();
      if (b.foreignPosting) expect(b.sources?.foreignPosting, `${b.id}.foreignPosting`).toBeDefined();
    }
  });
});
