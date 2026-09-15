import { expect, test } from '@playwright/test';

/**
 * Screenshot matrix. Phase 7 expands this to 4 routes x 2 themes x 2 languages
 * as the reviewable artifact that replaces "audit every screen" - a gate nobody
 * else can check.
 */
const CASES = [
  { name: 'feed-light-en', route: '/', lang: 'en', theme: 'light' },
  { name: 'feed-dark-he', route: '/', lang: 'he', theme: 'dark' },
  { name: 'feed-light-he', route: '/', lang: 'he', theme: 'light' },
] as const;

for (const c of CASES) {
  test(`@screens ${c.name}`, async ({ page }) => {
    await page.addInitScript(
      ([lang, theme]) => {
        localStorage.setItem('gb.boot', JSON.stringify({ lang, theme }));
      },
      [c.lang, c.theme],
    );
    await page.goto(c.route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('main')).toBeVisible();
    await page.screenshot({ path: `artifacts/screens/${c.name}.png`, fullPage: true });
  });
}
