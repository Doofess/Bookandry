import { expect, test, type Page } from '@playwright/test';

import { ADD_EXPENSE, addTrigger } from './support/add';
import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The shell (§4): four text pills on a phone; from lg, the rail with Add, the
 * places and the account menu, and main filling the window less the rail.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

const NAV = /^(Primary|ניווט ראשי)$/;
const PLACES = {
  en: ['Overview', 'Cards', 'Bank accounts', 'Cash box', 'Chart', 'Categories', 'Commitments', 'Settings'],
  he: ['סקירה', 'כרטיסים', 'חשבונות בנק', 'קופת מזומן', 'תרשים', 'קטגוריות', 'התחייבויות', 'הגדרות'],
} as const;
const TABS = { en: ['Feed', 'Chart', 'Cards', 'Cash'], he: ['תנועות', 'תרשים', 'כרטיסים', 'מזומן'] } as const;
const ACCOUNT = /^(Account and settings|חשבון והגדרות)/;

/** The visible places' labels, in order: the first span of each link, without the mark. */
async function placeNames(page: Page): Promise<string[]> {
  return page
    .getByRole('navigation', { name: NAV })
    .getByRole('link')
    .evaluateAll((links) =>
      links
        .filter((link) => link.querySelector('[data-slot="app-mark"]') === null)
        .map((link) => (link.querySelector('span')?.textContent ?? '').trim()),
    );
}

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@shell ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('four tabs on a phone; the rail with Add, the places and the account from lg', async ({
        page,
      }) => {
        await completeFirstRun(page, lang);
        const nav = page.getByRole('navigation', { name: NAV });

        if (width < 1024) {
          expect(await placeNames(page)).toEqual(TABS[lang]);
          const bar = (await nav.boundingBox())!;
          expect(bar.y + bar.height).toBeCloseTo(viewportFor(width).height, 0);
          for (const link of await nav.getByRole('link').all()) {
            expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          }
          await expect(page.getByTestId('rail-add')).toHaveCount(0);
          await expect(page.getByTestId('add-button')).toBeVisible();
        } else {
          expect(await placeNames(page)).toEqual(PLACES[lang]);
          const rail = (await nav.boundingBox())!;
          expect(Math.round(rail.width)).toBe(256);
          // The window less the scrollbar's gutter (`scrollbar-gutter: stable` from 640px): the body's width.
          const window = await page.evaluate(() => document.body.getBoundingClientRect().width);
          if (lang === 'en') expect(rail.x).toBeCloseTo(0, 0);
          else expect(rail.x + rail.width).toBeCloseTo(window, 0);
          await expect(nav.getByTestId('rail-add')).toBeVisible();
          await expect(page.getByTestId('add-button')).toHaveCount(0);
          await expect(nav.getByRole('button', { name: ACCOUNT })).toBeVisible();

          // No empty pad on the far side: main is the window less the rail.
          const content = await page.locator('main').evaluate((el) => {
            const style = getComputedStyle(el);
            return el.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
          });
          expect(content).toBe(window - 256);
          expect(content).toBeGreaterThanOrEqual(width === 1920 ? 1600 : 0);
        }

        const feed = nav.getByRole('link', {
          name: lang === 'en' ? (width < 1024 ? /^Feed/ : /^Overview/) : width < 1024 ? /^תנועות/ : /^סקירה/,
        });
        await expect(feed).toHaveAttribute('aria-current', 'page');
        expect(await nav.getByRole('link').locator('svg').count()).toBe(0);
      });
    });
  }
}

test.describe('@shell on a desktop', () => {
  test.use({ viewport: viewportFor(1440) });

  test('the rail’s Add opens the panel over Cards, a save stays there, and import opens on Settings (Review Focus)', async ({
    page,
  }) => {
    await completeFirstRun(page, 'en');
    await page.goto('/cards');

    await addTrigger(page).click();
    await page.getByRole('menuitem', { name: ADD_EXPENSE }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Amount', { exact: true }).fill('42');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/cards');

    await page.goto('/settings?import=1');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/settings');
  });

  test('says which way a move goes, for the transition', async ({ page }) => {
    await completeFirstRun(page, 'en');
    const nav = page.getByRole('navigation', { name: NAV });
    await nav.getByRole('link', { name: /^Chart/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-nav-dir', 'forward');
    await nav.getByRole('link', { name: /^Overview/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-nav-dir', 'back');
  });
});
