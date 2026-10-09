/**
 * One key for the ways one merchant is printed: "שופרסל דיל 123 ת"א" and
 * "שופרסל דיל 45 ת״א" are the same shop, at another till.
 *
 * Lower case, with digits, punctuation and quotes taken out, the legal
 * suffixes (בע"מ, Ltd, Inc, LLC) dropped, and the word סניף dropped with the
 * token after it (its number or its name). City names are KEPT: merging two
 * businesses is worse than missing a match.
 *
 * A key of nothing but a payment service or a transfer word is no key:
 * "PAYPAL *4029357733" and "ביט 0527654321" are payments to someone, and
 * which someone is the digits this throws away. Keyed as "paypal" or "ביט",
 * every such payment would file the next one.
 */

const LEGAL: ReadonlySet<string> = new Set(['בעמ', 'ltd', 'inc', 'llc']);

/** Words that, alone, say how money moved and not to whom. */
const PAYMENT_ONLY: ReadonlySet<string> = new Set([
  'paypal',
  'pp',
  'bit',
  'ביט',
  'בביט',
  'paybox',
  'פייבוקס',
  'בפייבוקס',
  'העברה',
  'העברת',
  'transfer',
  'to',
  'from',
  'ל',
  'ב',
  'מ',
]);

export function merchantKey(text: string): string {
  const tokens = text
    .toLowerCase()
    // בע"מ in any of its spellings, before the quotes go.
    .replace(/בע["״'׳]?מ/g, 'בעמ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== '');
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    if (token === 'סניף') {
      i += 1; // the branch's number or name
      continue;
    }
    const letters = token.replace(/\p{N}/gu, '');
    if (letters !== '' && !LEGAL.has(letters)) kept.push(letters);
  }
  return kept.every((token) => PAYMENT_ONLY.has(token)) ? '' : kept.join(' ');
}
