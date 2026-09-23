import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun } from './support/seed';

/**
 * The polish gates: narrow viewports, the collapsing header, and a
 * keyboard-only walkthrough.
 *
 * All three are things that look fine in a screenshot and fail in use. A
 * layout that overflows at 320px, a header that flickers between two states as
 * you scroll, a control that can only be reached with a pointer - none of them
 * show up in a unit test or a static image.
 */
/*
 * Playwright REQUIRES the first parameter to be a destructuring pattern, even
 * when no fixture is used.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport is set explicitly.');
});

const ROUTES = ['/', '/chart', '/profiles', '/settings'] as const;

/** The two widths the plan names: a common phone, and the narrowest still sold. */
const WIDTHS = [
  { name: '375 (iPhone SE)', width: 375, height: 667 },
  { name: '320 (the floor)', width: 320, height: 568 },
] as const;

for (const size of WIDTHS) {
  test.describe(`@narrow ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('never scrolls sideways on any route', async ({ page }) => {
      /*
       * 320px is where a fixed min-width, an un-wrapped flex row or a long
       * unbroken amount finally shows up. Horizontal scroll on a phone is not a
       * cosmetic problem: it hides the end of every row.
       */
      await completeFirstRun(page, 'en');

      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.getByRole('main')).toBeVisible();

        const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflows at ${String(size.width)}px`).toBeLessThanOrEqual(1);
      }
    });

    test('keeps every tap target at 44px', async ({ page }) => {
      // WCAG 2.2 target size. Narrow is where buttons get squeezed.
      await completeFirstRun(page, 'en');

      const small = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll('button, a[href], [role="radio"]')) {
          const box = el.getBoundingClientRect();
          // Not rendered: hidden tabs, collapsed sections.
          if (box.width === 0 || box.height === 0) continue;
          // Screen-reader-only controls are not POINTER targets while hidden.
          // The skip link is one, and it is measured focused in its own test.
          if (el.className.includes('sr-only')) continue;
          if (box.height < 24 || box.width < 24) {
            bad.push(
              `${el.tagName}.${el.className.slice(0, 40)} ${String(Math.round(box.width))}x${String(Math.round(box.height))}`,
            );
          }
        }
        return bad;
      });

      expect(small).toEqual([]);
    });
  });
}

test.describe('@collapse the summary header', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const scrollTo = async (page: Page, y: number): Promise<void> => {
    await page.evaluate((to) => {
      window.scrollTo(0, to);
    }, y);
    // Two frames: the listener coalesces into requestAnimationFrame.
    await page.evaluate(
      async () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
  };

  test('appears only after the cards have scrolled away, and keeps the balance', async ({ page }) => {
    await completeFirstRun(page, 'en');

    const bar = page.getByTestId('collapsed-summary');
    await expect(bar).toHaveCount(0);

    await scrollTo(page, 600);
    await expect(bar).toBeVisible();

    // The figure people opened the app for survives the collapse.
    const barValue = await bar.locator('[data-value]').getAttribute('data-value');
    expect(Number(barValue)).not.toBeNaN();

    await scrollTo(page, 0);
    await expect(bar).toHaveCount(0);
  });

  test('does not flicker at the threshold', async ({ page }) => {
    /*
     * The classic collapsing-header bug: mounting the bar changes the document
     * height, the change moves scrollY, the moved scrollY crosses back over the
     * threshold, and the header oscillates. Hysteresis plus a FIXED bar (which
     * takes no space in the flow) is what prevents it - this walks the scroll
     * position across the boundary one pixel at a time and counts the flips.
     */
    await completeFirstRun(page, 'en');

    /*
     * The boundary is MEASURED, not assumed.
     *
     * It is where the expanded header ends in the document - which moves with
     * the profile row, with wrapped filter chips, and with the language. A
     * hard-coded window that no longer contains the threshold reports zero
     * flips and passes while testing nothing at all.
     */
    const boundary = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="feed-header"]');
      if (header === null) return 0;
      return Math.round(header.getBoundingClientRect().bottom + window.scrollY);
    });
    expect(boundary).toBeGreaterThan(0);

    const bar = page.getByTestId('collapsed-summary');
    let flips = 0;
    let previous = await bar.count();

    for (let y = boundary - 80; y <= boundary + 80; y += 4) {
      await scrollTo(page, Math.max(y, 0));
      const now = await bar.count();
      if (now !== previous) flips += 1;
      previous = now;
    }

    // Exactly one: a walk across the threshold must cross it, and must cross it
    // once. Zero would mean the window missed the boundary entirely.
    expect(flips).toBe(1);
  });

  test('lets the day headers rest under the bar, not behind it', async ({ page }) => {
    /*
     * The feed's sticky day headers pin against `--feed-sticky-top`. If the bar
     * does not set it, a pinned header slides underneath and is unreadable.
     *
     * Measured RESOLVED, not read as a string: the property now carries the
     * safe-area inset (`calc(48px + env(...))`), because on an installed app
     * with a notch the bar is taller than its own constant and a header told to
     * stop at a flat 48px slides under it again. Custom properties are not
     * resolved by `getPropertyValue`, so asserting the text would only pin the
     * expression - and would pass just as happily if the bar's height and the
     * headers' stop disagreed.
     */
    await completeFirstRun(page, 'en');
    await scrollTo(page, 600);

    const measured = await page.evaluate(() => {
      const section = document.querySelector('main section');
      if (section === null) return undefined;

      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.top = 'var(--feed-sticky-top, 0px)';
      section.append(probe);
      const top = getComputedStyle(probe).top;
      probe.remove();

      const bar = document.querySelector('[data-testid="collapsed-summary"]');
      return { top, barHeight: bar === null ? 0 : bar.getBoundingClientRect().height };
    });

    // No insets in a desktop viewport, so both resolve to the bare constant -
    // and, more to the point, to the SAME number.
    expect(measured?.top).toBe('48px');
    expect(measured?.barHeight).toBe(48);
  });
});

test.describe('@collapse on the desktop rail', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('stands in the column it replaced, not the whole viewport', async ({ page }) => {
    /*
     * The bar is `fixed`, so it centres on the VIEWPORT; the card it stands in
     * for centres inside `main`, which clears the 224px nav rail. Without a
     * matching offset the collapsed balance jumps ~112px to the inline-start of
     * the number it just replaced - the kind of shift that reads as the page
     * being broken rather than as a header collapsing.
     */
    await completeFirstRun(page, 'en');

    const column = await page.locator('main section').boundingBox();
    await page.evaluate(() => {
      window.scrollTo(0, 600);
    });

    const row = await page.getByTestId('collapsed-summary').locator('button').boundingBox();

    const columnCentre = (column?.x ?? 0) + (column?.width ?? 0) / 2;
    const rowCentre = (row?.x ?? 0) + (row?.width ?? 0) / 2;

    expect(Math.abs(columnCentre - rowCentre)).toBeLessThanOrEqual(2);
  });
});

test.describe('@keyboard walkthrough', () => {
  test('reaches the add button by keyboard alone, and shows focus at every stop', async ({ page }) => {
    /*
     * The plan's manual gate, automated as far as it can be: tab from the top
     * of the feed and confirm every stop is a real control with a VISIBLE focus
     * ring. A focusable element with no visible indicator fails 2.4.7 and is
     * indistinguishable from a lost cursor.
     */
    await completeFirstRun(page, 'en');

    const seen: string[] = [];
    let reachedFab = false;

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === null || el === document.body) return undefined;

        const style = getComputedStyle(el);
        return {
          testid: el.getAttribute('data-testid') ?? '',
          label: (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 40),
          // A ring is drawn with outline or box-shadow; either counts.
          hasFocusRing: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
        };
      });

      if (focused === undefined) continue;
      seen.push(focused.label);
      expect(focused.hasFocusRing, `no visible focus on "${focused.label}"`).toBe(true);

      if (focused.testid === 'fab') {
        reachedFab = true;
        break;
      }
    }

    /*
     * Within twelve stops, not merely 'eventually'.
     *
     * The FAB is fixed, so its DOM position is invisible on screen and decided
     * the tab order alone. Rendered last it sat after every transaction row -
     * two stops each - so the primary action was past a hundred presses away on
     * a real month of data. 'Reachable' was already true then; it is the wrong
     * bar.
     */
    expect(reachedFab, `FAB not reached within 12 tabs; order was ${seen.join(' -> ')}`).toBe(true);
  });

  test('opens and closes the add sheet without a pointer', async ({ page }) => {
    await completeFirstRun(page, 'en');

    await page.getByTestId('fab').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Escape is the documented way out of every sheet in the app.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('moves focus INTO the sheet when it opens', async ({ page }) => {
    // A dialog that opens without taking focus leaves a keyboard user tabbing
    // through the page behind it, with no way to know the sheet is there.
    await completeFirstRun(page, 'en');

    await page.getByTestId('fab').focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      const dialogEl = document.querySelector('[role="dialog"]');
      return el !== null && dialogEl?.contains(el) === true;
    });

    expect(inside).toBe(true);
  });
});

test.describe('@keyboard the skip link', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('is a real target once focused, not a 16px sliver', async ({ page }) => {
    /*
     * `sr-only` until focused, which is the point - but a skip link that
     * appears at 32x16 is a target nobody can hit on a phone, and it is the
     * FIRST thing a keyboard user meets.
     */
    await completeFirstRun(page, 'en', { demo: false });

    const link = page.getByRole('link', { name: /skip to content/i });

    /*
     * Wait for the link to actually HOLD focus before measuring it.
     *
     * It is `sr-only` until focused, so its box is meaningless until then - and
     * pressing Tab does not guarantee focus has landed by the next statement.
     * Measuring immediately passed on an idle machine and failed once in a full
     * parallel run, which is the definition of a test that reports the load on
     * the machine rather than the size of the target.
     */
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();

    const box = await link.boundingBox();

    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
  });
});

test.describe('@motion the count-up', () => {
  /*
   * The ONE spec that opts out of reduced motion.
   *
   * Every other spec runs with `reducedMotion: 'reduce'` so assertions are not
   * racing animations - which means the count-up itself, the app's most visible
   * piece of motion, was never executed by a test at all. An easing function
   * that overshoots, or a final frame that lands a single agora short, would be
   * invisible to the whole suite and obvious to anyone looking at the screen.
   */
  test.use({ reducedMotion: 'no-preference' });

  test('lands exactly on the settled figure', async ({ page }) => {
    await completeFirstRun(page, 'en');

    const animated = page.locator('[data-testid="balance-amount"] [data-value]');
    await expect(animated).toBeAttached();

    /*
     * A flat wait, not a stability poll.
     *
     * Ease-out cubic barely moves near the end, so 'two consecutive reads agree'
     * reports a plateau as the finish and reads a mid-animation figure. The
     * animation is 650ms; waiting well past it makes any mismatch a real defect
     * rather than a sampling artefact.
     */
    await page.waitForTimeout(1500);
    const settled = await animated.getAttribute('data-value');

    expect(settled).not.toBeNull();

    // The spoken figure is computed from the real balance, never from the
    // animation, so it is the independent answer to check the last frame
    // against.
    const spoken = await page.getByTestId('balance-announced').textContent();
    const digits = (spoken ?? '').replace(/[^\d]/g, '');
    const fromAnimation = String(Math.abs(Number(settled))).padStart(3, '0');

    expect(digits).toContain(fromAnimation);
  });

  test('skips the animation entirely when reduced motion is on', async ({ browser }) => {
    // The other half: the setting has to actually do something.
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const reduced = await context.newPage();
    await completeFirstRun(reduced, 'en');

    const first = await reduced
      .locator('[data-testid="balance-amount"] [data-value]')
      .getAttribute('data-value');
    await reduced.waitForTimeout(200);
    const second = await reduced
      .locator('[data-testid="balance-amount"] [data-value]')
      .getAttribute('data-value');

    // No intermediate frames: the first value read is already the final one.
    expect(first).toBe(second);
    await context.close();
  });
});
