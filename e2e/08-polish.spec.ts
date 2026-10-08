import { expect, test, type Page } from '@playwright/test';

import { ADD_EXPENSE } from './support/add';
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

const ROUTES = ['/', '/chart', '/cards', '/household', '/settings'] as const;

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

    for (const lang of ['en', 'he'] as const) {
      test(`keeps the panel's pills to two lines at most, in ${lang}`, async ({ page }) => {
        /*
         * Month, people and prime each on a line of their own made the panel
         * half an iPhone SE, with a row and a half of the list above the fold.
         * Measured by CENTRE, because the pills share `items-center` but are
         * not all the same height (the month pill carries a border).
         */
        await completeFirstRun(page, lang);

        const pills = page.getByTestId('panel-pills').locator(':scope > *');
        await expect(pills).toHaveCount(3);

        const centres: number[] = [];
        for (const pill of await pills.all()) {
          const box = await pill.boundingBox();
          expect(box).not.toBeNull();
          if (box !== null) centres.push(box.y + box.height / 2);
        }
        // A new line wherever the next centre is clearly lower than the last.
        centres.sort((a, b) => a - b);
        const lines = centres.filter((c, i) => i === 0 || c - (centres[i - 1] ?? c) > 12).length;

        expect(lines, `${lang} at ${String(size.width)}px`).toBeLessThanOrEqual(2);
      });

      test(`keeps a feed row's parts apart, in ${lang}`, async ({ page }) => {
        /*
         * A projected row carries a type chip and "not counted yet" beside the
         * category, an avatar and the amount. At 320px the chips kept their
         * width while the text column shrank under them, and drew on top of the
         * avatar and the amount. Every part of every row must own its box.
         */
        await completeFirstRun(page, lang);
        await expect(page.getByTestId('row-not-counted').first()).toBeVisible();

        const clashes = await page.evaluate(() => {
          const bad: string[] = [];
          const parts: [string, string][] = [
            ['category chip', '[data-slot="category-chip"]'],
            ['text', '[data-testid="row-text"]'],
            ['avatar', '[data-person]'],
            ['amount', '[data-testid="row-amount"]'],
            ['more', '[data-testid="row-more"]'],
          ];
          for (const row of document.querySelectorAll('[role="listitem"]')) {
            const boxes: [string, DOMRect][] = [];
            for (const [name, selector] of parts) {
              const el = row.querySelector(selector);
              if (el !== null) boxes.push([name, el.getBoundingClientRect()]);
            }
            for (const [a, boxA] of boxes) {
              for (const [b, boxB] of boxes) {
                if (a >= b) continue;
                const across = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
                const down = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
                if (across > 0.5 && down > 0.5) bad.push(`${a} overlaps ${b}`);
              }
            }

            const column = row.querySelector<HTMLElement>('[data-testid="row-text"]');
            if (column !== null && column.scrollWidth > column.clientWidth + 1)
              bad.push('text content spills out of its column');

            // Never cut short: "Not c..." reads as nothing.
            const flagEl = row.querySelector<HTMLElement>('[data-testid="row-not-counted"]');
            if (flagEl !== null && flagEl.scrollWidth > flagEl.clientWidth)
              bad.push('not counted is truncated');

            // The flag lives INSIDE the text column: it must not spill out of it.
            const flag = row.querySelector('[data-testid="row-not-counted"]')?.getBoundingClientRect();
            const text = row.querySelector('[data-testid="row-text"]')?.getBoundingClientRect();
            if (flag !== undefined && text !== undefined) {
              if (flag.left < text.left - 0.5 || flag.right > text.right + 0.5)
                bad.push('not counted spills out of the text column');
            }
          }
          return [...new Set(bad)];
        });

        expect(clashes, `${lang} at ${String(size.width)}px`).toEqual([]);
      });
    }
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

  test('pins the day of the rows under it, from the first rows on and at every day boundary', async ({
    page,
  }) => {
    /*
     * Two bugs, one test.
     *
     * The pinned header was taken from the first RENDERED item, which counts
     * the overscan: for the first eight or so rows of scrolling it kept the
     * first day pinned over later days' rows.
     *
     * Then it was taken from the row at the top of the VIEWPORT, which is
     * behind the 48px collapsed bar: for 48px at every day boundary the
     * previous day's date and total sat on the next day's row. Hence the
     * second walk, which puts each day's header 24px up behind the bar - the
     * middle of that band.
     *
     * And directly under the pinned header there must be a row at all - a list
     * whose scroll margin is measured from the wrong parent draws rows where
     * the reader is not.
     */
    await completeFirstRun(page, 'en');

    const start = await page.evaluate(() => {
      const list = document.querySelector('[role="list"]');
      return list === null ? 0 : list.getBoundingClientRect().top + window.scrollY;
    });
    expect(start).toBeGreaterThan(0);

    // The virtualizer's reference line sits at the pinned slot, not at the
    // list: the rows themselves must not move for it. The first day starts
    // exactly where the list does, and its first row one header (36px) below.
    // Item 0 is the pinned header and never shifts; it is the SECOND item that
    // would be dragged by a misplaced reference line.
    const offsets = await page.evaluate(() => {
      const list = document.querySelector('[role="list"]');
      const top = (index: number): number | undefined => {
        const item = document.querySelector(`[data-index="${String(index)}"]`);
        return list === null || item === null
          ? undefined
          : item.getBoundingClientRect().top - list.getBoundingClientRect().top;
      };
      return { first: top(0), second: top(1) };
    });
    expect(offsets.first).toBe(0);
    expect(offsets.second).toBe(36);

    const probe = async (y: number) => {
      await scrollTo(page, y);
      return page.evaluate(() => {
        const items = [...document.querySelectorAll<HTMLElement>('[data-index]')];
        // A day header is the item whose content is neither a row nor the horizon line.
        const isHeader = (el: HTMLElement): boolean =>
          el.querySelector('[role="listitem"]') === null && el.querySelector('p') === null;
        const headers = items.filter(isHeader);
        const pinned = items.find((el) => el.style.position === 'sticky');
        const headerTops = headers
          .filter((el) => el !== pinned)
          .map((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
        if (pinned === undefined)
          return { pinned: undefined, under: undefined, expected: undefined, headerTops };

        const box = pinned.getBoundingClientRect();
        // Right at its foot, not a few pixels below: a header 3px into the
        // slot is still mostly behind the pinned one, and 4px down its own
        // first row would already show.
        const hit = document.elementFromPoint(window.innerWidth / 2, box.bottom + 0.5);
        const under = hit?.closest<HTMLElement>('[data-index]') ?? null;
        if (under === null)
          return { pinned: Number(pinned.dataset.index), under: undefined, expected: undefined, headerTops };

        // Under a row: that row's own day. Under a day header still sliding
        // up: the day before it, whose last row is what the pinned header covers.
        const underIndex = Number(under.dataset.index);
        const before = headers
          .map((el) => Number(el.dataset.index))
          .filter((i) => (isHeader(under) ? i < underIndex : i <= underIndex));

        return {
          pinned: Number(pinned.dataset.index),
          under: underIndex,
          expected: before.length === 0 ? undefined : Math.max(...before),
          headerTops,
        };
      });
    };

    // Collapse the bar first: in the frames it first mounts, the pinned slot's
    // offset is still on its way, and that is not what this measures.
    await scrollTo(page, start);
    await expect(page.getByTestId('collapsed-summary')).toBeVisible();

    const tops = new Set<number>();
    for (let y = start; y <= start + 900; y += 60) {
      const at = await probe(y);
      for (const top of at.headerTops) tops.add(top);
      if (at.pinned === undefined) continue;
      expect(at.under, `a row under the pinned header at ${String(y)}`).not.toBeUndefined();
      expect(at.pinned, `the pinned day at ${String(y)}`).toBe(at.expected);
    }

    const boundaries = [...tops]
      .filter((top) => top > start + 100 && top <= start + 900)
      .sort((a, b) => a - b);
    expect(boundaries.length).toBeGreaterThan(3);
    for (const top of boundaries) {
      const at = await probe(top - 24);
      expect(at.pinned, `a day pinned with its header at ${String(top)} behind the bar`).not.toBeUndefined();
      expect(at.under, `a row under the pinned header at ${String(top)}`).not.toBeUndefined();
      expect(at.pinned, `the pinned day with its header at ${String(top)} behind the bar`).toBe(at.expected);
    }
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

test.describe('@popouts the row menu', () => {
  /** Open the ⋯ menu of a row a little way down, so there is page around it. */
  async function openRowMenu(page: Page) {
    const more = page.getByRole('button', { name: /^Actions for / }).nth(2);
    await more.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  test('a tap on another row closes the menu, and opens nothing', async ({ page }) => {
    /*
     * The menu is not modal, so the page scrolls under it. A tap outside must
     * still do one thing only: close it. Without the backdrop the same tap
     * also landed on the row beneath and opened its editor.
     */
    await completeFirstRun(page, 'en');
    const menu = await openRowMenu(page);
    const menuBox = await menu.boundingBox();

    // The body of a row the menu does not cover.
    let target: { x: number; y: number } | undefined;
    for (const row of await page.getByRole('listitem').all()) {
      const box = await row.boundingBox();
      if (box === null || menuBox === null || box.y < 0) continue;
      const centre = { x: box.x + box.width / 3, y: box.y + box.height / 2 };
      const covered =
        centre.y >= menuBox.y - 12 &&
        centre.y <= menuBox.y + menuBox.height + 12 &&
        centre.x >= menuBox.x &&
        centre.x <= menuBox.x + menuBox.width;
      if (!covered && centre.y < (page.viewportSize()?.height ?? 0) - 40) {
        target = centre;
        break;
      }
    }
    expect(target, 'a row clear of the menu').toBeDefined();
    if (target === undefined) return;

    await page.mouse.click(target.x, target.y);
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
  });

  test('a scroll closes it, and the page does scroll', async ({ page }) => {
    await completeFirstRun(page, 'en');
    const menu = await openRowMenu(page);
    const box = await menu.boundingBox();
    // Over the page beside the menu, not the menu itself.
    await page.mouse.move(40, (box?.y ?? 200) + 10);
    await page.mouse.wheel(0, 300);

    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});

test.describe('@popouts not counted yet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Next month, where every row is not counted yet; a chip a little way down, and its row. */
  async function nextMonthChip(page: Page) {
    await completeFirstRun(page, 'en');
    await page.getByRole('button', { name: 'Next month' }).click();
    const chip = page.getByRole('button', { name: 'Not counted yet. Change it' }).nth(1);
    await expect(chip).toBeVisible();
    const row = chip.locator('xpath=ancestor::*[@role="listitem"]');
    const key = await row.getAttribute('data-key');
    if (key === null) throw new Error('a row without its key');
    return { chip, key };
  }

  test('its chip is a 44px-tall target, and opens a dialog named for it', async ({ page }) => {
    const { chip } = await nextMonthChip(page);
    // The chip is drawn small; its ::before is the hit area, 44px tall whatever the row clips.
    const reach = await chip.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const hits = (y: number) => document.elementFromPoint(x, y)?.closest('button') === el;
      let top = box.top + box.height / 2;
      while (hits(top - 1)) top -= 1;
      let bottom = box.top + box.height / 2;
      while (hits(bottom + 1)) bottom += 1;
      return bottom - top + 1;
    });
    expect(reach).toBeGreaterThanOrEqual(44);

    await chip.click();
    await expect(page.getByRole('dialog', { name: 'Not counted yet' })).toBeVisible();
  });

  test('"Charged today" moves it out of next month, and Undo brings it back', async ({ page }) => {
    const { chip, key } = await nextMonthChip(page);
    const row = page.locator(`[data-key="${key}"]`);

    await chip.click();
    await page.getByRole('button', { name: /Charged today/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row).toHaveCount(1);
  });

  test('"A different amount…" opens the form with the caret in the amount, and offers Undo', async ({
    page,
  }) => {
    const { chip, key } = await nextMonthChip(page);
    const amount = page.locator(`[data-key="${key}"] [data-value]`).first();
    const before = await amount.getAttribute('data-value');

    await chip.click();
    await page.getByRole('button', { name: /A different amount/ }).click();
    const field = page.getByRole('dialog').getByLabel('Amount', { exact: true });
    await expect(field).toBeFocused();
    await field.fill('1234.56');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(amount).not.toHaveAttribute('data-value', before ?? '');
    await expect(page.getByText('Amount changed')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(amount).toHaveAttribute('data-value', before ?? '');
  });

  test('"A different date…" opens the calendar inside the pop-out', async ({ page }) => {
    const { chip } = await nextMonthChip(page);

    await chip.click();
    await page.getByRole('button', { name: /A different date/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Not counted yet' });
    await expect(dialog.getByRole('grid')).toBeVisible();
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

      if (focused.testid === 'add-button') {
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

    // The + opens its menu with focus on the first item, "Expense".
    const fab = page.getByTestId('add-button');
    await fab.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: ADD_EXPENSE })).toBeFocused();
    // Escape closes the menu and hands focus back to the button.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(fab).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: ADD_EXPENSE })).toBeFocused();
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

    await page.getByTestId('add-button').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: ADD_EXPENSE })).toBeFocused();
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
     * Wait for the link to actually HOLD focus before measuring it: it is
     * `sr-only` until focused, so its box is meaningless until then.
     *
     * This spec failed intermittently under a full parallel run, and the first
     * diagnosis - that Tab had not landed yet - was wrong. The seeding helper
     * was returning while the WIZARD was still on screen, so the Tab went into
     * the wizard and was lost when the shell replaced it. That is fixed in
     * `completeFirstRun`, and pinned by the slow-write spec in 00-shell.
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
