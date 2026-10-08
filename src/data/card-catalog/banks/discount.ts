// Discount Bank (בנק דיסקונט לישראל, Masav 11).
// Transcribed from docs/research/issuers/banks-others.md, §1.
// Discount publishes no card-credit rates: they are "מפורטים במכתב שנשלח בסמוך
// להנפקת הכרטיס ובדף הפירוט החודשי" (§1.5), so it has no `rates`. Its
// קרדיט and קרדיט פלוס rules (§1.4) go in `dealOverrides`.
//
// Not recorded: foreign posting (immediate, but Visa Platinum is deferred to the
// billing date, a per-card rule, §1.2); Diners' FX fee (the tariff gives Cal's and
// Max's); the card fees (appendix D's names and amounts may be misaligned, §1.8).
import type { CatalogBank, CatalogRate, DealRule, IssuerId } from '../types';
import { at } from './shared';

const TARIFF = 'https://www.discountbank.co.il/media/5thjpjjd/part_6_cards_11026.pdf';
const PART_G = 'https://www.discountbank.co.il/media/kwmj2jsr/part_g.pdf';
const CREDIT =
  'https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/';
const TYPES = 'https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/';
const VISA = 'https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/visaterms/';

/** Cal and Diners קרדיט (part ז' §י(1)א): prime when the credit is given ± the bank's margin, fixed for life. */
const calCreditRate = (): CatalogRate => ({
  basis: null,
  quality: 'typical',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
  source: at(
    PART_G,
    'Part ז’ §י(1)א: "לפי שיעור הריבית הבסיסית במועד הנ"ל, בתוספת או בהפחתת מרווח בשיעור שיקבע הבנק", at the rate in force when the card company receives the slip, accruing "החל ממועד החיוב הרגיל"; Spitzer (§1.4). Fixed for the life of the deal, 19–36 payments too. The rate is in the issue letter and on the statement.',
  ),
});

type Override = { issuer: IssuerId; deal: Partial<DealRule> & { kind: DealRule['kind'] } };

const calRules = (issuer: IssuerId): Override[] => [
  {
    issuer,
    deal: {
      kind: 'credit',
      label: { he: 'קרדיט', en: 'Credit' },
      payments: { min: 3, max: 18 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      rate: calCreditRate(),
      source: at(CREDIT),
    },
  },
  {
    issuer,
    deal: {
      kind: 'long_credit',
      label: { he: 'קרדיט פלוס', en: 'Credit Plus' },
      payments: { min: 19, max: 36 },
      minDealMinor: 95_000,
      minPaymentMinor: 5_000,
      rate: calCreditRate(),
      source: at(CREDIT),
    },
  },
];

export const discount: CatalogBank = {
  id: '11',
  name: { he: 'בנק דיסקונט', en: 'Discount Bank' },
  issuers: ['cal', 'diners', 'max'],
  fxFee: { cal: '3', max: '3' },
  billingDays: [2, 10, 15],
  lateRate: {
    basis: null,
    quality: 'typical',
    compounding: 4,
    dayCount: 'actual/365',
    accrues: 'billing_date',
    fixedAtPurchase: false,
    source: at(
      PART_G,
      'An unpaid card debit bears "ריבית מסגרת האשראי בחשבון או ריבית הפיגורים הנהוגה בבנק לחשבונות עו"ש". The figure is UNCONFIRMED: the overdraft table was not captured.',
    ),
  },
  dealOverrides: [
    ...calRules('cal'),
    ...calRules('diners'),
    // Max: the same 3–18 at ₪75 / ₪25; the rate "כפי שייקבעו על ידי הבנק" (§יב(1)א), its
    // accrual not stated, so the card company's rate rules stand.
    {
      issuer: 'max',
      deal: {
        kind: 'credit',
        label: { he: 'קרדיט', en: 'Credit' },
        payments: { min: 3, max: 18 },
        minDealMinor: 7_500,
        minPaymentMinor: 2_500,
        source: at(CREDIT),
      },
    },
    // Max קרדיט פלוס: fixed for payments 1–18, re-set after payment 18, not abroad
    // (part ז’ §יב(1)ב, "ריבית קבועה מתחלפת תקופתית"). Max's own rate carries the reset.
    {
      issuer: 'max',
      deal: {
        kind: 'long_credit',
        label: { he: 'קרדיט פלוס', en: 'Credit Plus' },
        payments: { min: 19, max: 36 },
        minDealMinor: 95_000,
        minPaymentMinor: 5_000,
        abroad: false,
        source: at(CREDIT),
      },
    },
  ],
  sources: {
    issuers: at(
      TYPES,
      'Visa (מפתח דיסקונט), Mastercard, Diners, Diners Extra Home, Fly Card / FlyAll. The tariff has Cal and Max chapters and no Isracard or Amex section.',
    ),
    billingDays: at(
      VISA,
      '"אפשר לבחור את מועדי החיוב לעסקות רכישה בארץ - 2, 10 או 15 בחודש". The bank sets the menu (part ז’ §9א(1)).',
    ),
    fxFee: {
      cal: at(TARIFF, 'Part 6, 01/10/2026: "השער היציג בתוספת 3%".'),
      max: at(
        TARIFF,
        'Part 6, 01/10/2026: 3%, at the representative rate known when max processes the deal.',
      ),
    },
  },
};
