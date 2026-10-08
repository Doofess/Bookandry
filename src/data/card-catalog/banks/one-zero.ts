// One Zero (וואן זירו – הבנק הדיגיטלי הראשון, Masav 18).
// Transcribed from docs/research/issuers/banks-others.md, §7.
// Its credit rates, card fees and billing dates are UNCONFIRMED: the tariff
// PDFs return HTTP 403 to automated clients. So no rates and no late rate.
import type { CatalogBank } from '../types';
import { at } from './shared';

const CARD = 'https://www.onezerobank.com/special/5587';

export const oneZero: CatalogBank = {
  id: '18',
  name: { he: 'וואן זירו', en: 'One Zero' },
  issuers: ['isracard'],
  // isracard.md §3 lists One Zero at 2%; One Zero's own page gives 0% on One plans and
  // 2% on cash withdrawn abroad, which is not this fee. The bank's own page is used.
  fxFee: { isracard: '0' },
  foreignPosting: 'billing_date',
  sources: {
    issuers: at(CARD, '"יוצרים קשר עם חברת האשראי, ישראכארט"; cashback "בהתאם לתנאי ישראכארט".'),
    foreignPosting: at(CARD, '"הרכישות במט״ח יחוייבו במועד החיוב הקבוע של הכרטיס ולא מיידית".'),
    fxFee: {
      isracard: at(
        CARD,
        '"0% עמלת המרת מט״ח בכרטיס במסלולי One. למעט משיכת מט״ח במזומן" (2%), on foreign sites too; "ההטבה קבועה ולא מוגבלת בזמן".',
      ),
    },
  },
};
