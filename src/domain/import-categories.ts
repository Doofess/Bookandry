import type { Category } from '@/types/domain';

/**
 * Categories some rows announce in their own words, so a reading never has to
 * guess them: a loan says it is one. Checked before the model's suggestion -
 * which once filed "מקס איט פיננסים", a card company's loan, under eating out -
 * and after the household's own history, which is the person's choice.
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
