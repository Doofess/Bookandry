import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The faces as rendered (§2, §13.3): Karantina never below 28px, no Plex text
 * asking for the unloaded 700, both faces actually loaded, and the two
 * Karantina preloads in the page.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@fonts ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('Karantina is 28px or more, and no Plex text is bold', async ({ page }) => {
        await completeFirstRun(page, lang);

        for (const route of APP_ROUTES) {
          await page.goto(route);
          await expect(page.getByRole('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const problems = await page.evaluate(() => {
            const bad: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>('body *')) {
              const hasText = [...el.childNodes].some(
                (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
              );
              const box = el.getBoundingClientRect();
              if (!hasText || box.width === 0 || box.height === 0) continue;
              const style = getComputedStyle(el);
              const family = style.fontFamily.replace(/["']/g, '');
              const size = parseFloat(style.fontSize);
              const label = `${el.tagName} "${el.textContent.trim().slice(0, 20)}"`;
              if (family.startsWith('Karantina') && size < 28)
                bad.push(`${label}: Karantina at ${String(size)}px`);
              if (family.startsWith('IBM Plex Sans Hebrew') && style.fontWeight === '700')
                bad.push(`${label}: Plex at 700`);
            }
            return bad;
          });

          expect(problems, `${route} at ${String(width)} in ${lang}`).toEqual([]);
        }
      });
    });
  }
}

test.describe('@fonts loading', () => {
  test('loads Plex and Karantina from the app, Plex first in the stack, with two preloads', async ({
    page,
  }) => {
    await completeFirstRun(page, 'he');
    await page.goto('/');
    await expect(page.getByTestId('balance-amount')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(() => ({
      stack: getComputedStyle(document.body).fontFamily.replace(/["']/g, ''),
      plexHebrew: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', 'תנועות'),
      karantinaDigits: document.fonts.check('700 44px Karantina', '0123456789'),
      preloads: [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(
        (link) => link.getAttribute('href') ?? '',
      ),
    }));

    expect(result.stack.startsWith('IBM Plex Sans Hebrew')).toBe(true);
    expect(result.plexHebrew).toBe(true);
    expect(result.karantinaDigits).toBe(true);
    expect(result.preloads).toHaveLength(2);
    for (const href of result.preloads)
      expect(href).toMatch(/karantina-(latin|hebrew)-700-normal-[\w-]+\.woff2$/);
  });
});
