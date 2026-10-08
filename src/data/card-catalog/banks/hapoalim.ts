// Bank Hapoalim (בנק הפועלים, Masav 12).
// Transcribed from docs/research/issuers/banks-leumi-hapoalim-mizrahi.md, Part H.
// Hapoalim publishes no card-credit rates: they are personal (§H.5), so it has
// no `rates`. Its three card agreements (Isracard and Amex, Cal, Max; August
// 2026) share one §19, whose קרדיט rules replace the card companies' own
// (cross-bank finding 2): those go in `dealOverrides`.
import type { CatalogBank, CatalogRate, DealRule, IssuerId } from '../types';
import { at, pair } from './shared';

const AGR_ISRACARD_AMEX =
  'https://www.bankhapoalim.co.il/api/media/w5hcmjmo/%D7%AA%D7%A0%D7%90%D7%99%D7%9D-%D7%9B%D7%9C%D7%9C%D7%99%D7%9D-%D7%94%D7%A1%D7%9B%D7%9D-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%99%D7%A9%D7%A8%D7%90%D7%9B%D7%A8%D7%98-%D7%95%D7%90%D7%9E%D7%A7%D7%A1-%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98-2026.pdf';
const AGR_CAL =
  'https://www.bankhapoalim.co.il/api/media/xzdbw1qj/%D7%AA%D7%A0%D7%90%D7%99%D7%9D-%D7%9B%D7%9C%D7%9C%D7%99%D7%99%D7%9D-%D7%9C%D7%94%D7%A1%D7%9B%D7%9D-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9B%D7%90%D7%9C-%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98-2026.pdf';
const AGR_MAX =
  'https://www.bankhapoalim.co.il/api/media/35unnga3/%D7%AA%D7%A0%D7%90%D7%99%D7%9D-%D7%9B%D7%9C%D7%9C%D7%99%D7%99%D7%9D-%D7%9C%D7%94%D7%A1%D7%9B%D7%9D-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9E%D7%A7%D7%A1-%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98-2026.pdf';
const SUMMARY =
  'https://www.bankhapoalim.co.il/api/media/yuaj4c4e/%D7%AA%D7%9E%D7%A6%D7%99%D7%AA-%D7%A2%D7%99%D7%A7%D7%A8%D7%99-%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%9B%D7%A8%D7%98%D7%99%D7%A1%D7%99-%D7%90%D7%A9%D7%A8%D7%90%D7%99-%D7%95%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9E%D7%99%D7%99%D7%93%D7%99.pdf';
const TARIFF = 'https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/146.PDF';
const RATE_NOTICE = 'https://www.bankhapoalim.co.il/api/media/kbznep3e/ribit_bank_israel_01092026.pdf';

const JUMBLED =
  'Short card tariff, 01/10/2026. Its text layer is jumbled: figures were paired label to number (UNCONFIRMED at line level).';

/** הסדר קרדיט בתשלומים (§19.2): prime on the day the voucher is received + the bank's risk margin, per customer. */
const installmentsRate = (url: string): CatalogRate => ({
  basis: null,
  quality: 'typical',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
  source: at(
    url,
    '§19.2.3: prime on the day the voucher is received + "תוספת הסיכון להסדר קרדיט בתשלומים", fixed per deal; whole months from the regular billing date, 30/360, equal payments. Personal: the request form leaves the nominal, מתואמת and margin blank.',
  ),
});

/** §19.2.2: 3–18 payments at ₪25 principal each (₪75 a deal); 19–36 at ₪50 (₪950 a deal). */
const installments = (
  issuer: IssuerId,
  url: string,
): { issuer: IssuerId; deal: Partial<DealRule> & { kind: DealRule['kind'] } }[] => [
  {
    issuer,
    deal: {
      kind: 'credit',
      payments: { min: 3, max: 18 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      rate: installmentsRate(url),
      source: at(url),
    },
  },
  {
    issuer,
    deal: {
      kind: 'long_credit',
      payments: { min: 19, max: 36 },
      minDealMinor: 95_000,
      minPaymentMinor: 5_000,
      rate: installmentsRate(url), // fixed for the deal: no re-pricing, on Max cards too
      source: at(url),
    },
  },
];

export const hapoalim: CatalogBank = {
  id: '12',
  name: { he: 'בנק הפועלים', en: 'Bank Hapoalim' },
  issuers: ['isracard', 'amex', 'cal', 'max', 'diners'],
  fxFee: { isracard: '2.90', max: '2.90', cal: '2.90', amex: '2.5', diners: '3' },
  foreignPosting: 'immediate',
  // ריבית פיגורים (agreements §1): the highest maximum rate on a shekel current account
  // with no approved line. Day count is not stated; the account rates are daily (§H.7).
  lateRate: {
    basis: { kind: 'prime', margin: '11.60' },
    quality: 'max',
    compounding: 4,
    dayCount: 'actual/365',
    accrues: 'billing_date',
    fixedAtPurchase: false,
    source: at(RATE_NOTICE, pair('16.35', '17.38')),
  },
  // The Diners (Cal) cards' agreement was not read, so Diners keeps Cal's own rules.
  dealOverrides: [
    ...installments('isracard', AGR_ISRACARD_AMEX),
    ...installments('amex', AGR_ISRACARD_AMEX),
    ...installments('cal', AGR_CAL),
    ...installments('max', AGR_MAX),
  ],
  sources: {
    issuers: at(
      SUMMARY,
      '"בשיתוף עם אחת מחברות כרטיסי האשראי (כגון, כאל, מקס וישראכרט)"; Amex in the Isracard and Amex agreement; Diners-only lines in the short card tariff (146.PDF).',
    ),
    foreignPosting: at(
      AGR_ISRACARD_AMEX,
      '§8.4: foreign deals are billed "ביום העסקים הבא לאחר קליטת החיובים מחו"ל", "על אף קיום מועד חיוב לגבי כלל העסקאות האחרות".',
    ),
    fxFee: {
      isracard: at(TARIFF, JUMBLED),
      max: at(TARIFF, JUMBLED),
      cal: at(TARIFF, JUMBLED),
      amex: at(TARIFF, JUMBLED),
      diners: at(TARIFF, JUMBLED),
    },
  },
};
