// Bank Yahav (בנק יהב לעובדי המדינה, Masav 4).
// Transcribed from docs/research/issuers/banks-others.md, §6.
// Yahav publishes no card-credit rates (§6.7), so it has no `rates`. The bank
// sets קרדיט, 30+ and loan rates; revolving on Cal cards is Cal's (§7.14.3,
// part 2). Not recorded: the value of Cal's "המספר הקובע" for re-pricing long
// deals (§7.17.1, UNCONFIRMED); and whether Yahav's קרדיט rate is fixed
// ("יחושבו באופן יחסי בהתאם לשינויים בריבית הבסיסית", §7.12.2, UNCONFIRMED).
// No Max cards were seen.
import type { CatalogBank } from '../types';
import { at } from './shared';

const ISRACARD_PAGE = 'https://www.bank-yahav.co.il/credit-cards/isracard/';
const ISRACARD_YAHAV = 'https://digital.isracard.co.il/globalassets/isracard/pdf/forms/yahav.pdf';
const AMEX_YAHAV = 'https://he.americanexpress.co.il/globalassets/pdf/taarifonyahavaprilnew26.pdf';
const OVERDRAFT = 'https://www.bank-yahav.co.il/media/fcdhywzx/pdf-ashrai.pdf';

export const yahav: CatalogBank = {
  id: '4',
  name: { he: 'בנק יהב', en: 'Bank Yahav' },
  issuers: ['isracard', 'amex', 'cal', 'diners'],
  fxFee: { isracard: '2.7', amex: '2.5' },
  // The bank's rate, figure unpublished: late interest on a bank card is the account's (§10.5).
  lateRate: {
    basis: null,
    quality: 'max',
    compounding: 4,
    dayCount: 'actual/365',
    accrues: 'billing_date',
    fixedAtPurchase: false,
    source: at(
      OVERDRAFT,
      'Late interest is the bank’s: the Cal agreement (§19.3) sets the legal maximum, or as Cal or Yahav choose, actual/365, capped at the Fair Credit Law maximum. Yahav’s account benchmarks from 03/09/2026 (§6.7, §10.5): over the limit 13.55% / 14.25% (prime + 8.80), no-limit account 13.75% / 14.48%, both charged quarterly.',
    ),
    caveat:
      'Which figure binds a card bill is UNCONFIRMED, and the Cal agreement is not known to bind Isracard and Amex cards too.',
  },
  sources: {
    issuers: at(
      ISRACARD_PAGE,
      'Isracard (Mastercard, Gold, Platinum, Business, World Elite, debit), American Express, and Cal (Visa, Diners, Mastercard) on the Yahav Cal page.',
    ),
    fxFee: {
      isracard: at(
        ISRACARD_YAHAV,
        'Isracard’s schedule for Yahav cards: 2.7% from 1.4.2025 (isracard.md §3).',
      ),
      amex: at(
        AMEX_YAHAV,
        'American Express’s schedule for Yahav cards: 2.5% from 1.7.2026 (isracard.md §3).',
      ),
    },
  },
};
