// American Express Israel (פרימיום אקספרס בע"מ, in the Isracard group).
// Transcribed from docs/research/issuers/isracard.md (which covers Amex) and the
// general research file docs/research/2026-10-08-israeli-credit-card-interest.md.
// Nothing here comes from anywhere else. Non-bank rates are unpublished: null.
import type { LocalDate } from '@/types/money';

import type { CatalogIssuer, CatalogRate, CatalogSource } from '../types';

const SEEN = '2026-10-08' as LocalDate;
const at = (url: string, note?: string): CatalogSource =>
  note ? { url, seen: SEEN, note } : { url, seen: SEEN };

// The research's short names.
const AG25 = 'https://digital.isracard.co.il/link/c144296f498b49ffbe3fbcbeb72fc0eb.aspx'; // covers Premium Express too
const T_AMEX = 'https://he.americanexpress.co.il/globalassets/pdf/taarifonhatsavjan26.pdf';
const AMEXPDF = 'https://he.americanexpress.co.il/globalassets/PDF/credit-explan.pdf';
const CALC = 'https://marketing.americanexpress.co.il/pages-amex/credit-calculator/';
const ISCH = 'https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html';
const FAIR = 'https://digital.isracard.co.il/pages/Credit/';
const FLYCARD = 'https://www.americanexpress.co.il/credit-cards/flycard';
const HOT = 'https://www.isracard.co.il/credit-cards/moadonhot';

const fixedCredit = (url: string, note?: string): CatalogRate => ({
  basis: null, // set per deal by the lender; unpublished for non-bank cards
  quality: 'exact',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
  source: at(url, note),
});

const MONTHLY_ABROAD =
  'Undated Isracard staff training page: Amex Gold, Platinum and Centurion are charged for foreign purchases monthly.';

export const amex: CatalogIssuer = {
  id: 'amex',
  name: { he: 'אמריקן אקספרס', en: 'American Express' },
  tiers: [
    { id: 'blue', name: { he: 'כחול', en: 'Blue' }, issued: true },
    { id: 'credit', name: { he: 'קרדיט', en: 'Credit' }, issued: true },
    {
      id: 'green',
      name: { he: 'ירוק / Classic / Business', en: 'Green / Classic / Business' },
      issued: true,
    },
    {
      id: 'gold',
      name: { he: 'זהב', en: 'Gold' },
      issued: true,
      foreignPosting: 'billing_date',
      source: at(ISCH, MONTHLY_ABROAD),
    },
    { id: 'gold_plus', name: { he: 'Gold+', en: 'Gold+' }, issued: true },
    {
      id: 'platinum',
      name: { he: 'פלטינום', en: 'Platinum' },
      issued: true,
      foreignPosting: 'billing_date',
      source: at(ISCH, MONTHLY_ABROAD),
    },
    {
      id: 'centurion',
      name: { he: 'סנטוריון', en: 'Centurion' },
      issued: true,
      foreignPosting: 'billing_date',
      source: at(ISCH, MONTHLY_ABROAD),
    },
    { id: 'cashback_premium', name: { he: 'CashBack Premium', en: 'CashBack Premium' }, issued: true },
  ],
  clubs: [
    {
      id: 'flycard_premium',
      name: 'FLYCARD Premium',
      issued: true,
      monthlyMinor: 4000,
      source: at(
        T_AMEX,
        'A 50% FX-fee discount runs until 30.06.2027 (Amex FlyCard page); not recorded as a fee.',
      ),
    },
    {
      id: 'hot',
      name: 'מועדון הוט',
      issued: true,
      monthlyMinor: 0,
      fxFee: '1',
      foreignPosting: 'billing_date',
      source: at(
        HOT,
        'Hot cards are issued on Visa, Mastercard or American Express; monthly foreign billing per the undated iSchool page.',
      ),
    },
  ],
  billingDays: [2, 10, 15, 20],
  foreignPosting: 'immediate',
  fxFee: '2.5',
  cardFees: [
    {
      tier: 'blue',
      monthlyMinor: 1590,
      waivers: [
        { spendMinor: 100_000, feeMinor: 1160 },
        { spendMinor: 600_000, feeMinor: 0 },
      ],
      source: at(T_AMEX, 'Published as ₪4.30 off at ₪1,000 of spend, free at ₪6,000.'),
    },
    {
      tier: 'credit',
      monthlyMinor: 1690,
      waivers: [{ spendMinor: 650_000, feeMinor: 0 }],
      source: at(T_AMEX),
    },
    {
      tier: 'green',
      monthlyMinor: 1890,
      waivers: [],
      source: at(T_AMEX, 'The research quotes spend targets only by example; this card’s are not recorded.'),
    },
    { tier: 'gold', monthlyMinor: 2290, waivers: [{ spendMinor: 700_000, feeMinor: 0 }], source: at(T_AMEX) },
    {
      tier: 'gold_plus',
      monthlyMinor: 2490,
      waivers: [],
      source: at(T_AMEX, 'The research quotes spend targets only by example; this card’s are not recorded.'),
    },
    { tier: 'cashback_premium', monthlyMinor: 3090, waivers: [], source: at(T_AMEX) },
  ],
  sources: {
    tiers: at(T_AMEX, 'Card types from the non-bank fee schedule of 1.7.2026.'),
    clubs: at(FLYCARD),
    billingDays: at(
      ISCH,
      'Undated Isracard staff training page; the Isracard group list, not stated separately for Amex. UNCONFIRMED that it is current.',
    ),
    foreignPosting: at(
      AG25,
      'Charged the business day after capture (§8.5), unless a card has another arrangement.',
    ),
    fxFee: at(T_AMEX, 'Non-bank and all bank Amex schedules, from 1.7.2026.'),
  },
  deals: [
    { kind: 'regular', label: { he: 'רגילה', en: 'Regular' }, abroad: true, source: at(ISCH) },
    { kind: 'installments', label: { he: 'תשלומים', en: 'Installments' }, abroad: true, source: at(ISCH) },
    {
      kind: 'credit',
      label: { he: 'קרדיט בתשלומים קבועים', en: 'Credit in fixed installments' },
      payments: { min: 3, max: 18 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      abroad: true,
      rate: fixedCredit(
        AG25,
        'Interest from the regular billing date, 30/360, Spitzer (§19.2.2–19.2.3); the Amex explainer agrees.',
      ),
      source: at(AMEXPDF),
    },
    {
      kind: 'long_credit',
      label: { he: 'קרדיט בתשלומים', en: 'Credit in installments, more than 19 payments' },
      // "more than 19" at ₪50 principal each (AG25 §19.2.2.3.2); up to 36 per Amex's calculator.
      // Exactly 19 payments is ambiguous in the contract (UNCONFIRMED), so the range starts at 20.
      payments: { min: 20, max: 36 },
      minPaymentMinor: 5_000,
      abroad: true,
      rate: fixedCredit(
        CALC,
        'Fixed from the moment of the deal; it does not follow prime (calculator FAQ).',
      ),
      source: at(CALC),
    },
  ],
  extraRates: {
    late: {
      basis: { kind: 'boi', margin: '16.40' },
      quality: 'typical',
      compounding: 4,
      dayCount: 'actual/365',
      accrues: 'billing_date',
      fixedAtPurchase: false,
      source: at(
        FAIR,
        'The Isracard group’s fair-credit page (lender for non-bank cards: Isracard Mimun); not stated separately for Amex.',
      ),
    },
  },
};
