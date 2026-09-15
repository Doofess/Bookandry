/**
 * The pre-paint boot mirror.
 *
 * Settings are owned by Dexie (§3), which is async — so the very first frame
 * would render in the wrong language and theme. The inline script in index.html
 * reads this flat `localStorage` key before paint to avoid that.
 *
 * It is explicitly a CACHE, never a source of truth. It is deliberately NOT
 * Zustand's `{state, version}` envelope: that shape is an implementation detail
 * which changes across persist majors and whenever `partialize`/`migrate` is
 * edited, and first paint must not depend on it.
 *
 * Every access is wrapped: private mode, blocked site data and corrupt JSON must
 * degrade to defaults, never throw into the render.
 */
export const BOOT_KEY = 'gb.boot';

export type Language = 'en' | 'he';
export type Theme = 'light' | 'dark' | 'system';

export type BootMirror = { lang: Language; theme: Theme };

export const DEFAULT_BOOT: BootMirror = { lang: 'en', theme: 'system' };

function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'he';
}

function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function readBootMirror(): BootMirror {
  try {
    const raw = localStorage.getItem(BOOT_KEY);
    if (!raw) return DEFAULT_BOOT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BOOT;
    const o = parsed as Record<string, unknown>;
    return {
      lang: isLanguage(o['lang']) ? o['lang'] : DEFAULT_BOOT.lang,
      theme: isTheme(o['theme']) ? o['theme'] : DEFAULT_BOOT.theme,
    };
  } catch {
    return DEFAULT_BOOT;
  }
}

/**
 * Written synchronously by the same gateway that writes the Dexie settings row,
 * NOT by a store subscription. A subscription is a React effect, so it lands
 * after paint — which loses the race against an import-replace reload or a
 * clear-all-data, leaving one full frame in the wrong direction.
 */
export function writeBootMirror(mirror: BootMirror): void {
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify(mirror));
  } catch {
    /* storage blocked; the app still works, first paint just falls back */
  }
}

export const dirFor = (lang: Language): 'rtl' | 'ltr' => (lang === 'he' ? 'rtl' : 'ltr');

export function resolveDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

/** Applies language, direction and theme to <html>. Mirrors the inline boot script. */
export function applyDocumentChrome({ lang, theme }: BootMirror): void {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = dirFor(lang);
  const dark = resolveDark(theme);
  el.classList.toggle('dark', dark);
  el.style.colorScheme = dark ? 'dark' : 'light';
}
