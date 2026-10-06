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

/** A row's category from its own text, when it says one; undefined when it does not. */
export function categoryFromText(
  row: { readonly kind: 'expense' | 'income'; readonly description: string },
  categories: readonly Category[],
): string | undefined {
  // A loan received is income, and Loans is where repayments go: only an expense is filed there.
  if (row.kind !== 'expense' || !LOAN_WORDS.test(row.description)) return undefined;
  return categories.some((c) => c.id === LOANS_CATEGORY && c.kind === 'expense' && c.isArchived === 0)
    ? LOANS_CATEGORY
    : undefined;
}
