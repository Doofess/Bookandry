import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, EDGE_WIDTHS, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * Every route at every width the redesign is measured at, in both languages.
 *
 * Two failures that look fine in a screenshot taken at one size: a page that
 * scrolls sideways (it hides the end of every row), and an icon squeezed by
 * the reset's `min-width: 0` into a thin oval.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of [...EDGE_WIDTHS, ...LAYOUT_WIDTHS]) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@widths ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('no route scrolls sideways, and no icon is squeezed', async ({ page }) => {
        await completeFirstRun(page, lang);

        for (const route of APP_ROUTES) {
          await page.goto(route);
          await expect(page.getByRole('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow, `${route} scrolls sideways at ${String(width)} in ${lang}`).toBeLessThanOrEqual(1);

          // Lucide icons are square; one that is not has been squeezed by a flex row.
          const squeezed = await page.evaluate(() =>
            [...document.querySelectorAll('svg.lucide')]
              .map((icon) => icon.getBoundingClientRect())
              .filter((box) => box.width > 0 && box.height > 0 && Math.abs(box.width - box.height) > 1)
              .map((box) => `${String(Math.round(box.width))}x${String(Math.round(box.height))}`),
          );
          expect(squeezed, `squeezed icons on ${route}`).toEqual([]);
        }
      });
    });
  }
}
