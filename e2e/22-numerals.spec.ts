import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * @numerals (§9.4, §13.3): every `[data-numeral]` on every screen runs off its
 * sheet's foot by no more than the rule - (0.61 x b + 0.02) x its font size,
 * plus a pixel - with b 0.06 from lg and 0.03 below, halved in a card sheet,
 * and 0 for a figure that never bleeds, and none runs past its sheet's side. The ₪ ends above the cut, and a
 * spoken twin carries the amount.
 *
 * Phase 2 builds Numeral; the screens draw it from phase 3. Until one does,
 * this reports itself skipped rather than passing on nothing.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@numerals ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('no numeral bleeds past the rule, and each says its amount', async ({ page }) => {
        await completeFirstRun(page, lang);
        let seen = 0;

        for (const route of APP_ROUTES) {
          await page.goto(route);
          await expect(page.getByRole('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const result = await page.evaluate((desktop) => {
            const bad: string[] = [];
            const numerals = [...document.querySelectorAll<HTMLElement>('[data-numeral]')];
            for (const numeral of numerals) {
              const sheet = numeral.closest('[data-sheet]');
              const label = numeral.textContent.trim();
              if (sheet === null) {
                bad.push(`${label}: not on a sheet`);
                continue;
              }
              const size = parseFloat(getComputedStyle(numeral).fontSize);
              const still = numeral.style.getPropertyValue('--b').trim() === '0';
              const half = numeral.closest('[data-card-sheet]') !== null;
              const b = still ? 0 : (desktop ? 0.06 : 0.03) * (half ? 0.5 : 1);
              const foot = sheet.getBoundingClientRect().bottom;
              const overflow = numeral.getBoundingClientRect().bottom - foot;
              if (overflow > (0.61 * b + 0.02) * size + 1)
                bad.push(`${label}: ${String(overflow)}px past the foot`);
              // Never cut at a side: the run of digits stays inside its sheet (CAN WAIT 2).
              const side = sheet.getBoundingClientRect();
              const digits =
                numeral.lastElementChild?.getBoundingClientRect() ?? numeral.getBoundingClientRect();
              if (digits.left < side.left - 1 || digits.right > side.right + 1)
                bad.push(`${label}: runs past the sheet's side`);
              const symbol = numeral.querySelector('span');
              if (symbol !== null && symbol.getBoundingClientRect().bottom > foot)
                bad.push(`${label}: the symbol is cut`);
              const twin = numeral.nextElementSibling;
              if (twin === null || !twin.classList.contains('sr-only') || !/\d/.test(twin.textContent))
                bad.push(`${label}: no spoken amount`);
            }
            return { bad, count: numerals.length };
          }, width >= 1024);

          seen += result.count;
          expect(result.bad, `${route} at ${String(width)} in ${lang}`).toEqual([]);
        }

        test.skip(seen === 0, 'No screen draws a Numeral until phase 3 lays the screens out.');
      });
    });
  }
}
