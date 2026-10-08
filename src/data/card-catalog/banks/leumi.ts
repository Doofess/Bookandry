// Bank Leumi (בנק לאומי לישראל, Masav 10).
// Transcribed from docs/research/issuers/banks-leumi-hapoalim-mizrahi.md, Part L.
// Leumi publishes no card-credit rates (§L.5): the bank lends, and the rates are
// personal, so it has no `rates`. Its 3–36-payment קרדיט track and the
// voucher-arrival accrual (§L.4–L.5) are not set over the card companies' deals
// here: whether 19–36 deals and re-pricing apply at Leumi is UNCONFIRMED (gap 8).
import type { CatalogBank } from '../types';
import { at } from './shared';

const TERMS = 'https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/hozim%20ahidim/319-56_ACC.pdf';
const TARIFF = 'https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.xlsx';
const ACCOUNT_TERMS =
  'https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/General/chozim%20achidim/310-93%20-%20%D7%AA%D7%99%D7%A7%D7%95%D7%9F%20%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA%20%D7%90%D7%95%D7%9F%20%D7%A7%D7%95%D7%9C%20(002)%20-%20%D7%9E%D7%95%D7%A0%D7%92%D7%A9-PDFUA.pdf';

const FX_A =
  'Tariff ch. 6(א), 01/10/2026: 3% on Leumi cards (Max-, Cal- and Isracard-operated); FIRST 2%, UNITED 1.5%.';

export const leumi: CatalogBank = {
  id: '10',
  name: { he: 'בנק לאומי', en: 'Bank Leumi' },
  issuers: ['max', 'cal', 'isracard', 'diners'],
  fxFee: { max: '3', cal: '3', isracard: '3', diners: '3' },
  // UNITED 1.5% has no tier in the catalog; the FlyCard and FlyAll figures on Leumi's
  // product page are by club and year, with the operator of each UNCONFIRMED (§L.1, §L.3).
  fxFeeTiers: [
    {
      issuer: 'max',
      tier: 'first',
      fee: '2',
      source: at(TARIFF, `${FX_A} The catalog's only First tier is Max's.`),
    },
  ],
  foreignPosting: 'immediate',
  lateRate: {
    basis: null,
    quality: 'max',
    compounding: 4,
    dayCount: 'actual/365',
    accrues: 'billing_date',
    fixedAtPurchase: false,
    source: at(
      ACCOUNT_TERMS,
      'Card debts bear late interest "כמפורט בתנאי הניהול" (319-56 §30): the legal maximum for the kind of credit, else the rate in Leumi’s "לוח גילוי נאות", on daily balances (310-93 §6.2). The figure is UNCONFIRMED: the table was not found online.',
    ),
  },
  sources: {
    issuers: at(
      TARIFF,
      'Ch. 6 names Max (formerly Leumi Card) and Cal and Isracard as operators of Leumi cards; Diners has its own chapter, 6(ב). American Express is not a Leumi bank card (leumi.co.il/he/credit-cards-amex). The current split between operators is UNCONFIRMED.',
    ),
    foreignPosting: at(
      TERMS,
      '§11.1: foreign vouchers are debited "בסמוך לאחר מועד הגעת החיוב", not on the monthly date, unless the customer asked for and was granted the monthly date.',
    ),
    fxFee: {
      max: at(TARIFF, FX_A),
      cal: at(TARIFF, FX_A),
      isracard: at(TARIFF, FX_A),
      diners: at(TARIFF, 'Tariff ch. 6(ב), 01/10/2026: Diners, representative rate + 3%.'),
    },
  },
};
