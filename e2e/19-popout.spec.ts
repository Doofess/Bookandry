import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The pop-out's size and place (§6.2): the whole screen on a phone; from sm,
 * centred at up to 1140 by 732, with 2rem of the page showing round it.
 * Smart import is reachable without an account by its address (?import=1).
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@popout ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('Smart import opens as the pop-out, sized and centred', async ({ page }) => {
        await completeFirstRun(page, lang, { demo: false });
        await page.goto('/?import=1');

        const popout = page.locator('[data-slot="popout"]');
        await expect(popout).toBeVisible();
        const box = await popout.boundingBox();
        expect(box).not.toBeNull();
        if (box === null) return;

        const { height } = viewportFor(width);
        if (width < 640) {
          expect(box.x).toBeLessThanOrEqual(1);
          expect(box.y).toBeLessThanOrEqual(1);
          expect(box.width).toBeGreaterThanOrEqual(width - 1);
          expect(box.height).toBeGreaterThanOrEqual(height - 1);
        } else {
          const w = Math.min(1140, width - 64);
          const h = Math.min(732, height - 64);
          // Centred in the area the scrim covers: from sm the page keeps its
          // scrollbar gutter (index.css), which a fixed layer does not span.
          const area = await page.locator('[data-slot="popout-scrim"]').boundingBox();
          expect(area).not.toBeNull();
          if (area === null) return;
          expect(box.width).toBeCloseTo(w, 0);
          expect(box.height).toBeCloseTo(h, 0);
          expect(box.x - area.x).toBeCloseTo((area.width - w) / 2, 0);
          expect(box.y - area.y).toBeCloseTo((area.height - h) / 2, 0);
        }

        await page.keyboard.press('Escape');
        await expect(popout).toHaveCount(0);
      });
    });
  }
}
