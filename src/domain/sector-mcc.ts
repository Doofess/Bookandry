import { foldSearch } from './mcc';

/**
 * A card company's business sector (ענף), as its export prints it, to one
 * representative business type: "מסעדות" is 5812. Matched whole, after
 * folding case, niqqud, punctuation and spacing - never by a part of the
 * text, so "מזון לחיות" is not taken for groceries.
 *
 * Common sector words and the groupings the card sites use, none yet
 * confirmed against a real export: the table grows as exports are seen. A
 * sector it does not know is not dropped - it goes to Claude as a hint.
 */
export const SECTORS: readonly (readonly [sector: string, mcc: string])[] = [
  ['מסעדות', '5812'],
  ['מסעדות, קפה וברים', '5812'],
  ['מסעדות ובתי קפה', '5812'],
  ['בתי קפה', '5812'],
  ['מזון מהיר', '5814'],
  ['סופרמרקטים', '5411'],
  ['סופרמרקט', '5411'],
  ['מרכולים', '5411'],
  ['מזון', '5411'],
  ['מזון וצריכה', '5411'],
  ['מזון ומשקאות', '5411'],
  ['דלק', '5541'],
  ['תחנות דלק', '5541'],
  ['דלק, חשמל וגז', '5541'],
  ['תחבורה', '4111'],
  ['תחבורה ציבורית', '4111'],
  ['תחבורה ורכבים', '4111'],
  ['מוניות', '4121'],
  ['חניה', '7523'],
  ['חניונים', '7523'],
  ['רפואה', '8011'],
  ['רופאים', '8011'],
  ['בתי מרקחת', '5912'],
  ['פארם', '5912'],
  ['רפואה ובתי מרקחת', '5912'],
  ['תקשורת', '4814'],
  ['שירותי תקשורת', '4814'],
  ['סלולר', '4814'],
  ['מוצרי חשמל', '5732'],
  ['חשמל ומחשבים', '5732'],
  ['אלקטרוניקה', '5732'],
  ['ביגוד', '5651'],
  ['הלבשה', '5651'],
  ['אופנה', '5651'],
  ['ביגוד והנעלה', '5651'],
  ['הנעלה', '5661'],
  ['ריהוט', '5712'],
  ['עיצוב הבית', '5712'],
  ['ריהוט ובית', '5712'],
  ['תיירות', '4722'],
  ['טיסות ותיירות', '4722'],
  ['סוכנויות נסיעות', '4722'],
  ['תעופה', '4511'],
  ['טיסות', '4511'],
  ['בתי מלון', '7011'],
  ['מלונות', '7011'],
  ['ביטוח', '6300'],
  ['ביטוח ופיננסים', '6300'],
  ['בידור', '7999'],
  ['פנאי ובידור', '7999'],
  ['פנאי, בידור וספורט', '7999'],
  ['קולנוע', '7832'],
  ['ספורט', '7997'],
  ['חדרי כושר', '7997'],
  ['חינוך', '8299'],
  ['בתי ספר', '8299'],
  ['לימודים', '8299'],
  ['ספרים', '5942'],
  ['ספרים ודפוס', '5942'],
  ['קוסמטיקה', '5977'],
  ['קוסמטיקה וטיפוח', '5977'],
  ['צעצועים', '5945'],
  ['ילדים', '5641'],
  ['חיות מחמד', '5995'],
  ['עירייה וממשלה', '9399'],
  ['ממשלה', '9399'],
  ['restaurants', '5812'],
  ['fast food', '5814'],
  ['supermarkets', '5411'],
  ['groceries', '5411'],
  ['fuel', '5541'],
  ['gas stations', '5541'],
  ['transportation', '4111'],
  ['pharmacy', '5912'],
  ['medical', '8011'],
  ['communications', '4814'],
  ['electronics', '5732'],
  ['clothing', '5651'],
  ['fashion', '5651'],
  ['travel', '4722'],
  ['airlines', '4511'],
  ['hotels', '7011'],
  ['insurance', '6300'],
  ['entertainment', '7999'],
  ['education', '8299'],
];

/** As compared: folded like search, with punctuation as spaces. */
const normal = (text: string): string => foldSearch(text.replace(/[^\p{L}\p{N}\s]/gu, ' '));

const BY_SECTOR: ReadonlyMap<string, string> = new Map(SECTORS.map(([sector, mcc]) => [normal(sector), mcc]));

/** The business type a sector stands for, or undefined when the table does not know it. */
export function sectorMcc(text: string): string | undefined {
  const key = normal(text);
  return key === '' ? undefined : BY_SECTOR.get(key);
}
