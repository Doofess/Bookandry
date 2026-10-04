import { expect, test } from '@playwright/test';

import { openAddSheet } from './support/add';
import { bootAs, completeFirstRun } from './support/seed';

/**
 * Phase 0 exit gate. §11's "PWA config" and "pnpm test passes" are not
 * observable claims on their own; these are.
 */

const ROUTES = ['/', '/chart', '/cards', '/profiles', '/settings'] as const;

test.describe('@smoke0 first run', () => {
  test('gates a fresh install on the wizard, not on the shell', async ({ page }) => {
    /*
     * A cold install has no profile, so there IS no shell to render: the feed
     * would filter by an `activeProfileId` pointing at nothing and the Add form
     * would have no profile to submit to. This spec asserted the tab bar here
     * for three phases after the gate landed, and passed the whole time -
     * because `pnpm verify` does not run Playwright and `verify:full` had not
     * been run since. Both halves are now asserted explicitly.
     */
    // Pinned to English, because the wizard otherwise follows the BROWSER and
    // this assertion is about the gate, not about the language.
    await bootAs(page, 'en', 'light');
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /language and currency/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /primary|ניווט/i })).toHaveCount(0);
  });
});

test.describe('@smoke0 the seeding helper', () => {
  test('returns only once the shell exists, even when the write is slow', async ({ page }, testInfo) => {
    /*
     * Every spec after this one trusts `completeFirstRun` to hand back an app,
     * not a wizard that is still saving - and for a long time it did not. It
     * waited for the URL to leave "/welcome" and for a <main>, and both were
     * true from the start: the wizard is not a route, and it has a <main> of
     * its own. Nothing caught it, because on an idle machine the write always
     * won the race. On a loaded one the skip-link spec pressed Tab into the
     * wizard, and the smoke specs reloaded before the profile was committed.
     *
     * So the race is forced here instead of waited for: the transaction that
     * writes the profile is held open for 1.5s by a chain of reads, which keeps
     * the page responsive while the commit arrives late.
     */
    test.skip(testInfo.project.name !== 'en', 'About the helper, not the locale.');

    await page.addInitScript(() => {
      const held = new WeakSet<IDBTransaction>();
      for (const method of ['add', 'put'] as const) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: never[]) {
          if (this.name === 'profiles' && !held.has(this.transaction)) {
            held.add(this.transaction);
            const until = Date.now() + 1500;
            const spin = (): void => {
              if (Date.now() >= until) return;
              try {
                this.count().onsuccess = spin;
              } catch {
                // Dexie may commit the transaction itself; once it has, the
                // hold is over. Stop quietly rather than throw an uncaught
                // error into the page mid-commit.
              }
            };
            spin();
          }
          return (original as (...a: never[]) => IDBRequest).apply(this, args);
        } as never;
      }
    });

    await completeFirstRun(page, 'en', { demo: false });

    // Checked at once, with no waiting: the helper's promise IS the claim.
    expect(await page.getByRole('navigation', { name: /primary/i }).count()).toBe(1);
    // And the profile is durable, so a reload lands in the app, not the wizard.
    await page.reload();
    await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible();
  });
});

test.describe('@smoke0 app shell', () => {
  // Seeded: the shell only exists once a profile does.
  test.beforeEach(async ({ page }) => {
    await completeFirstRun(page, 'en', { demo: false });
  });

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
    // Two copies of the nav (one mobile, one desktop) would double the
    // aria-current bookkeeping and confuse screen readers.
    await expect(page.getByRole('navigation', { name: /primary|ניווט/i })).toHaveCount(1);
  });

  test('never scrolls horizontally', async ({ page }) => {
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('@theme switching language', () => {
  /*
   * Language and theme are separate choices, and changing one must never move
   * the other. The component that applies the language used to re-apply the
   * theme too - the one it had read at startup - so a person who opened the
   * app in dark, picked Light, then changed language was put back in dark while
   * Settings still said Light.
   */
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'en', 'Drives English copy; once is enough.');
  });

  test('keeps the theme picked in Settings', async ({ page }) => {
    await completeFirstRun(page, 'en', { demo: false, theme: 'dark' });
    await page.goto('/settings/preferences');
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);

    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(html).not.toHaveClass(/dark/);

    await page.getByRole('radio', { name: 'עברית' }).click();
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByRole('radio', { name: 'בהיר' })).toHaveAttribute('aria-checked', 'true');
  });

  test("keeps the device's theme in the setup wizard", async ({ page }) => {
    await bootAs(page, 'en', 'dark');
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);

    await page.getByRole('radio', { name: 'עברית' }).click();
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveClass(/dark/);
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
    /*
     * Corrupt JSON must degrade to the DETECTED default, never throw into the
     * render - private mode, blocked site data and a half-written key all land
     * here.
     *
     * The fallback is the browser's own language, not a hard-coded `ltr`:
     * "no usable mirror" is not the same as "English", and collapsing the two
     * gave an Israeli opening the app an English wizard whose own language
     * toggle already said Hebrew. So the assertion is that the direction
     * matches the BROWSER, which differs per project.
     */
    await page.addInitScript(() => {
      localStorage.setItem('gb.boot', '{not json');
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');

    const expected = await page.evaluate(() =>
      navigator.languages.some((l) => l.startsWith('he')) ? 'rtl' : 'ltr',
    );
    await expect(page.locator('html')).toHaveAttribute('dir', expected);
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

    expect(manifest.name).toBe('Bookandry');
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

test.describe('@fab add button', () => {
  // The FAB lives on the feed, which only exists once a profile does.
  test.beforeEach(async ({ page }) => {
    await completeFirstRun(page, 'en', { demo: false });
  });

  test('renders as a circle with the plus centred', async ({ page }) => {
    const fab = page.getByTestId('fab');
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    expect(box).not.toBeNull();
    // A squashed oval shipped once because a width utility overrode size-14.
    // Assert the real rendered geometry, not the class list.
    expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThanOrEqual(44); // WCAG 2.2 target size
  });

  test('is centred on mobile, inline-end from lg, and mirrors only where it can', async ({ page }) => {
    /*
     * The FAB has TWO positions by design (§5.1, §8.2): bottom-centre above the
     * tab bar on mobile, bottom-inline-end from `lg` where there is no tab bar.
     *
     * Asserting "inline-end, and mirrors" at every width was simply wrong, and
     * it failed on the mobile project for the right reason - a centred element
     * has nothing to mirror. Both halves are worth pinning: the centred case
     * depends on `start-0 end-0 mx-auto`, which has already regressed once to
     * `inset-inline-0` - a class that emits no CSS at all and left the button
     * at its static position, looking deliberate enough to pass a screenshot
     * review.
     */
    const viewport = page.viewportSize()!;
    const centre = viewport.width / 2;
    const isDesktop = viewport.width >= 1024;

    const ltr = (await page.getByTestId('fab').boundingBox())!;
    if (isDesktop) expect(ltr.x).toBeGreaterThan(centre);
    else expect(ltr.x + ltr.width / 2).toBeCloseTo(centre, 0);

    await page.addInitScript(() => {
      localStorage.setItem('gb.boot', JSON.stringify({ lang: 'he', theme: 'light' }));
    });
    await page.reload();

    const rtl = (await page.getByTestId('fab').boundingBox())!;
    if (isDesktop) expect(rtl.x).toBeLessThan(centre);
    else expect(rtl.x + rtl.width / 2).toBeCloseTo(centre, 0);
  });

  test('opens the transaction sheet', async ({ page }) => {
    /*
     * Was asserting `FAB pressed: 1` - a Phase 0 throwaway counter that the
     * real FAB replaced three phases ago. A test pinned to scaffolding that no
     * longer exists proves nothing about the button it is named after.
     */
    await expect(page.getByRole('button', { name: /add transaction/i })).toBeVisible();

    await openAddSheet(page);

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('offers adding by hand or with AI, and says why AI is unavailable here', async ({ page }) => {
    // This build has no account server, so the AI cannot be reached: the item
    // is there, disabled, with the reason in words rather than only greyed out.
    await page.getByTestId('fab').click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    const ai = menu.getByRole('menuitem', { name: /Add with AI|הוספה עם AI/ });
    await expect(ai).toHaveAttribute('aria-disabled', 'true');
    await expect(ai).toContainText(/Needs a Bookandry account|דורש חשבון Bookandry/);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});

test.describe('@nav the app mark', () => {
  test('goes home from anywhere', async ({ page }) => {
    /*
     * The mark is the oldest convention on the web and the app had it inert.
     * Two placements, because the shell renders a different one at each width:
     * a header above the content on a phone, and the top of the nav rail on a
     * desktop - a fix applied to one and not the other is invisible until
     * someone resizes.
     */
    await completeFirstRun(page, 'en');

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByRole('link', { name: 'Bookandry' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('is a real tap target, not a 24px mark', async ({ page }) => {
    // It is the full height of the header bar, so it can be hit with a thumb.
    await completeFirstRun(page, 'en');

    const box = await page.getByRole('link', { name: 'Bookandry' }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe('@nav the account menu', () => {
  test('sits at the top end - right in English, left in Hebrew - and holds the settings', async ({
    page,
  }, testInfo) => {
    const rtl = testInfo.project.name === 'he';
    await completeFirstRun(page, rtl ? 'he' : 'en');

    const trigger = page.getByRole('button', { name: rtl ? 'חשבון והגדרות' : 'Account and settings' });
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    if (rtl) expect(box?.x ?? width).toBeLessThan(width / 2);
    else expect(box?.x ?? 0).toBeGreaterThan(width / 2);

    await trigger.click();
    await page.getByRole('menuitem', { name: rtl ? 'העדפות' : 'Preferences' }).click();
    await expect(page).toHaveURL(/\/settings\/preferences$/);
    await expect(page.getByRole('heading', { level: 1, name: rtl ? 'העדפות' : 'Preferences' })).toBeVisible();
  });
});
