import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The screen head (§7.7, §4.4): the name in Karantina at 76px on a phone,
 * the 38px title pair from lg; the feed's hero as the ink sheet; and the
 * status bar following the paper (§3).
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@head ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('names every screen in the right face and size, under a paper status bar', async ({ page }) => {
        await completeFirstRun(page, lang);

        for (const route of ['/', '/chart', '/cards', '/cash', '/settings']) {
          await page.goto(route);
          const h1 = page.getByRole('heading', { level: 1 });
          await expect(h1).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const style = await h1.evaluate((el) => {
            const computed = getComputedStyle(el);
            return {
              family: computed.fontFamily.replace(/["']/g, ''),
              size: parseFloat(computed.fontSize),
              weight: computed.fontWeight,
            };
          });
          if (width < 1024) {
            expect(style.family.startsWith('Karantina'), route).toBe(true);
            expect(style.size, route).toBe(76);
          } else {
            expect(style.family.startsWith('IBM Plex Sans Hebrew'), route).toBe(true);
            expect(style.size, route).toBe(38);
            expect(style.weight, route).toBe('600');
          }
          await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F6F2EA');
        }

        await page.goto('/');
        await expect(page.locator('[data-slot="balance-sheet"]')).toHaveAttribute('data-sheet', 'night');
      });
    });
  }
}

test.describe('@head the status bar in dark mode', () => {
  test.use({ viewport: viewportFor(390) });

  test('is the dark paper', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await completeFirstRun(page, 'en', { theme: 'dark' });
    await page.goto('/cards');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1A1510');
  });
});
