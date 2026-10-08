// Mercantile Discount Bank (בנק מרכנתיל דיסקונט, Masav 17).
// Transcribed from docs/research/issuers/banks-others.md, §2.
// Cal / Diners only. Mercantile publishes no card-credit rates (§2.4), so it has
// no `rates`. Its contract text matches Discount's, but Discount's קרדיט page
// was not seen for Mercantile, so no deal rules are set over Cal's; its billing
// dates are UNCONFIRMED (§2.2).
import type { CatalogBank } from '../types';
import { at } from './shared';

const TARIFF = 'https://www.mercantile.co.il/media/bpxixiww/taarifon_private_6_11026.pdf';

export const mercantile: CatalogBank = {
  id: '17',
  name: { he: 'בנק מרכנתיל', en: 'Mercantile Bank' },
  issuers: ['cal', 'diners'],
  fxFee: { cal: '3' },
  sources: {
    issuers: at(
      TARIFF,
      'The card chapter is "חלק 6 (1) - כרטיסי חיוב \'כאל\'", with no Max chapter. Cards: Visa (מרכנתיל סמייל), Mastercard, Diners, Diners Extra Home, FlyAll, Mercantile First.',
    ),
    fxFee: { cal: at(TARIFF, 'Part 6, 01/10/2026: 3% over the representative rate.') },
  },
};
