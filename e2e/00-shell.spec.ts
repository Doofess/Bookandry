import { expect, test } from '@playwright/test';

/**
 * Phase 0 exit gate. §11's "PWA config" and "pnpm test passes" are not
 * observable claims on their own; these are.
 */

const ROUTES = ['/', '/chart', '/profiles', '/settings'] as const;

test.describe('@smoke0 app shell', () => {
  for (const route of ROUTES) {
    test(`renders ${route} with no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('navigation', { name: /primary|ניווט/i })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('exposes exactly one primary navigation landmark', async ({ page }) => {
    await page.goto('/');
    // Two copies of the nav (one mobile, one desktop) would double the
    // aria-current bookkeeping and confuse screen readers.
    await expect(page.getByRole('navigation', { name: /primary|ניווט/i })).toHaveCount(1);
  });

  test('never scrolls horizontally', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('@rtl boot', () => {
  test('applies dir=rtl and lang=he before first paint', async ({ page }) => {
    // Seed the flat mirror the inline boot script reads. This is the key that
    // must NOT be Zustand's {state,version} envelope.
    await page.addInitScript(() => {
      localStorage.setItem('gb.boot', JSON.stringify({ lang: 'he', theme: 'dark' }));
    });
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl');
  });

  test('survives a corrupt boot mirror without throwing', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gb.boot', '{not json');
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    expect(errors).toEqual([]);
  });

  test('renders Hebrew glyphs in Heebo, not a fallback', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gb.boot', JSON.stringify({ lang: 'he', theme: 'light' }));
    });
    await page.goto('/');
    // document.fonts.ready resolves before a lazily-triggered subset arrives, so
    // load the exact faces for the exact text first.
    await page.evaluate(async () => {
      await document.fonts.load('400 96px "Heebo Variable"', 'שלוםעולם');
      await document.fonts.load('400 96px "Inter Variable"', '0123456789');
      await document.fonts.ready;
    });

    // document.fonts.check() answers "is a covering face loaded", NOT "was it
    // selected" - it returns true even when the stack fell back. Measure instead.
    const result = await page.evaluate(() => {
      const measure = (family: string, text: string, tabular = false) => {
        const s = document.createElement('span');
        s.style.position = 'absolute';
        s.style.visibility = 'hidden';
        s.style.whiteSpace = 'pre';
        s.style.fontSize = '96px';
        s.style.fontWeight = '400';
        s.style.fontFamily = family;
        if (tabular) s.style.fontVariantNumeric = 'tabular-nums';
        s.textContent = text;
        document.body.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      const stack = getComputedStyle(document.body).fontFamily;
      return {
        viaStack: measure(stack, 'שלוםעולם'),
        viaHeebo: measure('"Heebo Variable", monospace', 'שלוםעולם'),
        viaFallback: measure('monospace', 'שלוםעולם'),
        // Width of 1111 must equal 8888 or the amount columns will not align.
        tabular1: measure(stack, '1111', true),
        tabular8: measure(stack, '8888', true),
        // The stack's digits MUST come from Inter: Heebo ships no tabular figures,
        // so if the order ever flips, every amount column silently misaligns in Hebrew.
        digitsViaStack: measure(stack, '0123456789'),
        digitsViaInter: measure('"Inter Variable", monospace', '0123456789'),
      };
    });

    expect(Math.abs(result.viaStack - result.viaHeebo)).toBeLessThan(1);
    expect(Math.abs(result.viaStack - result.viaFallback)).toBeGreaterThan(1);
    expect(result.tabular1).toBeCloseTo(result.tabular8, 1);
    expect(Math.abs(result.digitsViaStack - result.digitsViaInter)).toBeLessThan(1);
  });
});

test.describe('@pwa', () => {
  test('serves a valid manifest with maskable and apple icons', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);

    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };

    expect(manifest.name).toBe('Greenback');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  test('serves the icon files the manifest references', async ({ request }) => {
    for (const path of [
      '/favicon.svg',
      '/favicon.ico',
      '/apple-touch-icon-180x180.png',
      '/pwa-192x192.png',
      '/pwa-512x512.png',
      '/maskable-icon-512x512.png',
    ]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });

  test('registers an active service worker', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => navigator.serviceWorker.getRegistration().then((r) => !!r?.active),
      undefined,
      { timeout: 20_000 },
    );
  });
});

test.describe('@hermetic', () => {
  test('makes no off-origin requests', async ({ page }) => {
    const offOrigin: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost:4173') && !r.url().startsWith('data:')) {
        offOrigin.push(r.url());
      }
    });

    for (const route of ROUTES) await page.goto(route);

    // Fails the day someone adds a Google Fonts <link> or a CDN script, which
    // would also sink the Lighthouse Best-Practices score.
    expect(offOrigin).toEqual([]);
  });
});
