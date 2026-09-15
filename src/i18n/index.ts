import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { readBootMirror, type Language } from './boot';
import enCommon from './locales/en/common.json';
import heCommon from './locales/he/common.json';

export const defaultNS = 'common' as const;

/**
 * Resources are BUNDLED, not lazily imported.
 *
 * Two locales across a handful of namespaces is ~25-40KB gzipped. Lazy
 * `import()` would emit JSON assets that Workbox does NOT precache by default
 * (`globPatterns` covers js/css/html), so switching to Hebrew while offline
 * would fail — unacceptable for an offline-first app.
 */
export const resources = {
  en: { common: enCommon },
  he: { common: heCommon },
} as const;

/**
 * `he` is structurally required to match `en`. Typing CustomTypeOptions off `en`
 * (below, in types/i18next.d.ts) plus this assertion makes a missing or misspelt
 * Hebrew key a `tsc --noEmit` failure rather than a runtime fallback nobody sees.
 */
const _heMatchesEn: (typeof resources)['en'] = resources.he;
export const HE_MATCHES_EN = _heMatchesEn;

export async function initI18n(): Promise<typeof i18n> {
  const { lang } = readBootMirror();

  await i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    supportedLngs: ['en', 'he'],
    defaultNS,
    ns: ['common'],
    keySeparator: '.',
    nsSeparator: ':',
    // React already escapes; double-escaping mangles currency symbols and quotes.
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    react: { useSuspense: false },
    debug: false,
    // A throwing handler in dev is what actually proves "no hardcoded strings"
    // (§12) — a manual audit in a late phase does not.
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          throw new Error(`[i18n] missing key "${ns}:${key}" for ${lngs.join(',')}`);
        }
      : undefined,
  });

  return i18n;
}

export function changeLanguage(lang: Language): Promise<unknown> {
  return i18n.changeLanguage(lang);
}

export default i18n;
