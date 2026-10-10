import { expect, test } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The add-transaction editor as a panel (§6.1, §13.3): a bottom sheet on a
 * phone, a 480px sheet at the inline end from lg, with Cancel and Save side by
 * side - not 950px apart, as the full-width sheet had them at 1920.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

const COPY = {
  en: { cancel: 'Cancel', save: 'Save' },
  he: { cancel: 'ביטול', save: 'שמירה' },
} as const;

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@panel ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('sits where it should, with Cancel and Save together', async ({ page }) => {
        await completeFirstRun(page, lang, { demo: false });
        await openAddSheet(page);

        const panel = page.locator('[data-slot="editor-panel"]');
        await expect(panel).toBeVisible();
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        if (box === null) return;

        if (width < 1024) {
          // The bottom sheet: the whole width, down to the bottom edge.
          expect(box.x).toBeLessThanOrEqual(1);
          expect(box.width).toBeGreaterThanOrEqual(width - 1);
          expect(box.y + box.height).toBeGreaterThanOrEqual(viewportFor(width).height - 1);
        } else {
          expect(Math.round(box.width)).toBe(480);
          // The inline end, one sheet gap in: right in English, left in Hebrew.
          if (lang === 'en') {
            // Measured from the layout viewport's edge: a classic scrollbar's gutter (15px on Windows) is not part of it.
            const layoutWidth = await page.evaluate(
              () => document.documentElement.getBoundingClientRect().width,
            );
            expect(layoutWidth - (box.x + box.width)).toBeCloseTo(16, 0);
          } else expect(box.x).toBeCloseTo(16, 0);
          // Full height less the gaps.
          expect(box.y).toBeCloseTo(16, 0);
          expect(box.height).toBeCloseTo(viewportFor(width).height - 32, 0);
        }

        const cancel = await panel
          .getByRole('button', { name: COPY[lang].cancel, exact: true })
          .boundingBox();
        const save = await panel.getByRole('button', { name: COPY[lang].save, exact: true }).boundingBox();
        expect(cancel).not.toBeNull();
        expect(save).not.toBeNull();
        if (cancel !== null && save !== null) {
          expect(Math.abs(save.x - cancel.x)).toBeLessThanOrEqual(480);
          expect(Math.abs(save.y - cancel.y)).toBeLessThanOrEqual(1);
        }

        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
      });
    });
  }
}

test.describe('@panel forced colours', () => {
  test.use({ viewport: viewportFor(1440), locale: 'en' });

  test('the panel keeps a visible edge in Windows High Contrast (§1.8)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await completeFirstRun(page, 'en', { demo: false });
    await openAddSheet(page);
    const panel = page.locator('[data-slot="editor-panel"]');
    await expect(panel).toBeVisible();
    const edge = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor };
    });
    expect(edge.width).toBe('2px');
    expect(edge.style).toBe('solid');
    expect(edge.color).not.toBe('rgba(0, 0, 0, 0)');
  });
});
