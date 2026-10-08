// Mizrahi-Tefahot (בנק מזרחי-טפחות, Masav 20), including former Union Bank.
// Transcribed from docs/research/issuers/banks-leumi-hapoalim-mizrahi.md, Part M.
//
// Rates: the "שיעורי ריבית באשראי" page, notice of 2.9.2026, effective
// 3.9.2026, base rate (prime) 4.75%. The page labels each figure "העלות החדשה
// המרבית", so every row is a maximum. It prints figures, not margins; each
// moves with prime ("לרבות אשראי באמצעות כרטיסי אשראי"), so each margin is the
// published nominal less 4.75. Every pair fits m = 12 (13.25 → 14.08 is
// 0.01 under the formula: truncation, §M.5).
//
// Columns transcribed: the fixed-installment קרדיט ("קרדיט בתשלומים קבועים",
// "בתשלומים קבועים") as `credit`, and Cal's "ויזה 30+" as `deferred`. The
// revolving columns (ישראקרדיט, עדיף, אשראי מתגלגל, מולטי) belong to part 2,
// and the loan columns (אשראי מהיר, אקספרס, חודש חופש) are not deal types.
// Interest accrual is not stated by Mizrahi: the regular billing date is
// recorded, as at every bank whose agreement was read; the first payment falls
// "חודש לאחר מועד החיוב הרגיל" (§M.2). Day count: Spitzer, 30/360, for קרדיט.
//
// Rows not transcribed, their card type not mapping to one catalog tier or club:
// Corporate Mastercard / Corporate Gold / Corporate Amex Gold and Green; Amex
// Gold+; Max Multi (its קרדיט figures equal the plain cards'). Long credit
// (19–36) is UNCONFIRMED at Mizrahi.
import type { BankRateRow, CatalogBank, IssuerId } from '../types';
import { at, forTiers, pair, primeRate } from './shared';

const RATES =
  'https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/';
const CARDS = 'https://www.mizrahi-tefahot.co.il/credit-cards/';
const TARIFF = 'https://www.mizrahi-tefahot.co.il/interest-list-credit-card-small/';

const CREDIT = {
  quality: 'max',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
  caveat:
    'Mizrahi does not state when interest starts (UNCONFIRMED): the regular billing date is recorded, as at every bank whose agreement was read; the first payment falls a month after it.',
} as const;
const THIRTY_PLUS = {
  ...CREDIT,
  dayCount: 'actual/365',
  fixedAtPurchase: false,
  caveat:
    'Mizrahi states neither when interest starts nor the day count (UNCONFIRMED): the regular billing date and actual/365 are recorded. This pair fits m = 12, though FIBI publishes Cal 30+ at m = 4.',
} as const;

const credit = (margin: string, nominal: string, effective: string) =>
  primeRate(CREDIT, margin, at(RATES, pair(nominal, effective)));
const thirtyPlus = (margin: string, nominal: string, effective: string) =>
  primeRate(THIRTY_PLUS, margin, at(RATES, pair(nominal, effective)));
const club = (issuer: IssuerId, id: string, rate: ReturnType<typeof credit>): BankRateRow => ({
  issuer,
  club: id,
  deal: 'credit',
  rate,
});

const rates: BankRateRow[] = [
  // Isracard / Amex, "קרדיט בתשלומים קבועים".
  // Isracard regular; Mastercard; Amex Blue; Amex Credit; Supercard; מועדון חייל יותר.
  ...forTiers('isracard', ['local', 'international'], 'credit', credit('10.50', '15.25', '16.36')),
  ...forTiers('amex', ['blue', 'credit'], 'credit', credit('10.50', '15.25', '16.36')),
  club('isracard', 'chayal_yoter', credit('10.50', '15.25', '16.36')),
  club('isracard', 'lifestyle', credit('10.30', '15.05', '16.13')),
  // Gold Mastercard; Amex Green; Supercard Gold.
  ...forTiers('isracard', ['gold'], 'credit', credit('8.25', '13.00', '13.80')),
  ...forTiers('amex', ['green'], 'credit', credit('8.25', '13.00', '13.80')),
  // Mastercard Business.
  ...forTiers('isracard', ['business'], 'credit', credit('8.50', '13.25', '14.08')),
  // Gold Mastercard Business.
  ...forTiers('isracard', ['gold_business'], 'credit', credit('7.95', '12.70', '13.47')),
  ...forTiers('amex', ['gold'], 'credit', credit('7.95', '12.70', '13.47')),
  // Gold Mastercard Platinum; Amex Platinum.
  ...forTiers('isracard', ['platinum'], 'credit', credit('6.50', '11.25', '11.85')),
  ...forTiers('amex', ['platinum'], 'credit', credit('6.50', '11.25', '11.85')),
  ...forTiers('isracard', ['world_elite'], 'credit', credit('3.20', '7.95', '8.25')),
  ...forTiers('amex', ['centurion'], 'credit', credit('1.70', '6.45', '6.64')),
  // Lawyers' Isracard (עו"ד), and spouse; עולמי עובדי הרשויות.
  club('isracard', 'lawyers', credit('5.00', '9.75', '10.20')),
  club('isracard', 'olami', credit('8.80', '13.55', '14.42')),

  // Cal (Visa / Mastercard), "בתשלומים קבועים" and "ויזה 30+".
  // Basic; Local; International; Business (and their Mastercards).
  ...forTiers(
    'cal',
    ['basic', 'local', 'international', 'business'],
    'credit',
    credit('10.50', '15.25', '16.36'),
  ),
  ...forTiers(
    'cal',
    ['basic', 'local', 'international', 'business'],
    'deferred',
    thirtyPlus('10.50', '15.25', '16.36'),
  ),
  // Business Gold / Globus; Gold; Mastercard Gold (and Gold Business).
  ...forTiers('cal', ['business_gold', 'gold'], 'credit', credit('8.25', '13.00', '13.80')),
  ...forTiers('cal', ['business_gold', 'gold'], 'deferred', thirtyPlus('8.25', '13.00', '13.80')),
  // Visa Platinum; Mastercard Platinum (and Platinum Business).
  ...forTiers('cal', ['platinum'], 'credit', credit('6.50', '11.25', '11.85')),
  ...forTiers('cal', ['platinum'], 'deferred', thirtyPlus('6.50', '11.25', '11.85')),
  // מועדון כוחות הבטחון: the Cal security-forces club (legacy cards).
  club('cal', 'hever', credit('1.00', '5.75', '5.90')),
  { issuer: 'cal', club: 'hever', deal: 'deferred', rate: thirtyPlus('1.00', '5.75', '5.90') },
  // Diners Platinum; Diners Mastercard: in the Gold row, "דיינרס בתשלומים קבועים".
  ...forTiers('diners', ['platinum', 'mastercard'], 'credit', credit('8.25', '13.00', '13.80')),

  // Max, "קרדיט בתשלומים קבועים" (the page prints the digits reversed; decoded in the research).
  ...forTiers('max', ['first'], 'credit', credit('3.50', '8.25', '8.57')),
  ...forTiers('max', ['platinum'], 'credit', credit('6.75', '11.50', '12.13')),
  ...forTiers('max', ['gold_business', 'gold'], 'credit', credit('8.50', '13.25', '14.08')),
  ...forTiers('max', ['international'], 'credit', credit('10.75', '15.50', '16.65')),
];

export const mizrahi: CatalogBank = {
  id: '20',
  name: { he: 'בנק מזרחי-טפחות', en: 'Mizrahi-Tefahot' },
  issuers: ['isracard', 'cal', 'amex', 'max', 'diners'],
  fxFee: { isracard: '2.7', amex: '2.5', cal: '3.00', max: '3' },
  fxFeeTiers: [
    {
      issuer: 'max',
      tier: 'first',
      fee: '2.00',
      source: at(TARIFF, 'Tariff ch. 6ד (Max), dated 1.12.17: FIRST 2.00%. It may be stale.'),
    },
  ],
  // "עו"ש חובה" (a debit balance with no line), the late and over-limit case on the
  // account the card debits: prime + 13.80, quarterly. Whether Mizrahi charges it as
  // the card's ריבית פיגורים is UNCONFIRMED (§M.7): quality 'typical', and the caveat says so.
  lateRate: {
    basis: { kind: 'prime', margin: '13.80' },
    quality: 'typical',
    compounding: 4,
    dayCount: 'actual/365',
    accrues: 'billing_date',
    fixedAtPurchase: false,
    source: at(RATES, pair('18.55', '19.88')),
    caveat:
      'The account rate for a debit balance with no line ("עו"ש חובה"). Whether Mizrahi charges it as a card bill’s ריבית פיגורים is UNCONFIRMED: its current card agreement was not found online.',
  },
  rates,
  sources: {
    issuers: at(
      CARDS,
      '"תקפות בכרטיסי ישראכרט, Cal, אמריקן אקספרס, MAX ודיינרס". An exclusive 5-year deal with Isracard was signed 12.4.2026 (secondary source); its start and what happens to Cal, Max and Diners cards are UNCONFIRMED.',
    ),
    fxFee: {
      isracard: at(TARIFF, 'Tariff ch. 6א, updated 1.10.2026.'),
      amex: at(TARIFF, 'Tariff ch. 6ב, updated 1.10.2026.'),
      cal: at(TARIFF, 'Tariff ch. 6ג, updated 1.10.2026: "השער היציג בתוספת 3.00%".'),
      max: at(TARIFF, 'Tariff ch. 6ד, dated 1.12.17. It may be stale.'),
    },
  },
};
