import type { Currency } from '@/types/money';

/**
 * What to pre-select on the first screen the user ever sees.
 *
 * Pre-selected, never forced: first run is the ONLY moment changing the base
 * currency is free rather than an irreversible history rewrite, so the choice
 * has to be visible and changeable - but a Hebrew speaker in Israel should not
 * have to change both fields before they can start.
 *
 * Pure, and fed the raw `navigator.languages` array, so the detection is
 * testable without a browser and the same logic can be asserted for a dozen
 * locales in one file.
 */

export type Language = 'en' | 'he';

export type LocaleDefaults = {
  readonly language: Language;
  readonly currency: Currency;
};

export const FALLBACK_DEFAULTS: LocaleDefaults = { language: 'en', currency: 'USD' };

/**
 * Region to currency.
 *
 * Deliberately partial. It covers the places this app is plausibly used and
 * falls back to USD elsewhere, which is a pre-selection rather than a claim -
 * getting Denmark wrong costs one tap, and a 200-row table would still be wrong
 * for the places that changed currency last year.
 */
const REGION_CURRENCY: Readonly<Record<string, Currency>> = {
  IL: 'ILS',
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  CH: 'CHF',
  JP: 'JPY',
  CN: 'CNY',
  HK: 'HKD',
  SG: 'SGD',
  KR: 'KRW',
  IN: 'INR',
  TH: 'THB',
  PH: 'PHP',
  ID: 'IDR',
  MY: 'MYR',
  BR: 'BRL',
  MX: 'MXN',
  ZA: 'ZAR',
  AE: 'AED',
  SA: 'SAR',
  EG: 'EGP',
  KW: 'KWD',
  TR: 'TRY',
  RU: 'RUB',
  UA: 'UAH',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  IS: 'ISK',
  // The euro area, spelled out: there is no way to derive it from the tag.
  AT: 'EUR',
  BE: 'EUR',
  CY: 'EUR',
  DE: 'EUR',
  EE: 'EUR',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GR: 'EUR',
  HR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  SI: 'EUR',
  SK: 'EUR',
};

/** Language subtags that mean Hebrew, including the deprecated ISO 639-1 code. */
const HEBREW_TAGS = new Set(['he', 'iw']);

function parse(tag: string): { language?: string; region?: string } {
  try {
    // Handles 'he-IL', 'en-Latn-US' and 'iw' alike, and canonicalises the
    // deprecated codes - but it THROWS on a malformed tag, and navigator
    // .languages is not guaranteed to be well formed.
    const locale = new Intl.Locale(tag);
    return { language: locale.language, region: locale.region };
  } catch {
    const parts = tag.split(/[-_]/);
    return { language: parts[0]?.toLowerCase(), region: parts.at(-1)?.toUpperCase() };
  }
}

export function detectLocaleDefaults(languages: readonly string[]): LocaleDefaults {
  let currency: Currency | undefined;

  for (const tag of languages) {
    if (typeof tag !== 'string' || tag.length === 0) continue;
    const { language, region } = parse(tag);

    // The first region that maps wins, even if the language does not.
    // An Israeli using an English phone is `en-IL`: the currency is knowable,
    // the language preference is already stated.
    if (currency === undefined && region !== undefined) {
      currency = REGION_CURRENCY[region];
    }

    if (language !== undefined && HEBREW_TAGS.has(language)) {
      // Hebrew with no region at all still means Israel in practice.
      return { language: 'he', currency: currency ?? 'ILS' };
    }
  }

  return { language: 'en', currency: currency ?? FALLBACK_DEFAULTS.currency };
}
