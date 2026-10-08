// Cal (כרטיסי אשראי לישראל בע"מ: Visa and Mastercard; lender כאל (מימון) בע"מ).
// Transcribed from docs/research/issuers/cal.md and the general research file
// docs/research/2026-10-08-israeli-credit-card-interest.md. Nothing here comes
// from anywhere else. Cal-direct rates are not published on Cal's site: null.
import type { LocalDate } from '@/types/money';

import type { CatalogIssuer, CatalogSource } from '../types';

const SEEN = '2026-10-08' as LocalDate;
const at = (url: string, note?: string): CatalogSource =>
  note ? { url, seen: SEEN, note } : { url, seen: SEEN };

// The research's short names.
export const CAL_AGREEMENT = 'https://www.cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf';
export const CAL_FEES = 'https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf';
export const DINERS_CLASSIC = 'https://www.diners.co.il/clubs/clasic/';
export const DISCOUNT_CREDIT =
  'https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/';
export const DISCOUNT_CARDS = 'https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/';
const CAL_NOTICES = 'https://www.cal-online.co.il/about/legal-reports/changes/';
const ALL_CARDS = 'https://www.cal-online.co.il/card/all-cards/';
const SHUFERSAL = 'https://www.cal-online.co.il/cards/shufersal/';
export const FLYALL = 'https://www.cal-online.co.il/cards/flyall';
export const HEVER = 'https://www.isracard.co.il/credit-cards/chever';
const CALCHOICE = 'https://www.cal-online.co.il/ecredit/calchoice/';
const GLOSSARY = 'https://www.cal-online.co.il/media/o1klqq1j/beur-munachim.pdf';

/** Shared with Diners: one agreement covers both (§2.1). */
export const CAL_BILLING_DAYS_NOTE =
  'Quoted from Cal’s search snippet of the Diners Classic page; Bank Jerusalem gives the same three for Visa Cal. A consumer site also lists the 23rd for Mastercard Platinum (UNCONFIRMED).';
export const CAL_CREDIT_NOTE =
  'Interest from the day Cal pays the merchant or acquirer, within 4 days of the deal on average (§27.10(ב)), so before the billing date. How those early days are billed, and the day count, are not stated (UNCONFIRMED); 30/360 assumed. The 3–18 payments, ₪75 deal and ₪25 payment are Discount’s published figures for the Cal and Diners cards it distributes; Cal’s agreement leaves them to Cal.';
export const CAL_LONG_NOTE =
  'Cal’s agreement and prime notices: a base-rate change applies only to credit not yet taken, so a long deal stays fixed. Cal gives no name, range or minimums for 19–36 payments (Discount’s ₪950 / ₪50 belong to the bank layer). Same accrual and day-count caveats as קרדיט.';

const regularFee = (tier: string) => ({
  tier,
  monthlyMinor: 1790,
  waivers: [
    { spendMinor: 500_000, feeMinor: 990 },
    { spendMinor: 750_000, feeMinor: 0 },
  ],
  source: at(CAL_FEES, 'Monthly spend. From 1.6.2026.'),
});

export const cal: CatalogIssuer = {
  id: 'cal',
  name: { he: 'כאל', en: 'Cal' },
  tiers: [
    { id: 'basic', name: { he: 'בייסיק', en: 'Basic' }, issued: true },
    { id: 'local', name: { he: 'מקומי', en: 'Local' }, issued: true },
    { id: 'international', name: { he: 'בינלאומי', en: 'International' }, issued: true },
    { id: 'business', name: { he: 'עיסקי', en: 'Business' }, issued: true },
    { id: 'gold', name: { he: 'זהב', en: 'Gold' }, issued: true },
    { id: 'business_gold', name: { he: 'עיסקי זהב / גלובוס', en: 'Business Gold / Globus' }, issued: true },
    { id: 'platinum', name: { he: 'פלטינום', en: 'Platinum' }, issued: true },
    { id: 'calchoice', name: { he: 'CalChoice', en: 'CalChoice' }, issued: true },
    { id: 'lite', name: { he: 'Cal Lite', en: 'Cal Lite' }, issued: true },
    {
      id: 'prepaid',
      name: { he: 'נטען', en: 'Prepaid' },
      issued: true,
      source: at(
        CAL_NOTICES,
        'Cal’s notices set a 2.8% FX fee on prepaid "ויזה נטען" cards from 1.4.2018; the 06.2026 schedule gives 3.0% for all cards. Which applies to prepaid cards today is UNCONFIRMED, so no tier FX fee is recorded.',
      ),
    },
    { id: 'paybox_young', name: { he: 'PayBox Young', en: 'PayBox Young' }, issued: true },
  ],
  clubs: [
    {
      id: 'shufersal',
      name: 'שופרסל',
      issued: true,
      monthlyMinor: 1290,
      source: at(SHUFERSAL, 'No spend discount; first year free; a ₪3 monthly club fee after year 1.'),
    },
    {
      id: 'flycard',
      name: 'FlyCard',
      issued: false,
      movedTo: 'flyall',
      monthlyMinor: 1990,
      source: at(
        CAL_FEES,
        'The legacy aviation-club (bronze) fee in Cal’s 06.2026 schedule. El Al FlyCard moved to Isracard (June 2026); Discount tells holders they may switch to FlyAll and keep their card.',
      ),
    },
    {
      id: 'flycard_premium',
      name: 'FlyCard Premium',
      issued: false,
      movedTo: 'flyall',
      monthlyMinor: 3890,
      source: at(CAL_FEES, 'Legacy aviation-club premium fee; FlyCard moved to Isracard (June 2026).'),
    },
    { id: 'flyall', name: 'FlyAll', issued: true, source: at(FLYALL, 'Cal’s new aviation club card.') },
    {
      id: 'hever',
      name: 'מועדון כוחות הבטחון',
      issued: false,
      source: at(
        HEVER,
        'Hever is now Isracard’s. Mizrahi still lists a Cal security-forces club rate, read as legacy cards; whether Cal still issues one is UNCONFIRMED.',
      ),
    },
    { id: 'calchoice_plus', name: 'CalChoice+', issued: true, source: at(CALCHOICE) },
    { id: 'calfix', name: 'CalFix', issued: true },
    { id: 'cal_fixback', name: 'Cal FixBack', issued: true },
    { id: 'shave', name: 'שווה', issued: true },
    { id: 'high_miles', name: 'High Miles', issued: true },
    { id: 'visa_infinite', name: 'Visa Infinite', issued: true },
    { id: 'cashcal', name: 'CashCal', issued: true },
    {
      id: 'cashcal_pro',
      name: 'CashCal Pro',
      issued: true,
      monthlyMinor: 1990,
      source: at(CAL_FEES, 'No spend discount.'),
    },
    { id: 'mycal', name: 'MyCal', issued: true },
    {
      id: 'miles_and_more',
      name: 'Miles & More',
      issued: true,
      monthlyMinor: 1990,
      source: at(CAL_FEES, 'The fee schedule gives ₪19.90 for Miles & More Platinum.'),
    },
    { id: 'shelanu', name: 'שלנו', issued: true },
    { id: 'vip365', name: 'CAL VIP365', issued: true },
    { id: 'mafteach', name: 'מפתח דיסקונט', issued: true },
    { id: 'smile', name: 'סמייל', issued: true },
  ],
  billingDays: [2, 10, 15],
  foreignPosting: 'immediate',
  fxFee: '3',
  cardFees: [
    ...['local', 'international', 'business', 'gold'].map(regularFee),
    {
      tier: 'platinum',
      monthlyMinor: 1790,
      waivers: [
        { spendMinor: 750_000, feeMinor: 1590 },
        { spendMinor: 1_200_000, feeMinor: 0 },
      ],
      source: at(CAL_FEES, 'Monthly spend. From 1.6.2026.'),
    },
    { tier: 'lite', monthlyMinor: 590, waivers: [], source: at(CAL_FEES) },
    { tier: 'prepaid', monthlyMinor: 990, waivers: [], source: at(CAL_FEES) },
    { tier: 'paybox_young', monthlyMinor: 790, waivers: [], source: at(CAL_FEES) },
  ],
  sources: {
    tiers: at(CAL_FEES, 'Card types from Cal’s fee schedule (06.2026) and Mizrahi’s Cal table.'),
    clubs: at(ALL_CARDS),
    billingDays: at(DINERS_CLASSIC, CAL_BILLING_DAYS_NOTE),
    foreignPosting: at(
      GLOSSARY,
      'Foreign deals and cash are charged near Cal’s capture ("ככלל החיוב הינו מיידי"); deferring them to the billing date costs 30+ interest (§27.11).',
    ),
    fxFee: at(CAL_FEES, '3.0% from 1.6.2026 (2.8% from 1.8.2017; when it rose is UNCONFIRMED).'),
  },
  deals: [
    { kind: 'regular', label: { he: 'רגילה', en: 'Regular' }, abroad: true, source: at(CAL_AGREEMENT) },
    {
      kind: 'installments',
      label: { he: 'תשלומים', en: 'Installments' },
      abroad: true,
      source: at(CAL_AGREEMENT),
    },
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
        accrues: 'merchant_paid',
        fixedAtPurchase: true,
        source: at(CAL_AGREEMENT, CAL_CREDIT_NOTE),
      },
      source: at(DISCOUNT_CREDIT),
    },
    {
      kind: 'long_credit',
      label: { he: 'קרדיט', en: 'Long credit' },
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: '30/360',
        accrues: 'merchant_paid',
        fixedAtPurchase: true,
        source: at(CAL_AGREEMENT, CAL_LONG_NOTE),
      },
      source: at(CAL_AGREEMENT),
    },
    {
      kind: 'deferred',
      label: { he: '30+', en: '30+' },
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 4,
        dayCount: 'actual/365',
        accrues: 'billing_date',
        fixedAtPurchase: false,
        source: at(
          CAL_AGREEMENT,
          '"פלוס 30" (§27.9): deferred one month, base rate ± margin, re-priced pro rata when prime moves; interest charged quarterly (January, April, July, October) from the regular billing date. Day count not stated (UNCONFIRMED). Not on CalChoice.',
        ),
      },
      source: at(CAL_AGREEMENT),
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
        CAL_AGREEMENT,
        'The legal maximum (§21.3): the Fair Credit Law late cap, 1.2 × (Bank of Israel rate + 15), 21.9% today. Actual days over 365 or 366. Compounding not stated (UNCONFIRMED).',
      ),
    },
  },
};
