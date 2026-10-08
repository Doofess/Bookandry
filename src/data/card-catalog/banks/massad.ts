// Bank Massad (בנק מסד, Masav 46; FIBI group, the teachers' bank).
// Transcribed from docs/research/issuers/banks-others.md, §4.
//
// Rates: Massad's "תעריפי אשראי" table, in force from 10/7/2026, the latest
// posted on 2026-10-08. It is on prime 5.00% and was not updated for the
// 3.9.2026 cut, so its margins are stored as printed with quality 'derived'
// (today's rate is the margin on today's prime). Its pairs are on the old prime,
// so they are not in the note; the data test checks each against the formula.
// Transcribed: Isracard/Amex "קרדיט בתשלומים" and Max "אשראי קרדיט / קרדיט חו"ל /
// פלוס 30" (one row) as `credit` and `deferred`. Revolving, loans and foreign
// deferral are left out, as at FIBI; so are the same ambiguous tiers (see fibi.ts).
//
// Not recorded: Cal (a Cal & Diners notice exists, but the table has no Cal
// section: UNCONFIRMED, §4.1); late interest and fees (not read, §4.2–4.10).
import type { BankRateRow, CatalogBank, CatalogRate } from '../types';
import { at, forTiers, primeRate } from './shared';

const TYPES = 'https://www.bankmassad.co.il/private/creditcard/types/';
const TABLE =
  'https://www.bankmassad.co.il/media/xqzdqegt/%D7%AA%D7%A2%D7%A8%D7%99%D7%A4%D7%99-%D7%90%D7%A9%D7%A8%D7%90%D7%99.pdf';
const ISRACARD_MASSAD = 'https://digital.isracard.co.il/globalassets/isracard/pdf/masad25.pdf';

const OLD_PRIME = 'table on prime 5.00%';
const CREDIT = {
  quality: 'derived',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
} as const;
const credit = (margin: string): CatalogRate => primeRate(CREDIT, margin, at(TABLE, OLD_PRIME));
const plus30 = (margin: string): CatalogRate =>
  primeRate({ ...CREDIT, dayCount: 'actual/365', fixedAtPurchase: false }, margin, at(TABLE, OLD_PRIME));

// Published on prime 5.00 (nominal / מתואמת): +1.00 6.00 / 6.17; +3.00 8.00 / 8.30;
// +7.00 12.00 / 12.68; +8.50 13.50 / 14.37 (Isracard/Amex); +6.50 11.50 / 12.13;
// +8.25 13.25 / 14.09; +9.50 14.50 / 15.50 (Max).
const rates: BankRateRow[] = [
  ...forTiers('isracard', ['world_elite'], 'credit', credit('1.00')),
  ...forTiers('amex', ['centurion'], 'credit', credit('1.00')),
  ...forTiers('isracard', ['platinum'], 'credit', credit('3.00')),
  ...forTiers('amex', ['platinum'], 'credit', credit('3.00')),
  ...forTiers('isracard', ['gold'], 'credit', credit('7.00')),
  ...forTiers('amex', ['green'], 'credit', credit('7.00')),
  ...forTiers('isracard', ['local', 'international', 'business'], 'credit', credit('8.50')),
  ...forTiers('amex', ['blue', 'credit'], 'credit', credit('8.50')),
  ...forTiers('max', ['platinum'], 'credit', credit('6.50')),
  ...forTiers('max', ['gold'], 'credit', credit('8.25')),
  ...forTiers('max', ['international'], 'credit', credit('9.50')),
  ...forTiers('max', ['platinum'], 'deferred', plus30('6.50')),
  ...forTiers('max', ['gold'], 'deferred', plus30('8.25')),
  ...forTiers('max', ['international'], 'deferred', plus30('9.50')),
];

export const massad: CatalogBank = {
  id: '46',
  name: { he: 'בנק מסד', en: 'Bank Massad' },
  issuers: ['isracard', 'amex', 'max'],
  fxFee: { isracard: '2.7' },
  rates,
  sources: {
    issuers: at(
      TYPES,
      'Max; Mastercard and American Express "through Isracard Group"; Ashmoret, the teachers’ card (its issuer UNCONFIRMED). Seen through WebFetch.',
    ),
    fxFee: {
      isracard: at(
        ISRACARD_MASSAD,
        'Isracard’s schedule for Massad cards: 2.7% from 1.7.2022 (isracard.md §3).',
      ),
    },
  },
};
