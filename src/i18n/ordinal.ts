const SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

/**
 * A day of the month as a sentence says it: "10th" in English, plain "10" in
 * Hebrew, where the sentence carries it ("ב־10 לחודש").
 */
export function ordinalDay(day: number, language: string): string {
  if (!language.startsWith('en')) return String(day);
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(day);
  return `${String(day)}${SUFFIX[rule] ?? 'th'}`;
}
