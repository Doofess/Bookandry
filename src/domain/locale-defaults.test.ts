import { describe, expect, it } from 'vitest';

import { detectLocaleDefaults, FALLBACK_DEFAULTS } from './locale-defaults';

describe('detectLocaleDefaults', () => {
  it('falls back when there is nothing to go on', () => {
    expect(detectLocaleDefaults([])).toEqual(FALLBACK_DEFAULTS);
  });

  it.each([
    [['he-IL'], 'he', 'ILS'],
    [['he'], 'he', 'ILS'],
    // The deprecated ISO 639-1 code for Hebrew, still emitted by some builds.
    [['iw-IL'], 'he', 'ILS'],
    [['en-US'], 'en', 'USD'],
    [['en-GB'], 'en', 'GBP'],
    [['de-DE'], 'en', 'EUR'],
    [['fr-FR'], 'en', 'EUR'],
    [['ja-JP'], 'en', 'JPY'],
    [['ar-AE'], 'en', 'AED'],
    [['pt-BR'], 'en', 'BRL'],
  ])('reads %s as %s / %s', (languages, language, currency) => {
    expect(detectLocaleDefaults(languages)).toEqual({ language, currency });
  });

  it('takes the currency from the region even when the language is not Hebrew', () => {
    // An Israeli on an English phone. The currency is knowable; the language
    // preference has already been stated.
    expect(detectLocaleDefaults(['en-IL'])).toEqual({ language: 'en', currency: 'ILS' });
  });

  it('prefers Hebrew anywhere in the list', () => {
    expect(detectLocaleDefaults(['en-US', 'he-IL'])).toEqual({ language: 'he', currency: 'USD' });
  });

  it('uses the first region that maps', () => {
    expect(detectLocaleDefaults(['eo', 'de-DE', 'en-US'])).toEqual({ language: 'en', currency: 'EUR' });
  });

  it('handles an extended tag', () => {
    expect(detectLocaleDefaults(['en-Latn-US'])).toEqual({ language: 'en', currency: 'USD' });
  });

  it('survives a malformed tag rather than throwing into first paint', () => {
    // Intl.Locale throws on these, and navigator.languages is not guaranteed
    // well formed. A crash here is a white screen on the very first launch.
    expect(() => detectLocaleDefaults(['', '!!!', 'e', 'x_Y_Z'])).not.toThrow();
    expect(detectLocaleDefaults(['!!!', 'en-US'])).toEqual({ language: 'en', currency: 'USD' });
    expect(detectLocaleDefaults(['he_IL'])).toEqual({ language: 'he', currency: 'ILS' });
  });

  it('defaults an unmapped region to USD rather than guessing', () => {
    expect(detectLocaleDefaults(['en-ZW'])).toEqual({ language: 'en', currency: 'USD' });
  });
});
