import { describe, expect, it } from 'vitest';

import { NAMESPACES, resources } from './index';

/**
 * Parity between the two locales, enforced rather than audited.
 *
 * `tsc` already makes a MISSING Hebrew key a compile error, via the
 * `satisfies`-shaped assignment in ./index.ts. It cannot see any of the things
 * below, all of which render as a visible defect rather than a crash:
 *
 *  - a plural set missing `_two`, which in Hebrew is not a nicety: "2 payments"
 *    falls back to `_other` and reads wrong to every native speaker
 *  - a `_many` written from memory, a category CLDR REMOVED for Hebrew in v42,
 *    so the key is simply never selected
 *  - a translation that drops an interpolation, leaving a sentence with a hole
 *    where the amount should be
 *  - a `<Trans>` tag that does not match, which renders the tag as literal text
 *
 * Every one of those ships silently in the second language, which is the one
 * nobody on the team reads back.
 */

type Flat = Record<string, string>;

function flatten(value: unknown, prefix = ''): Flat {
  if (typeof value === 'string') return { [prefix]: value };
  if (typeof value !== 'object' || value === null) return {};

  const out: Flat = {};
  for (const [key, child] of Object.entries(value)) {
    Object.assign(out, flatten(child, prefix === '' ? key : `${prefix}.${key}`));
  }
  return out;
}

const LOCALES = ['en', 'he'] as const;

const FLAT = Object.fromEntries(
  LOCALES.map((lng) => [lng, Object.fromEntries(NAMESPACES.map((ns) => [ns, flatten(resources[lng][ns])]))]),
) as Record<(typeof LOCALES)[number], Record<(typeof NAMESPACES)[number], Flat>>;

/** The plural categories each language actually has, per CLDR. */
const CATEGORIES = {
  // `two` and `many` are NOT English categories; writing either ships a key
  // i18next will never select.
  en: ['one', 'other'],
  // CLDR 42 REMOVED `many` for Hebrew. `two` is mandatory. Zero falls under
  // `other`, so every `_other` must also read naturally for none.
  he: ['one', 'two', 'other'],
} as const;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const pluralBase = (key: string): string | undefined => {
  const match = PLURAL_SUFFIX.exec(key);
  return match === null ? undefined : key.slice(0, -match[0].length);
};

/** `{{count}}`, `{{amount}}` - the holes a translation must keep. */
const interpolations = (value: string): string[] =>
  [...value.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1] ?? '').sort();

/** `<spent></spent>`, `<0>` - the slots <Trans> fills with elements. */
const transTags = (value: string): string[] =>
  [...value.matchAll(/<\/?([\w\d]+)\s*\/?>/g)].map((m) => m[1] ?? '').sort();

describe.each(NAMESPACES)('%s', (ns) => {
  const en = FLAT.en[ns];
  const he = FLAT.he[ns];

  it('has no key in Hebrew that English does not have', () => {
    // The typed direction is already a compile error. This is the other one: a
    // Hebrew key with a typo is dead weight nothing ever reads.
    const singular = (keys: string[]) => new Set(keys.map((k) => pluralBase(k) ?? k));
    const enBases = singular(Object.keys(en));

    const orphans = [...singular(Object.keys(he))].filter((k) => !enBases.has(k));

    expect(orphans).toEqual([]);
  });

  it('translates every key, with nothing left empty', () => {
    const untranslated = Object.keys(en).filter((key) => (he[key] ?? '').trim() === '');

    expect(untranslated).toEqual([]);
  });

  describe.each(LOCALES)('%s plurals', (lng) => {
    const flat = FLAT[lng][ns];
    const bases = new Set(
      Object.keys(flat)
        .map(pluralBase)
        .filter((base): base is string => base !== undefined),
    );

    it('carries exactly the categories the language has', () => {
      const missing: string[] = [];
      const extra: string[] = [];

      for (const base of bases) {
        for (const category of CATEGORIES[lng]) {
          if (!(`${base}_${category}` in flat)) missing.push(`${base}_${category}`);
        }
        for (const key of Object.keys(flat)) {
          const suffix = PLURAL_SUFFIX.exec(key);
          if (suffix === null || pluralBase(key) !== base) continue;
          const category = suffix[0].slice(1);
          if (!(CATEGORIES[lng] as readonly string[]).includes(category)) extra.push(key);
        }
      }

      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it('never defines a plural key AND a bare one for the same base', () => {
      // i18next resolves the bare key first for `count: 0` in some versions;
      // having both makes which one wins a version detail rather than a choice.
      expect([...bases].filter((base) => base in flat)).toEqual([]);
    });
  });
});

/**
 * Strings that are legitimately the same in both locales.
 *
 * An allowlist rather than a blanket exemption, because the check it guards -
 * "this string was never actually translated" - is the one an untranslated
 * string passes by looking perfectly fine in the language the reviewer reads.
 */
const IDENTICAL_BY_DESIGN = new Set([
  // A brand name. Transliterating it would be worse than leaving it.
  'common:app.name',
  // Endonyms: a language picker shows each language in ITS OWN language, so
  // "English" stays English on a Hebrew screen and עברית stays Hebrew on an
  // English one. Translating these is the actual bug.
  'common:language.en',
  'common:language.he',
  // "1 {{from}} =" - punctuation and interpolations, no words to translate.
  'common:tx.rateSentence',
  // A provider's name, shown so the user can tell which source a rate came from.
  'common:tx.sourceErapi',
]);

describe('nothing was left untranslated', () => {
  it.each(NAMESPACES)('%s has no English text sitting in the Hebrew bundle', (ns) => {
    /*
     * The failure mode this catches is a copy-paste: a key added to `en` and
     * duplicated into `he` to satisfy the type checker, intending to translate
     * it later. `tsc` is satisfied, the suite is green, and the string ships in
     * English to the only users who cannot read it.
     */
    const en = FLAT.en[ns];
    const he = FLAT.he[ns];

    const untranslated = Object.keys(en).filter(
      (key) => he[key] === en[key] && !IDENTICAL_BY_DESIGN.has(`${ns}:${key}`),
    );

    expect(untranslated).toEqual([]);
  });

  it.each(NAMESPACES)('%s writes Hebrew in Hebrew letters', (ns) => {
    // The complement: a string that DIFFERS from the English but still has no
    // Hebrew in it - a placeholder, a TODO, a half-finished edit.
    const he = FLAT.he[ns];

    const latinOnly = Object.entries(he)
      .filter(([key]) => !IDENTICAL_BY_DESIGN.has(`${ns}:${key}`))
      .filter(([, value]) => !/[֐-׿]/.test(value))
      .map(([key]) => key);

    expect(latinOnly).toEqual([]);
  });
});

describe('interpolations survive translation', () => {
  it.each(NAMESPACES)('%s keeps every placeholder', (ns) => {
    const en = FLAT.en[ns];
    const he = FLAT.he[ns];

    const mismatched = Object.entries(en)
      .filter(([key]) => key in he)
      .filter(([key, value]) => {
        const translated = he[key];
        if (translated === undefined) return false;

        const expected = interpolations(value);
        const actual = interpolations(translated);

        /*
         * `{{count}}` is exempt in the SMALL forms, in both languages.
         *
         * "One payment left" and "תנועה אחת" spell the number out, which is
         * what a native speaker writes - and Hebrew's `_two` ("שתי תנועות")
         * has no other option, since the numeral is part of the word. Every
         * other placeholder must survive, and nothing may be invented: a
         * translation carrying `{{amount}}` where English had `{{date}}`
         * renders the wrong value, not a missing one.
         */
        const spellsTheNumber = key.endsWith('_one') || key.endsWith('_two');
        const required = spellsTheNumber ? expected.filter((name) => name !== 'count') : expected;

        return (
          required.some((name) => !actual.includes(name)) || actual.some((name) => !expected.includes(name))
        );
      })
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });

  it.each(NAMESPACES)('%s keeps every <Trans> tag', (ns) => {
    const en = FLAT.en[ns];
    const he = FLAT.he[ns];

    const mismatched = Object.entries(en)
      .filter(([key]) => key in he)
      .filter(([key, value]) => {
        const translated = he[key];
        return translated !== undefined && transTags(value).join() !== transTags(translated).join();
      })
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });

  it('checks the Hebrew plural forms too, not just the ones English happens to have', () => {
    /*
     * `_two` exists ONLY in Hebrew, so the comparison above - which walks the
     * English keys - never looks at it. A `_two` that dropped its {{count}}
     * would render "payments left" with no number, for exactly the quantity
     * Hebrew added the form for.
     */
    const he = FLAT.he.common;

    const twos = Object.keys(he).filter((key) => key.endsWith('_two'));
    expect(twos.length).toBeGreaterThan(0);

    const broken = twos.filter((key) => {
      const other = he[`${key.slice(0, -4)}_other`];
      const value = he[key];
      if (other === undefined || value === undefined) return true;
      // `_two` may legitimately spell the number out ("שני תשלומים") rather
      // than interpolate it. What it may not do is interpolate something the
      // `_other` form does not have.
      return interpolations(value).some((name) => !interpolations(other).includes(name));
    });

    expect(broken).toEqual([]);
  });
});
