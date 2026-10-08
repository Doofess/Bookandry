// Bank Yahav (בנק יהב לעובדי המדינה, Masav 4).
// Transcribed from docs/research/issuers/banks-others.md, §6.
// Yahav publishes no card-credit rates (§6.7), so it has no `rates`. The bank
// sets קרדיט, 30+ and loan rates; revolving on Cal cards is Cal's (§7.14.3,
// part 2). Not recorded: the Cal agreement's late-interest rule (§19.3), which
// is not known to bind Isracard and Amex cards too; the value of Cal's
// "המספר הקובע" for re-pricing long deals (§7.17.1, UNCONFIRMED); and whether
// Yahav's קרדיט rate is fixed ("יחושבו באופן יחסי בהתאם לשינויים בריבית
// הבסיסית", §7.12.2, UNCONFIRMED). No Max cards were seen.
import type { CatalogBank } from '../types';
import { at } from './shared';

const ISRACARD_PAGE = 'https://www.bank-yahav.co.il/credit-cards/isracard/';
const ISRACARD_YAHAV = 'https://digital.isracard.co.il/globalassets/isracard/pdf/forms/yahav.pdf';

export const yahav: CatalogBank = {
  id: '4',
  name: { he: 'בנק יהב', en: 'Bank Yahav' },
  issuers: ['isracard', 'amex', 'cal', 'diners'],
  fxFee: { isracard: '2.7' },
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
    },
  },
};
