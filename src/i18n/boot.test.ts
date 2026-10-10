// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyLanguage,
  applyTheme,
  BOOT_KEY,
  DEFAULT_BOOT,
  dirFor,
  readBootMirror,
  resolveDark,
  writeBootMirror,
} from './boot';

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  vi.unstubAllGlobals();
});

describe('readBootMirror', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readBootMirror()).toEqual(DEFAULT_BOOT);
  });

  it('reads a valid mirror', () => {
    localStorage.setItem(BOOT_KEY, JSON.stringify({ lang: 'he', theme: 'dark' }));
    expect(readBootMirror()).toEqual({ lang: 'he', theme: 'dark' });
  });

  it('falls back to defaults on corrupt JSON rather than throwing', () => {
    // This runs before first paint. Throwing here is a blank page.
    localStorage.setItem(BOOT_KEY, '{not json');
    expect(readBootMirror()).toEqual(DEFAULT_BOOT);
  });

  it('rejects unknown values field by field', () => {
    localStorage.setItem(BOOT_KEY, JSON.stringify({ lang: 'fr', theme: 'neon' }));
    expect(readBootMirror()).toEqual(DEFAULT_BOOT);
  });

  it('keeps a valid field when its sibling is invalid', () => {
    localStorage.setItem(BOOT_KEY, JSON.stringify({ lang: 'he', theme: 'neon' }));
    expect(readBootMirror()).toEqual({ lang: 'he', theme: 'system' });
  });

  it('ignores a non-object payload', () => {
    localStorage.setItem(BOOT_KEY, '"he"');
    expect(readBootMirror()).toEqual(DEFAULT_BOOT);
  });

  it('survives storage access throwing (private mode, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readBootMirror()).toEqual(DEFAULT_BOOT);
  });
});

describe('writeBootMirror', () => {
  it('round-trips', () => {
    writeBootMirror({ lang: 'he', theme: 'light' });
    expect(readBootMirror()).toEqual({ lang: 'he', theme: 'light' });
  });

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => {
      writeBootMirror({ lang: 'en', theme: 'dark' });
    }).not.toThrow();
  });
});

describe('dirFor', () => {
  it('maps Hebrew to rtl and English to ltr', () => {
    expect(dirFor('he')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });
});

describe('resolveDark', () => {
  it('honours explicit choices without consulting the media query', () => {
    expect(resolveDark('dark')).toBe(true);
    expect(resolveDark('light')).toBe(false);
  });

  it('follows the system preference when set to system', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    expect(resolveDark('system')).toBe(true);

    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
    expect(resolveDark('system')).toBe(false);
  });
});

describe('applyLanguage and applyTheme', () => {
  it('sets lang, dir, the dark class and color-scheme', () => {
    applyLanguage('he');
    applyTheme('dark');
    const el = document.documentElement;
    expect(el.lang).toBe('he');
    expect(el.dir).toBe('rtl');
    expect(el.classList.contains('dark')).toBe(true);
    expect(el.style.colorScheme).toBe('dark');
  });

  it('clears the dark class when switching to light', () => {
    applyTheme('dark');
    applyTheme('light');
    const el = document.documentElement;
    expect(el.classList.contains('dark')).toBe(false);
    expect(el.style.colorScheme).toBe('light');
  });

  it('sets the status bar to the theme’s paper, and follows a change at once (Review Focus)', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.setAttribute('media', '(prefers-color-scheme: light)');
    meta.content = '#000000';
    document.head.append(meta);

    applyTheme('dark');
    expect(meta.content).toBe('#1A1510');
    expect(meta.hasAttribute('media')).toBe(false);

    applyTheme('light');
    expect(meta.content).toBe('#F6F2EA');
    meta.remove();
  });

  it('never throws when the page has no theme-color meta', () => {
    expect(() => {
      applyTheme('dark');
    }).not.toThrow();
  });

  it('never touches the theme when the language changes', () => {
    // The bug: a language change re-applied the theme read at startup.
    applyTheme('light');
    applyLanguage('he');
    applyLanguage('en');
    const el = document.documentElement;
    expect(el.dir).toBe('ltr');
    expect(el.classList.contains('dark')).toBe(false);
    expect(el.style.colorScheme).toBe('light');
  });
});
