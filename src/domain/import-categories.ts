import type { Category } from '@/types/domain';

/**
 * Categories some rows announce in their own words, so a reading never has to
 * guess them: a loan says it is one, and some names are known to everyone -
 * Spotify is a subscription, Lime a ride, Max a card company. Checked before
 * the model's suggestion, which once filed "מקס איט פיננסים" under eating out
 * and HBO Max under rent.
 *
 * The loan words come after the household's own history, which is the
 * person's choice. The well-known names come BEFORE it (`knownCategory`): a
 * history built by readings that got them wrong would otherwise keep them
 * wrong for good, and nobody files Spotify under rent on purpose.
 */

const LOANS_CATEGORY = 'cat.loans';

/** הלוואה in its spellings, a repayment (פירעון), or a loan in English. */
const LOAN_WORDS = /הלוו?א(?:ה|ות)|פי?רעון|\bloans?\b/i;

/**
 * A card company by name and nothing more: on a bank statement, the card's
 * monthly bill; on its own statement, its lending. Neither is a shop or a
 * restaurant - "מקס איט פיננסים" was read as eating out (the איט as "eat") -
 * and which of the two it is the line does not say: Other, for the person.
 */
const CARD_COMPANY =
  /מקס\s*איט|ישראכרט|לאומי\s*קארד|אמריקן\s*אקספרס|דיינרס|כאל(?![\u0590-\u05FF])|\bmax\s*it\b|\bisracard\b/i;
const OTHER_EXPENSE = 'cat.otherExpense';

/** A row's category from its own text, when it says one; undefined when it does not. */
export function categoryFromText(
  row: {
    readonly kind: 'expense' | 'income';
    readonly description: string;
    readonly plan?: { readonly mode: string } | null;
  },
  categories: readonly Category[],
): string | undefined {
  // A loan received is income, and Loans is where repayments go: only an expense is filed there.
  const loan = row.plan?.mode === 'loan' || LOAN_WORDS.test(row.description);
  if (row.kind !== 'expense') return undefined;
  const usable = (id: string) =>
    categories.some((c) => c.id === id && c.kind === 'expense' && c.isArchived === 0) ? id : undefined;
  if (loan) return usable(LOANS_CATEGORY);
  return CARD_COMPANY.test(row.description) ? usable(OTHER_EXPENSE) : undefined;
}

/** Not a Hebrew letter: Hebrew has no word boundary `\b` can see. */
const NH = '(?<![\\u0590-\\u05FF])';
const NHE = '(?![\\u0590-\\u05FF])';
const word = (hebrew: string): string => `${NH}${hebrew}${NHE}`;

/** Names that say what they are, and where they go. First match wins. */
const KNOWN: readonly (readonly [RegExp, string])[] = [
  // Buying foreign currency: its own thing, not shopping and not travel.
  [
    new RegExp(
      `${word('רכישת\\s*מט["״׳\']?ח')}|${word('מט["״׳\']?ח')}|המרת\\s*מטבע|currency\\s*exchange`,
      'i',
    ),
    'cat.currencyExchange',
  ],
  // Streaming and music: a subscription - HBO Max is not the card company.
  [
    /spotify|netflix|\bhbo\b|disney\s*\+|disney\s*plus|apple\.com\/bill|itunes|youtube\s*premium|prime\s*video|deezer|ספוטיפיי|נטפליקס/i,
    'cat.subscriptions',
  ],
  // Rides and parking.
  [
    /\blime\b|\bgett\b|\byango\b|\buber\b|\bbolt\b|moovit|\bpango\b|cellopark|רב[\s-]?קו|פנגו|סלופארק|מוביט/i,
    'cat.transport',
  ],
  // A gym or a sports club.
  [
    new RegExp(
      `\\bgym\\b|gold'?s\\s*gym|holmes\\s*place|crossfit|fitness|${word('גולדס')}|${word('הולמס\\s*פלייס')}|${word("ג['׳]ים")}|${word('קרוספיט')}|${word('חדר\\s*כושר')}|${word('מכון\\s*כושר')}`,
      'i',
    ),
    'cat.fitness',
  ],
  // A card company by name: its bill or its loan - see CARD_COMPANY.
  [
    new RegExp(
      `${word('מקס')}|${word('ישראכרט')}|${word('כאל')}|לאומי\\s*קארד|אמריקן\\s*אקספרס|${word('דיינרס')}|^\\s*max(?:\\s|$)|\\bmax\\s*it\\b|\\bisracard\\b`,
      'i',
    ),
    'cat.otherExpense',
  ],
];

/**
 * A well-known name's category, when the household has it - checked before
 * the household's history. A loan says so first: "מקס - הלוואה" is a loan.
 */
export function knownCategory(
  row: { readonly kind: 'expense' | 'income'; readonly description: string },
  categories: readonly Category[],
): string | undefined {
  if (row.kind !== 'expense' || LOAN_WORDS.test(row.description)) return undefined;
  const usable = (id: string) =>
    categories.some((c) => c.id === id && c.kind === 'expense' && c.isArchived === 0) ? id : undefined;
  for (const [pattern, id] of KNOWN) {
    if (pattern.test(row.description)) return usable(id);
  }
  return undefined;
}
