import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The screenshot matrix: 8 routes x 3 widths x 2 languages x 2 themes (§13.3).
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
 * ninety-six pictures three times.
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

/** File-name stems for e2e/support/widths.ts's routes. */
const NAMES: Record<(typeof APP_ROUTES)[number], string> = {
  '/': 'feed',
  '/chart': 'chart',
  '/cards': 'cards',
  '/cash': 'cash',
  '/bank-accounts': 'bank-accounts',
  '/categories': 'categories',
  '/commitments': 'commitments',
  '/settings': 'settings',
};

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
const THEMES = ['light', 'dark'] as const;

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`${lang} screens at ${String(width)}`, () => {
      test.use({ locale, viewport: viewportFor(width) });

      for (const theme of THEMES) {
        for (const route of APP_ROUTES) {
          const name = `${NAMES[route]}-${lang}-${theme}-${String(width)}`;
          test(`@screens ${name}`, async ({ page }) => {
            const errors: string[] = [];
            page.on('console', (m) => {
              if (m.type() === 'error') errors.push(m.text());
            });
            page.on('pageerror', (e) => errors.push(e.message));

            await page.emulateMedia({ colorScheme: theme });
            await completeFirstRun(page, lang, { theme });

            await page.goto(route);
            await expect(page.getByRole('main')).toBeVisible();

            // Fonts first: a screenshot taken mid-swap shows the fallback metrics,
            // and the whole point of the Hebrew images is which font rendered.
            await page.evaluate(() => document.fonts.ready);

            // The chart animates its line in; the rest settles faster than this.
            await page.waitForTimeout(400);

            await page.screenshot({ path: `artifacts/screens/${name}.png`, fullPage: true });

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
}
