import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun } from './support/seed';

/**
 * The cash tab, end to end: cash is PART of the balance. Setting up and
 * withdrawing move only the cash; paying in cash moves both; a recount that
 * finds money missing moves both by the difference.
 */

const COPY = {
  en: {
    cash: 'Cash',
    feed: 'Feed',
    setup: 'How much cash do you have now?',
    amount: 'Amount',
    save: 'Save',
    withdraw: /^Withdraw from ATM/,
    withdrawTitle: 'Withdraw from ATM',
    expense: /^Cash expense/,
    newTransaction: 'New transaction',
    count: /^Count my cash/,
    countTitle: 'Count my cash',
    wallet: 'How much is in the wallet now?',
    missing: /missing$/,
    activity: 'Activity',
    recount: 'Recount',
  },
  he: {
    cash: 'מזומן',
    feed: 'תנועות',
    setup: 'כמה מזומן יש לך עכשיו?',
    amount: 'סכום',
    save: 'שמירה',
    withdraw: /^משיכה מכספומט/,
    withdrawTitle: 'משיכה מכספומט',
    expense: /^הוצאה במזומן/,
    newTransaction: 'תנועה חדשה',
    count: /^ספירת מזומן/,
    countTitle: 'ספירת מזומן',
    wallet: 'כמה כסף יש בארנק עכשיו?',
    missing: /^חסרים/,
    activity: 'תנועות במזומן',
    recount: 'ספירה',
  },
} as const;

/** WCAG 2.2 A and AA, as in 07-a11y. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: /^(Primary|ניווט ראשי)$/ }).getByRole('link', { name, exact: true });
const cashFigure = (page: Page) => page.getByTestId('cash-amount').locator('[data-value]');
const balance = async (page: Page): Promise<number> =>
  Number(await page.getByTestId('balance-amount').locator('[data-value]').getAttribute('data-value'));

/** The cash sheet's own pills, which stand in for the Cash menu on a desktop, where the rail's Add is the only Add. */
const POT_PILL = {
  en: { withdraw: 'Withdraw', count: 'Count' },
  he: { withdraw: 'משיכה', count: 'ספירה' },
} as const;

/** One of the Cash menu's items: its menu on a phone, the pot's pills (or the form's address) on a desktop. */
async function fromMenu(page: Page, item: RegExp): Promise<void> {
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (!desktop) {
    await page.getByTestId('add-button').click();
    await page.getByRole('menuitem', { name: item }).click();
    return;
  }
  const lang = item.source === COPY.he.withdraw.source || item.source === COPY.he.count.source ? 'he' : 'en';
  const kind =
    item.source === COPY[lang].withdraw.source
      ? 'withdraw'
      : item.source === COPY[lang].count.source
        ? 'count'
        : 'expense';
  if (kind === 'expense') {
    await page.goto('/cash?add=expense&cash=1');
    return;
  }
  await page
    .locator('[data-slot="cash-sheet"]')
    .getByRole('button', { name: POT_PILL[lang][kind], exact: true })
    .click();
}

async function setUp(page: Page, lang: 'en' | 'he', amount: string): Promise<void> {
  const copy = COPY[lang];
  const card = page.getByTestId('cash-setup');
  await expect(card.getByRole('heading', { name: copy.setup })).toBeVisible();
  await card.getByLabel(copy.amount, { exact: true }).fill(amount);
  await card.getByRole('button', { name: copy.save }).click();
  await expect(card).toBeHidden();
}

for (const lang of ['en', 'he'] as const) {
  test.describe(`@cash in ${lang}`, () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== lang, 'Language is set by the project.');
    });

    test('set up, withdraw, pay and recount: the cash moves, and the balance only where money left', async ({
      page,
    }) => {
      const copy = COPY[lang];
      await completeFirstRun(page, lang, { demo: false });
      const before = await balance(page);

      // 1. Set up cash at 500.
      await tab(page, copy.cash).click();
      await setUp(page, lang, '500');
      await expect(cashFigure(page)).toHaveAttribute('data-value', '50000');

      // 2. Withdraw 200.
      await fromMenu(page, copy.withdraw);
      const withdraw = page.getByRole('dialog', { name: copy.withdrawTitle });
      await withdraw.getByLabel(copy.amount, { exact: true }).fill('200');
      await withdraw.getByRole('button', { name: copy.save }).click();
      await expect(withdraw).toBeHidden();
      await expect(cashFigure(page)).toHaveAttribute('data-value', '70000');

      // 3. Pay 50 in cash.
      await fromMenu(page, copy.expense);
      const form = page.getByRole('dialog', { name: copy.newTransaction });
      await form.getByLabel(copy.amount, { exact: true }).fill('50');
      await form.getByRole('button', { name: copy.save }).click();
      await expect(form).toBeHidden();

      // 4. 650 on hand, while the balance moved only by the 50 paid.
      await expect(cashFigure(page)).toHaveAttribute('data-value', '65000');
      await tab(page, copy.feed).click();
      await expect.poll(() => balance(page)).toBe(before - 5_000);

      // 5. Recount to 640: a "missing 10" row, and the balance moves by 10.
      await tab(page, copy.cash).click();
      await fromMenu(page, copy.count);
      const count = page.getByRole('dialog', { name: copy.countTitle });
      await count.getByLabel(copy.wallet, { exact: true }).fill('640');
      const difference = count.getByTestId('count-difference');
      await expect(difference).toHaveText(copy.missing);
      await expect(difference.locator('[data-value]')).toHaveAttribute('data-value', '1000');
      await count.getByRole('button', { name: copy.save }).click();
      await expect(count).toBeHidden();
      await expect(cashFigure(page)).toHaveAttribute('data-value', '64000');
      await expect(
        page.getByRole('region', { name: copy.activity }).getByText(copy.recount, { exact: true }),
      ).toBeVisible();

      await tab(page, copy.feed).click();
      await expect.poll(() => balance(page)).toBe(before - 6_000);
    });

    test('passes axe with the tab, its menu and its sheets open', async ({ page }) => {
      const copy = COPY[lang];
      const theme = lang === 'he' ? 'dark' : 'light';
      await page.emulateMedia({ colorScheme: theme });
      await completeFirstRun(page, lang, { demo: false, theme });
      await tab(page, copy.cash).click();
      await page.evaluate(() => document.fonts.ready);

      /** The whole screen, or - with a pop-out or sheet open - just that, as 07-a11y scans pop-outs. */
      const scan = async (what: string, include?: string): Promise<void> => {
        const builder = new AxeBuilder({ page }).withTags(TAGS);
        const results = await (include === undefined ? builder : builder.include(include)).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`),
          what,
        ).toEqual([]);
      };

      await scan('setup');
      await setUp(page, lang, '500');
      await scan('figure and activity');

      if ((page.viewportSize()?.width ?? 0) >= 1024) {
        await fromMenu(page, copy.withdraw);
      } else {
        await page.getByTestId('add-button').click();
        await expect(page.getByRole('menuitem', { name: copy.withdraw })).toBeVisible();
        await scan('add menu', '[data-slot="dropdown-menu-content"]');
        await page.getByRole('menuitem', { name: copy.withdraw }).click();
      }
      await expect(page.getByRole('dialog', { name: copy.withdrawTitle })).toBeVisible();
      await scan('withdraw sheet', '[role="dialog"]');
      await page.keyboard.press('Escape');

      await fromMenu(page, copy.count);
      await expect(page.getByRole('dialog', { name: copy.countTitle })).toBeVisible();
      await scan('count sheet', '[role="dialog"]');
    });
  });
}

test.describe('@cash on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 } });
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'en', 'Measured once, in English.');
  });

  /** Controls inside `scope` shorter than 44px; the shared sheet's close button is existing chrome. */
  const short = (page: Page, scope: string) =>
    page.evaluate((selector) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll(
        `${selector} :is(button, a[href], input:not([type="hidden"]), [role="radio"], [role="combobox"], [role="menuitem"])`,
      )) {
        if (el.closest('[data-slot="sheet-close"], .sr-only') !== null) continue;
        const height = (el as HTMLElement).offsetHeight;
        if (height === 0) continue;
        if (height < 44)
          bad.push(`${el.tagName} "${el.textContent.trim().slice(0, 30)}" ${String(height)}px`);
      }
      return bad;
    }, scope);

  test('keeps every new control at 44px', async ({ page }) => {
    await completeFirstRun(page, 'en', { demo: false });
    await page.goto('/cash');
    expect(await short(page, '[data-testid="cash-setup"]'), 'setup').toEqual([]);
    await setUp(page, 'en', '500');

    await page.getByTestId('add-button').click();
    await expect(page.getByRole('menuitem', { name: /^Withdraw from ATM/ })).toBeVisible();
    expect(await short(page, '[data-testid="cash-add-menu"]'), 'menu').toEqual([]);
    await page.getByRole('menuitem', { name: /^Withdraw from ATM/ }).click();
    const withdraw = page.getByRole('dialog', { name: 'Withdraw from ATM' });
    await withdraw.getByLabel('Amount', { exact: true }).fill('200');
    expect(await short(page, '[role="dialog"]'), 'withdraw sheet').toEqual([]);
    await withdraw.getByRole('button', { name: 'Save' }).click();
    await expect(withdraw).toBeHidden();

    expect(await short(page, '[data-slot="cash-moves"]'), 'activity').toEqual([]);

    await fromMenu(page, /^Count my cash/);
    await expect(page.getByRole('dialog', { name: 'Count my cash' })).toBeVisible();
    expect(await short(page, '[role="dialog"]'), 'count sheet').toEqual([]);
  });
});

test.describe('@cash on a 320px phone in Hebrew', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'he', 'The tightest case: Hebrew at 320px.');
  });

  test('fits four tabs, each 44px tall, with no label cut short', async ({ page }) => {
    await completeFirstRun(page, 'he');
    const tabs = page
      .getByRole('navigation', { name: 'ניווט ראשי' })
      .getByRole('link')
      .filter({ hasNotText: 'Bookandry' });
    await expect(tabs).toHaveCount(4);
    for (const link of await tabs.all()) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      if (box === null) continue;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320.5);
      const clipped = await link.evaluate((el) =>
        [...el.querySelectorAll('span:not(.sr-only)')].some(
          (span) => span.scrollWidth > span.clientWidth + 0.5,
        ),
      );
      expect(clipped).toBe(false);
    }
    expect(await page.evaluate(() => document.body.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test('fits a seven-figure cash figure on the panel', async ({ page }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await page.goto('/cash');
    await setUp(page, 'he', '1234567.89');
    // The pot shows whole shekels, like the concept's sheets.
    await expect(cashFigure(page)).toHaveAttribute('data-value', '123456800');
    const box = await cashFigure(page).boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    expect(await page.evaluate(() => document.body.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});
