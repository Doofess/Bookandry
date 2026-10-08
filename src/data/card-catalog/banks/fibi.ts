// The FIBI group: First International (הבנק הבינלאומי, Masav 31), Poalei Agudat
// Israel (PAGI, 52), Otsar HaHayal (14) and U-Bank (26). One rate table covers
// all four: "ללקוחות הבינלאומי לרבות סניפי פאגי, יובנק ואוצר החייל".
// Transcribed from docs/research/issuers/banks-others.md, §3.
//
// Rates: the card-credit table in FIBI's notice "שינוי ריבית 1.9.26", pages 3–4,
// in force from 6/9/2026 on a base rate (prime) of 4.75%. Each cell prints the
// margin and the nominal / מתואמת pair; per-tier list rates. Transcribed:
// - קרדיט (Cal/Diners, Isracard/Amex "קרדיט בתשלומים", Max "אשראי קרדיט") as
//   `credit`: fixed when granted (the table's * footnote), m = 12;
// - Cal "ויזה פלוס 30" (m = 4) and Max "פלוס 30" (m = 12) as `deferred`. Max's
//   פלוס 30 row prints no margins: its nominals equal Max קרדיט's, and every
//   nominal in the table is prime + margin (§3.5), so the קרדיט margins are used.
// Revolving (חח"ק, עדיף, תשלום עדיף, ישראקרדיט, Cal choice) is part 2; loans
// (אקספרס, אשראי מהיר, חודש חופש, הלוואה), spreads and foreign deferral are not
// deal types here. Cal "חודש פלוס / דיינרס לארג'" has no deal type of its own.
//
// Tiers: the columns are Platinum, Gold and Other (Cal/Diners), World Elite /
// Centurion, Platinum, Gold / Amex Green and Other (Isracard/Amex), Platinum, Gold
// and International (Max). Only tiers the column plainly names, or that are plainly
// neither Platinum nor Gold for "Other", are mapped. Left out as ambiguous: Cal
// Business Gold, Isracard Gold Business, Amex Gold and Gold+, Diners Mastercard,
// Max Gold Business, and the prepaid, digital and debit tiers.
// Accrual: Isracard קרדיט בתשלומים counts whole months from the regular billing
// date, 30/360 (§3.5a); FIBI's own Cal and Max agreements were not read, and the
// same rule is recorded for them.
import type { BankRateRow, CatalogBank, CatalogRate } from '../types';
import { at, forTiers, pair, primeRate } from './shared';

const NOTICE =
  'https://www.fibi.co.il/media/sq0jt4lh/%D7%94%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%A9%D7%99%D7%A0%D7%95%D7%99-%D7%A8%D7%99%D7%91%D7%99%D7%AA-1-9-26.pdf';
const TYPES = 'https://www.fibi.co.il/private/creditcard/types/';
const TARIFF =
  'https://www.fibi.co.il/media/bwxl02kb/%D7%97%D7%9C%D7%A7-6-%D7%9B%D7%A8%D7%98%D7%99%D7%A1%D7%99-%D7%90%D7%A9%D7%A8%D7%90%D7%99-31.pdf';
const ISRACARD_FIBI = 'https://digital.isracard.co.il/globalassets/isracard/pdf/beinleumi25.pdf';
const AMEX_FIBI = 'https://he.americanexpress.co.il/globalassets/pdf/taarifonbenleumijan26.pdf';

const NOT_READ =
  'Accrual (whole months from the regular billing date) and 30/360 are from FIBI’s Isracard agreement (§3.5a); FIBI’s own Cal and Max agreements were not read (UNCONFIRMED).';
const PLUS30 =
  'Accrual and day count are not stated (UNCONFIRMED): the regular billing date and actual/365 are recorded.';

const CREDIT = {
  quality: 'exact',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
} as const;
const credit = (margin: string, nominal: string, effective: string, caveat?: string): CatalogRate => ({
  ...primeRate(CREDIT, margin, at(NOTICE, pair(nominal, effective))),
  ...(caveat ? { caveat } : {}),
});
/** Cal and Diners, and Max: the rule is the Isracard agreement's. */
const creditNotRead = (margin: string, nominal: string, effective: string): CatalogRate =>
  credit(margin, nominal, effective, NOT_READ);
const plus30 = (compounding: 12 | 4, margin: string, nominal: string, effective: string): CatalogRate => ({
  ...primeRate(
    { ...CREDIT, compounding, dayCount: 'actual/365', fixedAtPurchase: false },
    margin,
    at(NOTICE, pair(nominal, effective)),
  ),
  caveat: PLUS30,
});

const CAL_OTHER = ['basic', 'local', 'international', 'business'];

const rates: BankRateRow[] = [
  // Cal / Diners: קרדיט*.
  ...forTiers('cal', ['platinum'], 'credit', creditNotRead('5.00', '9.75', '10.20')),
  ...forTiers('cal', ['gold'], 'credit', creditNotRead('8.25', '13.00', '13.80')),
  ...forTiers('cal', CAL_OTHER, 'credit', creditNotRead('9.50', '14.25', '15.22')),
  ...forTiers('diners', ['platinum'], 'credit', creditNotRead('5.00', '9.75', '10.20')),
  ...forTiers('diners', ['classic'], 'credit', creditNotRead('9.50', '14.25', '15.22')),
  // Cal: ויזה פלוס 30, quarterly.
  ...forTiers('cal', ['platinum'], 'deferred', plus30(4, '4.50', '9.25', '9.58')),
  ...forTiers('cal', ['gold'], 'deferred', plus30(4, '7.50', '12.25', '12.83')),
  ...forTiers('cal', CAL_OTHER, 'deferred', plus30(4, '9.00', '13.75', '14.48')),

  // Isracard / American Express: קרדיט בתשלומים*.
  ...forTiers('isracard', ['world_elite'], 'credit', credit('3.25', '8.00', '8.30')),
  ...forTiers('amex', ['centurion'], 'credit', credit('3.25', '8.00', '8.30')),
  ...forTiers('isracard', ['platinum'], 'credit', credit('5.00', '9.75', '10.20')),
  ...forTiers('amex', ['platinum'], 'credit', credit('5.00', '9.75', '10.20')),
  ...forTiers('isracard', ['gold'], 'credit', credit('8.25', '13.00', '13.80')),
  ...forTiers('amex', ['green'], 'credit', credit('8.25', '13.00', '13.80')),
  ...forTiers('isracard', ['local', 'international', 'business'], 'credit', credit('9.50', '14.25', '15.22')),
  ...forTiers('amex', ['blue', 'credit'], 'credit', credit('9.50', '14.25', '15.22')),

  // Max: אשראי קרדיט, and פלוס 30.
  ...forTiers('max', ['platinum'], 'credit', creditNotRead('6.50', '11.25', '11.85')),
  ...forTiers('max', ['gold'], 'credit', creditNotRead('8.25', '13.00', '13.80')),
  ...forTiers('max', ['international'], 'credit', creditNotRead('9.50', '14.25', '15.22')),
  ...forTiers('max', ['platinum'], 'deferred', plus30(12, '6.50', '11.25', '11.85')),
  ...forTiers('max', ['gold'], 'deferred', plus30(12, '8.25', '13.00', '13.80')),
  ...forTiers('max', ['international'], 'deferred', plus30(12, '9.50', '14.25', '15.22')),
];

/*
 * ריבית פיגורים is "הריבית המרבית": the bank's highest rate on unapproved debit
 * balances. From 6/9/2026: prime 4.75 + 9.90 + "תוספת ריבית חריגה 3.50%",
 * quarterly.
 */
const lateRate: CatalogRate = {
  basis: { kind: 'prime', margin: '13.40' },
  quality: 'max',
  compounding: 4,
  dayCount: 'actual/365',
  accrues: 'billing_date',
  fixedAtPurchase: false,
  source: at(NOTICE, pair('18.15', '19.43')),
  caveat:
    'Day count not stated (UNCONFIRMED): account interest is daily, so actual/365 is recorded. The formula gives 19.42% at m = 4; the published 19.43% is kept.',
};

/** The group's shared figures. Beyond Platinum's 1% FX fee is FIBI's own programme, not a catalog club. */
const group = {
  issuers: ['cal', 'diners', 'amex', 'isracard', 'max'],
  fxFee: { cal: '3', isracard: '2.7', amex: '2.5' },
  lateRate,
  rates,
  sources: {
    issuers: at(TYPES, 'Visa (Cal), Diners, Amex, Isracard, Max, debit, and FIBI’s own Beyond card.'),
    fxFee: {
      cal: at(TARIFF, 'Part 6: 3% over the representative rate.'),
      isracard: at(
        ISRACARD_FIBI,
        'Isracard’s schedule for FIBI-group cards: 2.7% from 1.7.2022 (isracard.md §3).',
      ),
      amex: at(
        AMEX_FIBI,
        'American Express’s schedule for FIBI-group cards: 2.5% from 1.7.2026 (isracard.md §3).',
      ),
    },
  },
} satisfies Omit<CatalogBank, 'id' | 'name'>;

export const fibi: CatalogBank = {
  id: '31',
  name: { he: 'הבנק הבינלאומי', en: 'First International (FIBI)' },
  ...group,
};
export const pagi: CatalogBank = {
  id: '52',
  name: { he: 'בנק פאגי', en: 'PAGI (Poalei Agudat Israel)' },
  ...group,
};
export const otsarHahayal: CatalogBank = {
  id: '14',
  name: { he: 'בנק אוצר החייל', en: 'Otsar HaHayal' },
  ...group,
};
export const ubank: CatalogBank = { id: '26', name: { he: 'יובנק', en: 'U-Bank' }, ...group };
