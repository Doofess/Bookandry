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

/**
 * The stored mirror, or undefined when nothing has been written yet.
 *
 * The distinction matters exactly once, and it is the first launch: "no mirror"
 * is not the same as "English". Collapsing the two gave an Israeli opening the
 * app for the first time an English, left-to-right wizard whose own language
 * toggle already said Hebrew.
 */
export function readStoredBootMirror(): BootMirror | undefined {
  try {
    const raw = localStorage.getItem(BOOT_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const o = parsed as Record<string, unknown>;
    return {
      lang: isLanguage(o['lang']) ? o['lang'] : DEFAULT_BOOT.lang,
      theme: isTheme(o['theme']) ? o['theme'] : DEFAULT_BOOT.theme,
    };
  } catch {
    return undefined;
  }
}

/** The stored mirror, falling back to the browser's own language on first launch. */
export function readBootMirror(): BootMirror {
  const stored = readStoredBootMirror();
  if (stored !== undefined) return stored;
  return { lang: detectBootLanguage(), theme: DEFAULT_BOOT.theme };
}

/**
 * Hebrew if any preferred language is Hebrew.
 *
 * Kept here rather than in `domain/locale-defaults` because this runs before
 * anything else and must mirror the inline script in index.html exactly - two
 * implementations of one rule, on purpose, because one of them cannot import.
 */
export function detectBootLanguage(): Language {
  try {
    const tags = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
    for (const tag of tags) {
      const code = tag.slice(0, 2).toLowerCase();
      // 'iw' is the deprecated ISO 639-1 code for Hebrew, still emitted.
      if (code === 'he' || code === 'iw') return 'he';
    }
  } catch {
    /* navigator unavailable; fall through */
  }
  return 'en';
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

/*
 * Language and theme are applied separately, on purpose. They are two choices,
 * and changing one must never touch the other: when one function applied both,
 * every language change re-applied whatever theme its caller had to hand - the
 * one read at startup - and undid a theme picked since.
 */

/** Applies language and direction to <html>. Mirrors the inline boot script. */
export function applyLanguage(lang: Language): void {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = dirFor(lang);
}

/** The paper, as the status bar shows it (§3). Mirrors the inline boot script. */
export const THEME_PAPER = { light: '#F6F2EA', dark: '#1A1510' } as const;

/** Sets the one theme-color meta, dropping any media query an older index.html put on it. */
export function setThemeColor(color: string): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta === null) return;
  meta.removeAttribute('media');
  meta.setAttribute('content', color);
}

/** Applies the theme to <html>, and the status bar to its paper. Mirrors the inline boot script. */
export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  const dark = resolveDark(theme);
  el.classList.toggle('dark', dark);
  el.style.colorScheme = dark ? 'dark' : 'light';
  setThemeColor(dark ? THEME_PAPER.dark : THEME_PAPER.light);
}
