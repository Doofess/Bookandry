/**
 * The banks an account can be at, by the code every Israeli account number
 * starts with (קוד בנק: the 12 in 12-689-123456).
 *
 * The codes are Masav's, the clearing house every bank transfer and standing
 * order goes through (masav.co.il, participants list, October 2026). Three
 * groups:
 *
 * - The banks in Israel today.
 * - Codes still printed on older cheques and statements, of banks that have
 *   since merged into another: their accounts live on at the new bank, often
 *   under the old code.
 * - The Arab banks that clear through Masav: Palestinian and Jordanian banks
 *   with branches in the West Bank and East Jerusalem. Their names are kept in
 *   Arabic too, as their customers know them.
 *
 * Card companies, wallets and clearing services also have Masav codes; they
 * do not hold current accounts, so they are not here.
 */

export type BankGroup = 'israel' | 'merged' | 'arab';

export type Bank = {
  /** The Masav code, without leading zeros: "4", "12". */
  readonly code: string;
  readonly he: string;
  readonly en: string;
  /** The Arab banks' own name. */
  readonly ar?: string;
  readonly group: BankGroup;
  /** For a merged bank: the code of the bank it is now part of. */
  readonly now?: string;
};

export const BANKS: readonly Bank[] = [
  { code: '12', he: 'בנק הפועלים', en: 'Bank Hapoalim', group: 'israel' },
  { code: '10', he: 'בנק לאומי', en: 'Bank Leumi', group: 'israel' },
  { code: '11', he: 'בנק דיסקונט', en: 'Discount Bank', group: 'israel' },
  { code: '20', he: 'בנק מזרחי טפחות', en: 'Mizrahi Tefahot Bank', group: 'israel' },
  { code: '31', he: 'הבנק הבינלאומי', en: 'First International Bank', group: 'israel' },
  { code: '17', he: 'בנק מרכנתיל', en: 'Mercantile Bank', group: 'israel' },
  { code: '54', he: 'בנק ירושלים', en: 'Bank of Jerusalem', group: 'israel' },
  { code: '46', he: 'בנק מסד', en: 'Bank Massad', group: 'israel' },
  { code: '4', he: 'בנק יהב', en: 'Bank Yahav', group: 'israel' },
  { code: '9', he: 'בנק הדואר', en: 'Postal Bank', group: 'israel' },
  { code: '18', he: 'וואן זירו', en: 'One Zero Digital Bank', group: 'israel' },
  { code: '3', he: 'בנק אש ישראל', en: 'Esh Israel Bank', group: 'israel' },
  { code: '22', he: 'סיטיבנק', en: 'Citibank', group: 'israel' },
  { code: '23', he: 'HSBC', en: 'HSBC', group: 'israel' },
  { code: '39', he: 'בנק סטייט אוף אינדיה', en: 'State Bank of India', group: 'israel' },

  { code: '13', he: 'בנק אגוד', en: 'Union Bank (Igud)', group: 'merged', now: '20' },
  { code: '14', he: 'בנק אוצר החייל', en: 'Otsar Ha-Hayal', group: 'merged', now: '31' },
  { code: '26', he: 'יובנק', en: 'U-Bank', group: 'merged', now: '31' },
  { code: '52', he: 'בנק פועלי אגודת ישראל', en: 'Poalei Agudat Israel Bank', group: 'merged', now: '31' },
  {
    code: '34',
    he: 'בנק ערבי ישראלי',
    en: 'Arab Israel Bank',
    ar: 'البنك العربي الإسرائيلي',
    group: 'merged',
    now: '10',
  },
  { code: '68', he: 'בנק מוניציפל (דקסיה)', en: 'Municipal Bank (Dexia)', group: 'merged', now: '17' },

  { code: '49', he: 'ערב בנק', en: 'Arab Bank', ar: 'البنك العربي', group: 'arab' },
  { code: '89', he: 'בנק פלסטין', en: 'Bank of Palestine', ar: 'بنك فلسطين', group: 'arab' },
  {
    code: '38',
    he: 'קומרשיאל בנק אוף פלסטין',
    en: 'Commercial Bank of Palestine',
    ar: 'البنك التجاري الفلسطيني',
    group: 'arab',
  },
  { code: '82', he: 'בנק אל-קודס', en: 'Al Quds Bank', ar: 'بنك القدس', group: 'arab' },
  {
    code: '76',
    he: 'בנק ההשקעות הפלסטיני',
    en: 'Palestine Investment Bank',
    ar: 'بنك الاستثمار الفلسطيني',
    group: 'arab',
  },
  {
    code: '73',
    he: 'הבנק האסלאמי הערבי',
    en: 'Arab Islamic Bank',
    ar: 'البنك الإسلامي العربي',
    group: 'arab',
  },
  { code: '66', he: 'בנק קהיר עמאן', en: 'Cairo Amman Bank', ar: 'بنك القاهرة عمان', group: 'arab' },
  { code: '84', he: 'בנק הדיור (האוזינג)', en: 'Housing Bank', ar: 'بنك الإسكان', group: 'arab' },
  { code: '37', he: 'בנק אוף ג׳ורדן', en: 'Bank of Jordan', ar: 'بنك الأردن', group: 'arab' },
  { code: '43', he: 'הבנק האהלי הירדני', en: 'Jordan Ahli Bank', ar: 'البنك الأهلي الأردني', group: 'arab' },
  {
    code: '93',
    he: 'בנק ג׳ורדן כווית',
    en: 'Jordan Kuwait Bank',
    ar: 'البنك الأردني الكويتي',
    group: 'arab',
  },
  {
    code: '67',
    he: 'הבנק העקרי המצרי הערבי',
    en: 'Egyptian Arab Land Bank',
    ar: 'البنك العقاري المصري العربي',
    group: 'arab',
  },
];

const BY_CODE = new Map(BANKS.map((bank) => [bank.code, bank]));

/** "012" and "12" alike. */
export function bankByCode(code: string): Bank | undefined {
  return BY_CODE.get(code.replace(/^0+(?=\d)/, ''));
}

/** The bank's name in the UI language; the Arab banks' Arabic name is shown beside it, never instead. */
export function bankName(bank: Bank, language: string): string {
  return language.startsWith('he') ? bank.he : bank.en;
}

/** The longest a branch number is (Masav: 3 digits; 4 leaves room). */
export const BRANCH_MAX_DIGITS = 4;
/** Israeli account numbers run to 9 digits; the Arab banks' to 13. */
export const ACCOUNT_MAX_DIGITS = 13;
const ACCOUNT_MIN_DIGITS = 2;

/** Digits only, from what was typed or pasted: spaces, dashes and bidi marks dropped. */
export function digitsOf(text: string): string {
  return text.replace(/[\s‎‏‪-‮⁦-⁩./-]/g, '');
}

export function isBranchNumber(text: string): boolean {
  return new RegExp(`^\\d{1,${String(BRANCH_MAX_DIGITS)}}$`).test(text);
}

export function isAccountNumber(text: string): boolean {
  return new RegExp(`^\\d{${String(ACCOUNT_MIN_DIGITS)},${String(ACCOUNT_MAX_DIGITS)}}$`).test(text);
}

/**
 * An account as Israelis write it - "12-689-123456", "12/689/123456",
 * "בנק 12 סניף 689 חשבון 123456" - split into its three parts, when it is one.
 *
 * Only when the first part is a known bank code: pasting a lone number must not
 * be mistaken for one written with its bank and branch.
 */
export function parseAccountText(
  text: string,
): { readonly bank: string; readonly branch: string; readonly number: string } | undefined {
  const parts = text.match(/\d+/g);
  if (parts?.length !== 3) return undefined;
  const [bank = '', branch = '', number = ''] = parts;
  const known = bankByCode(bank);
  // At least four digits of account: "12 345 678" is more likely one number typed with spaces.
  if (known === undefined || !isBranchNumber(branch) || number.length < 4 || !isAccountNumber(number)) {
    return undefined;
  }
  return { bank: known.code, branch: String(Number(branch)), number };
}

/**
 * The last four digits, which is how an account is told apart in a list:
 * "··4567". Isolated left to right, so a Hebrew line does not move the dots
 * to the far side of the digits.
 */
export function accountTail(number: string): string {
  return `\u2066··${number.slice(-4)}\u2069`;
}
