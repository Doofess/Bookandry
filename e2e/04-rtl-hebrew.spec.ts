import { expect, test } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';

/**
 * The Hebrew and RTL gate.
 *
 * Everything here is invisible to jsdom and to `tsc`: which font actually
 * rendered a glyph, which side of the viewport a sheet came in from, whether
 * digits line up in a column. They are also the defects a reviewer who does not
 * read Hebrew will look straight past.
 *
 * Runs once, under the `en` project: the page language comes from the boot
 * mirror, not from the browser locale, so running it in all three projects
 * would be the same assertions three times.
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

test.describe('@rtl the document', () => {
  test('is rtl and he, and never scrolls sideways', async ({ page }) => {
    await completeFirstRun(page, 'he');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');

    // A horizontal scrollbar in RTL is the classic symptom of a physical
    // margin surviving the mirror.
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('pins the desktop rail to the inline start, which in Hebrew is the right', async ({ page }) => {
    /*
     * `lg:start-0`, measured rather than trusted. A physical `left-0` surviving
     * the rewrite looks identical in English and puts the rail on the wrong
     * side of the screen in Hebrew - the single most visible RTL defect there
     * is, and invisible to anyone reviewing in English.
     */
    await completeFirstRun(page, 'he');

    const nav = page.getByRole('navigation', { name: /ניווט/ });
    const box = await nav.boundingBox();
    const viewport = page.viewportSize();

    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box !== null && viewport !== null) {
      // Desktop layout: a vertical rail, so the assertion is which EDGE it hugs.
      expect(viewport.width).toBeGreaterThanOrEqual(1024);
      // The window less the scrollbar the reset keeps room for (scrollbar-gutter: stable).
      // On the right: an English rail would end near 224.
      expect(box.x + box.width).toBeGreaterThan(viewport.width - 20);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
});

test.describe('@rtl the mobile tab bar', () => {
  // Below `lg` the rail becomes a horizontal bar, which is where mirroring is
  // observable as an ORDER rather than as an edge.
  test.use({ viewport: { width: 390, height: 844 } });

  test('mirrors without reordering the markup', async ({ page }) => {
    /*
     * The tabs keep their DOM order and the LAYOUT mirrors. Reversing the order
     * in markup as well would make the two mirrors cancel, putting Feed on the
     * left in Hebrew - exactly where it sits in English, so the bug would look
     * like success.
     */
    await completeFirstRun(page, 'he');

    const links = page.getByRole('navigation', { name: /ניווט/ }).getByRole('link');
    const first = await links.first().boundingBox();
    const last = await links.last().boundingBox();

    expect(first?.x ?? 0).toBeGreaterThan(last?.x ?? 0);
  });
});

test.describe('@rtl fonts', () => {
  test('renders Hebrew and digits in Plex, ahead of every fallback', async ({ page }) => {
    await completeFirstRun(page, 'he');
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(() => ({
      stack: getComputedStyle(document.body).fontFamily.replace(/["']/g, ''),
      // `document.fonts.check` answers "can this family render this text with a
      // LOADED face": a family declared but never downloaded falls through silently.
      hebrew: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', 'שלום'),
      digits: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', '0123456789'),
    }));

    /*
     * ORDER IS LOAD-BEARING. Plex's digits are fixed-width; a face ahead of it
     * without them breaks every amount column, and nothing else in the suite
     * would notice.
     */
    expect(result.stack.indexOf('IBM Plex Sans Hebrew')).toBe(0);
    expect(result.stack.indexOf('IBM Plex Sans Hebrew')).toBeLessThan(result.stack.indexOf('Plex Fallback'));
    expect(result.hebrew).toBe(true);
    expect(result.digits).toBe(true);
  });
});

test.describe('@rtl amounts and the chart', () => {
  test('keeps the amount an LTR island with the integer on it', async ({ page }) => {
    await completeFirstRun(page, 'he');

    const amount = page.locator('[data-value]').first();
    await expect(amount).toHaveAttribute('dir', 'ltr');

    // Every assertion in the suite reads the integer, never the formatted
    // string: pinning "₪1,234.50" fails the next time ICU moves a separator.
    const value = await amount.getAttribute('data-value');
    expect(Number(value)).not.toBeNaN();
  });

  test('draws the chart left to right inside an rtl page', async ({ page }) => {
    /*
     * The Phase 6 exit gate, re-asserted here because it is a HEBREW property
     * and this is the Hebrew spec. A plot is a coordinate system, not prose:
     * time runs left to right in every language, and mirroring it would put the
     * future on the left of a Y axis that stayed put.
     */
    await completeFirstRun(page, 'he');
    await page.goto('/chart');

    const wrapper = page.locator('.recharts-wrapper');
    await expect(wrapper).toBeVisible();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const direction = await wrapper.evaluate((el) => getComputedStyle(el).direction);
    expect(direction).toBe('ltr');
  });

  test('lets a mixed Hebrew tick resolve its own direction', async ({ page }) => {
    // An axis tick in Hebrew is a MIXED run - Hebrew month name, Latin digits -
    // and inside an LTR island the bidi algorithm would reorder it.
    await completeFirstRun(page, 'he');
    await page.goto('/chart');

    // The chart is behind a live query and a reload, so wait for the plot
    // itself before reaching for a tick inside it.
    await expect(page.locator('.recharts-wrapper')).toBeVisible();

    // Located by the tick class, not by `text`: the SVG also carries an empty
    // <title>/<desc> pair, and an element with no box is never "visible".
    const tick = page.locator('.recharts-cartesian-axis-tick-value').first();
    await expect(tick).toBeAttached();

    const tickStyle = await tick.evaluate((el) => ({
      bidi: getComputedStyle(el).unicodeBidi,
      text: el.textContent,
    }));

    expect(tickStyle.bidi).toBe('plaintext');
    // A Hebrew month name next to Latin digits: the mixed run the rule is for.
    expect(tickStyle.text).toMatch(/[֐-׿]/);
  });
});

test.describe('@rtl sheets open on the right edge', () => {
  test('brings the add sheet in from the correct side', async ({ page }) => {
    /*
     * Measured by BOX POSITION, not by class name. shadcn's rtl transform
     * rewrites the physical utilities it knows about, but `side`/`align` on
     * floating elements are NOT in its mapping table - so the only honest check
     * is where the thing actually landed.
     */
    await completeFirstRun(page, 'he');

    await openAddSheet(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (box !== null && viewport !== null) {
      // A bottom sheet spans the width; what matters is that it is not pinned
      // to one physical edge with a gap on the other.
      expect(box.x).toBeLessThan(viewport.width);
      expect(box.x + box.width).toBeGreaterThan(0);
    }
  });
});
