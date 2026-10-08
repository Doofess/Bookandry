// Max (מקס איט פיננסים בע"מ, formerly Leumi Card; Visa and Mastercard).
// Transcribed from docs/research/issuers/max.md and the general research file
// docs/research/2026-10-08-israeli-credit-card-interest.md. Nothing here comes
// from anywhere else. Max-issued (non-bank) rates are not published: null.
import type { LocalDate } from '@/types/money';

import type { CatalogIssuer, CatalogSource } from '../types';

const SEEN = '2026-10-08' as LocalDate;
const at = (url: string, note?: string): CatalogSource =>
  note ? { url, seen: SEEN, note } : { url, seen: SEEN };

// The research's short names (max.md, "Sources").
const AGR = 'https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf';
const TARIFF = 'https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_general.pdf';
const COMM = 'https://www.max.co.il/cards/pages/commissions';
const SKY = 'https://www.max.co.il/api/umbraco/getImage?imageName=taarifon-skymax.pdf';
const FIRST = 'https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_first.pdf';
const WE = 'https://www.max.co.il/api/umbraco/getImage?imageName=taarifon-world-elite.pdf';
const SPLIT = 'https://www.max.co.il/loans/transaction-split';
const MBT = 'https://www.max.co.il/cards/max-back-total';
const AR25 = 'https://www.max.co.il/api/umbraco/getImage?imageName=100332524.pdf';
const DISCOUNT =
  'https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/';

const PINUKIM =
  'The reductions apply only on the פינוקים track; spend excludes cash, fees, interest and credit products.';
const CAPTURE =
  'Interest from when the credit is given: the slip’s capture at Max (§7.3, §7.5(א)), with possible bridge interest; how the days to the first billing date are billed is UNCONFIRMED.';
const DAY_COUNT =
  'The agreement allows 30/360 Spitzer or actual/365 per credit (§7.3); 30/360 assumed, as in the bank versions.';

export const max: CatalogIssuer = {
  id: 'max',
  name: { he: 'מקס', en: 'Max' },
  tiers: [
    { id: 'classic', name: { he: 'קלאסיק', en: 'Classic' }, issued: true },
    { id: 'international', name: { he: 'בינלאומי', en: 'International' }, issued: true },
    { id: 'gold', name: { he: 'זהב', en: 'Gold' }, issued: true },
    { id: 'gold_business', name: { he: 'זהב עסקי', en: 'Gold Business' }, issued: true },
    { id: 'platinum', name: { he: 'פלטינום', en: 'Platinum' }, issued: true },
    { id: 'first', name: { he: 'First', en: 'First' }, issued: true, fxFee: '2', source: at(FIRST) },
    {
      id: 'world_elite',
      name: { he: 'World Elite', en: 'World Elite' },
      issued: true,
      fxFee: '1.5',
      source: at(
        WE,
        'Card fee "270 ש״ח לכרטיס": whether monthly or annual is UNCONFIRMED, so it is not recorded.',
      ),
    },
    { id: 'cash', name: { he: 'max cash / pre-paid', en: 'max cash / pre-paid' }, issued: true },
  ],
  clubs: [
    {
      id: 'max_back_total',
      name: 'MAX Back Total',
      issued: true,
      source: at(MBT, 'First-year card fee waived.'),
    },
    { id: 'maxback', name: 'MAXBack', issued: true },
    { id: 'maxback_crypto', name: 'MAXBack CRYPTO', issued: true },
    {
      id: 'skymax',
      name: 'SKYMAX',
      issued: true,
      monthlyMinor: 1990,
      fxFee: '2.8',
      source: at(SKY, 'No spend waiver.'),
    },
    {
      id: 'skymax_premium',
      name: 'SKYMAX Premium',
      issued: true,
      monthlyMinor: 2990,
      fxFee: '1.9',
      source: at(SKY, 'No spend waiver.'),
    },
    { id: 'dreamcard_vip', name: 'DREAMCARD VIP', issued: true },
    { id: 'mymax', name: 'MyMAX', issued: true },
    { id: 'pinukim', name: 'פינוקים', issued: true },
    { id: 'executive', name: 'executive', issued: true },
    { id: 'max_business', name: 'MAX Business', issued: true },
    { id: 'xplace_business', name: 'XPLACE Business', issued: true },
    { id: 'wincard_plus', name: 'WINCARD+', issued: true },
    { id: 'uniq', name: 'UNIQ', issued: true },
    { id: 'uniq_isic', name: 'UNIQ ISIC', issued: true },
    { id: 'tau', name: 'TAU', issued: true },
    { id: 'kranot', name: 'קרנות', issued: true },
    { id: 'tmura', name: 'תמורה', issued: true },
    { id: 'beyachad', name: 'ביחד בשבילך', issued: true },
    { id: 'behatsdaa', name: 'בהצדעה', issued: true },
    { id: 'super_payback', name: 'SUPER PAY-BACK', issued: true },
    { id: 'haelef', name: 'מועדון האלף', issued: true },
    { id: 'iec', name: 'חברת החשמל', issued: true },
    { id: 'reut', name: 'רעות תקני לי', issued: true },
    { id: 'i_need_it', name: 'I need it', issued: true },
    { id: 'victory', name: 'ויקטורי', issued: true },
    { id: 'huji_alumni', name: 'Hebrew University alumni', issued: true },
    { id: 'club_1824', name: '1824', issued: true },
    { id: 'indi', name: 'INDI / All-Club Business', issued: true },
    { id: 'kranot_prepaid', name: 'קרנות PRE-PAID', issued: true },
    { id: 'club_50', name: 'קלאב 50', issued: true },
    { id: 'free', name: 'FREE', issued: true },
    { id: 'clalpay', name: 'CLALPAY', issued: true },
    { id: 'misgeret_betucha', name: 'מסגרת בטוחה', issued: true },
  ],
  billingDays: [2, 10, 15],
  foreignPosting: 'immediate',
  fxFee: '3',
  cardFees: [
    {
      tier: 'classic',
      monthlyMinor: 1290,
      waivers: [
        { spendMinor: 175_000, feeMinor: 790 },
        { spendMinor: 500_000, feeMinor: 0 },
      ],
      source: at(TARIFF, PINUKIM),
    },
    ...(['international', 'gold'] as const).map((tier) => ({
      tier,
      monthlyMinor: 1790,
      waivers: [
        { spendMinor: 300_000, feeMinor: 1290 },
        { spendMinor: 600_000, feeMinor: 0 },
      ],
      source: at(TARIFF, PINUKIM),
    })),
    {
      tier: 'gold_business',
      monthlyMinor: 1990,
      waivers: [
        { spendMinor: 300_000, feeMinor: 1590 },
        { spendMinor: 500_000, feeMinor: 0 },
      ],
      source: at(TARIFF, PINUKIM),
    },
    {
      tier: 'platinum',
      monthlyMinor: 1990,
      waivers: [
        { spendMinor: 300_000, feeMinor: 1590 },
        { spendMinor: 600_000, feeMinor: 0 },
      ],
      source: at(TARIFF, PINUKIM),
    },
    { tier: 'cash', monthlyMinor: 1990, waivers: [], source: at(TARIFF) },
    { tier: 'first', monthlyMinor: 6000, waivers: [], source: at(FIRST) },
  ],
  sources: {
    tiers: at(
      TARIFF,
      'Card types from the general fee schedule from 1.10.2026; First and World Elite from their own schedules.',
    ),
    clubs: at(COMM, 'Max publishes a disclosure-and-fee document per club; none carries an interest rate.'),
    billingDays: at(AR25, 'Non-bank cards. On bank-issued cards the bank sets the date.'),
    foreignPosting: at(
      TARIFF,
      'Named for International and Gold / Gold Business cards: charged immediately, not at the billing date; deferral costs prime-based interest (§7.3(ז)). Whether Platinum is still charged monthly is UNCONFIRMED.',
    ),
    fxFee: at(TARIFF, 'From 1.10.2026, on all foreign-currency deals and foreign cash withdrawals.'),
  },
  deals: [
    { kind: 'regular', label: { he: 'רגילה', en: 'Regular' }, abroad: true, source: at(AGR) },
    { kind: 'installments', label: { he: 'תשלומים', en: 'Installments' }, abroad: true, source: at(AGR) },
    {
      kind: 'credit',
      label: { he: 'קרדיט', en: 'Credit' },
      payments: { min: 3, max: 18 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: '30/360',
        accrues: 'purchase',
        fixedAtPurchase: true,
        source: at(AGR, `${CAPTURE} ${DAY_COUNT}`),
      },
      source: at(SPLIT),
    },
    {
      kind: 'long_credit',
      label: { he: 'קרדיט פלוס', en: 'Credit Plus' },
      payments: { min: 19, max: 36 },
      minDealMinor: 95_000,
      minPaymentMinor: 5_000,
      abroad: false,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: '30/360',
        accrues: 'purchase',
        fixedAtPurchase: true,
        reset: { atPayment: 19, rule: 'prime_delta' },
        source: at(
          AGR,
          `"ריבית קבועה מתחלפת תקופתית" (§7.3(ב), §7.2(ב)(2)): fixed for payments 1–18, then shifted by prime’s change since the deal and fixed to the end. ${CAPTURE} ${DAY_COUNT}`,
        ),
      },
      source: at(DISCOUNT),
    },
    {
      kind: 'deferred',
      label: { he: '30 פלוס', en: '30 Plus' },
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: 'actual/365',
        accrues: 'billing_date',
        fixedAtPurchase: false,
        source: at(
          AGR,
          '"אשראי 30 פלוס" (§7.3(ו)): prime-based variable rate, on the days from the billing date to the next one. Monthly compounding is assumed (UNCONFIRMED): Max publishes no rate or pair for it.',
        ),
      },
      source: at(AGR),
    },
    {
      kind: 'split_purchase',
      label: { he: 'חלוקת עסקה', en: 'Split a purchase' },
      payments: { min: 3, max: 36 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      minPaymentFrom: { payments: 19, minPaymentMinor: 5_000 },
      abroad: false, // regular deals charged in shekels only
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: '30/360',
        accrues: 'request',
        fixedAtPurchase: true,
        reset: { atPayment: 19, rule: 'prime_delta' },
        source: at(
          SPLIT,
          'Interest from the request date. An already-charged deal is credited within 3 business days and pays variable daily bridge interest on the next billing date; payments start on the second. A rate change before the split applies. Up to 18 payments fixed; from 19, re-set at payment 19 by the prime change. Day count not stated (UNCONFIRMED).',
        ),
      },
      source: at(SPLIT),
    },
  ],
  extraRates: {
    late: {
      basis: null,
      quality: 'max',
      compounding: 12,
      dayCount: 'actual/365',
      accrues: 'billing_date',
      fixedAtPurchase: false,
      source: at(
        AGR,
        '§18: the legal maximum, or the highest rate Max charges, or the maximum rate. The Fair Credit Law late cap is 1.2 × (Bank of Israel rate + 15), 21.9% today. Actual days over 365 or 366 (§18). Added to principal at the end of each month: "כל ריבית ... תצטרף לקרן – בתום כל חודש" (§19).',
      ),
    },
  },
};
