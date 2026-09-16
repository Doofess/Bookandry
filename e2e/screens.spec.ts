import { expect, test } from '@playwright/test';

import { completeFirstRun, type SeedLanguage } from './support/seed';

/**
 * The 16-image screenshot matrix: 4 routes x 2 languages x 2 themes.
 *
 * This is the Phase 7 deliverable that replaces "audit every screen" - a gate
 * nobody can check twice the same way. The suite can assert that a page
 * rendered and that nothing scrolled sideways; it cannot see clipped Hebrew, a
 * currency symbol on the wrong end, or a muted label that vanished into a dark
 * card. Those need eyes, and eyes need an artifact.
 *
 * Every image carries REAL data - the seeded demo household - because an empty
 * state hides every layout problem the matrix exists to find.
 *
 * Runs once, under the `en` project: the language comes from the boot mirror
 * rather than the browser locale, so running it per project would take the same
 * sixteen pictures three times.
 */
/*
 * Playwright REQUIRES the first parameter to be a destructuring pattern, even
 * when no fixture is used: it reads the pattern to work out which fixtures to
 * set up. `_fixtures` fails at runtime with 'First argument must use the object
 * destructuring pattern'.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Language is set explicitly.');
});

const ROUTES = [
  { name: 'feed', path: '/' },
  { name: 'chart', path: '/chart' },
  { name: 'profiles', path: '/profiles' },
  { name: 'settings', path: '/settings' },
] as const;

/*
 * The browser LOCALE is set alongside the language, not just the UI string
 * bundle.
 *
 * The wizard pre-selects the base currency from the region, so a Hebrew UI in
 * an `en-US` browser produces a matrix of Hebrew screens denominated in dollars
 * carrying English demo notes - a combination no real user has, and one that
 * hides the two things the Hebrew images exist to show: a shekel symbol landing
 * on the correct end of an amount, and Hebrew text at its real length.
 */
const LANGUAGES = [
  { lang: 'en' as SeedLanguage, locale: 'en-US' },
  { lang: 'he' as SeedLanguage, locale: 'he-IL' },
];
const THEMES = ['light', 'dark'] as const;

for (const { lang, locale } of LANGUAGES) {
  test.describe(`${lang} screens`, () => {
    test.use({ locale });

    for (const theme of THEMES) {
      for (const route of ROUTES) {
        test(`@screens ${route.name}-${lang}-${theme}`, async ({ page }) => {
          const errors: string[] = [];
          page.on('console', (m) => {
            if (m.type() === 'error') errors.push(m.text());
          });
          page.on('pageerror', (e) => errors.push(e.message));

          await page.emulateMedia({ colorScheme: theme });
          await completeFirstRun(page, lang, { theme });

          await page.goto(route.path);
          await expect(page.getByRole('main')).toBeVisible();

          // Fonts first: a screenshot taken mid-swap shows the fallback metrics,
          // and the whole point of the Hebrew images is which font rendered.
          await page.evaluate(() => document.fonts.ready);

          // The chart animates its line in; the rest settles faster than this.
          await page.waitForTimeout(400);

          await page.screenshot({
            path: `artifacts/screens/${route.name}-${lang}-${theme}.png`,
            fullPage: true,
          });

          // Cheap assertions worth making while we are here: the matrix should
          // not be the thing that tells us a screen threw.
          expect(errors).toEqual([]);
          const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
          expect(overflow).toBeLessThanOrEqual(1);
        });
      }
    }
  });
}
