import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';

/**
 * Business types (MCC), end to end: picked in the form, the category follows
 * it; moved from one category to another, the past expense goes with it,
 * after asking; and the feed's search finds rows by the type's name.
 */

const COPY = {
  en: {
    newTransaction: 'New transaction',
    name: 'What was it?',
    amount: 'Amount',
    save: 'Save',
    typeNotSet: 'Business type Not set',
    typeBakeries: 'Business type Bakeries',
    popout: 'Business type',
    search: 'Search by name or code',
    query: 'bakeries',
    option: /^Bakeries/,
    category: /^Category/,
    groceries: 'Groceries',
    dining: 'Eating out',
    typesOf: (name: string) => `Business types: ${name}`,
    add: 'Add a business type',
    question: 'Move the 1 past expense with this business type here too?',
    yes: 'Move them',
    moved: 'Moved 1 expense',
    movedHere: 'Moved here',
    feedSearch: 'Search',
    feedQuery: 'Bakeries',
  },
  he: {
    newTransaction: 'תנועה חדשה',
    name: 'מה זה היה?',
    amount: 'סכום',
    save: 'שמירה',
    typeNotSet: 'סוג עסק לא נקבע',
    typeBakeries: 'סוג עסק מאפיות',
    popout: 'סוג עסק',
    search: 'חיפוש לפי שם או קוד',
    query: 'מאפיות',
    option: /^מאפיות/,
    category: /^קטגוריה/,
    groceries: 'מצרכים',
    dining: 'אוכל בחוץ',
    typesOf: (name: string) => `סוגי עסק: ${name}`,
    add: 'הוספת סוג עסק',
    question: 'להעביר לכאן גם את ההוצאה הקודמת מסוג זה?',
    yes: 'להעביר',
    moved: 'הוצאה אחת הועברה',
    movedHere: 'הועבר לכאן',
    feedSearch: 'חיפוש',
    feedQuery: 'מאפיות',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** WCAG 2.2 A and AA, as in 07-a11y. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A bakery bought today, its business type picked in the form: the category follows it to Groceries. */
async function addBakery(page: Page, copy: Copy): Promise<void> {
  await openAddSheet(page);
  const form = page.getByRole('dialog', { name: copy.newTransaction });
  await form.getByLabel(copy.name, { exact: true }).fill('Lehamim');
  await form.getByLabel(copy.amount, { exact: true }).fill('32');
  await form.getByRole('button', { name: copy.typeNotSet }).click();
  const popout = page.getByRole('dialog', { name: copy.popout });
  await popout.getByPlaceholder(copy.search).fill(copy.query);
  await popout.getByRole('option', { name: copy.option }).click();
  await expect(form.getByRole('button', { name: copy.typeBakeries })).toBeVisible();
  await expect(form.getByRole('combobox', { name: copy.category })).toContainText(copy.groceries);
  await form.getByRole('button', { name: copy.save }).click();
  await expect(form).toBeHidden();
}

/** Move Bakeries into Eating out from the categories screen, moving the past expense too. */
async function moveBakeries(page: Page, copy: Copy): Promise<void> {
  await page.goto('/categories');
  await page.getByRole('button', { name: copy.typesOf(copy.dining) }).click();
  const sheet = page.getByRole('dialog', { name: copy.typesOf(copy.dining) });
  await sheet.getByRole('button', { name: copy.add }).click();
  const popout = page.getByRole('dialog', { name: copy.popout });
  await popout.getByPlaceholder(copy.search).fill(copy.query);
  await popout.getByRole('option', { name: copy.option }).click();

  const question = page.getByRole('alertdialog', { name: copy.question });
  await question.getByRole('button', { name: copy.yes }).click();
  await expect(page.getByText(copy.moved)).toBeVisible();
  await expect(sheet.getByText(copy.movedHere)).toBeVisible();
}

for (const lang of ['en', 'he'] as const) {
  test.describe(`@business-types in ${lang}`, () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== lang, 'Language is set by the project.');
    });

    test('a business type picked in the form files the expense, moves with its category, and is found by search', async ({
      page,
    }) => {
      const copy = COPY[lang];
      await completeFirstRun(page, lang, { demo: false });
      await addBakery(page, copy);

      // The feed's search finds the row by its business type's name.
      await page.getByLabel(copy.feedSearch, { exact: true }).fill(copy.feedQuery);
      await expect(page.getByTestId('row-text').filter({ hasText: 'Lehamim' })).toContainText(copy.groceries);

      await moveBakeries(page, copy);
      await page.goto('/');
      await page.getByLabel(copy.feedSearch, { exact: true }).fill(copy.feedQuery);
      await expect(page.getByTestId('row-text').filter({ hasText: 'Lehamim' })).toContainText(copy.dining);
    });

    test('passes axe with the form’s pop-out and the business types sheet open', async ({ page }) => {
      const copy = COPY[lang];
      const theme = lang === 'he' ? 'dark' : 'light';
      await page.emulateMedia({ colorScheme: theme });
      await completeFirstRun(page, lang, { demo: false, theme });

      const scan = async (what: string, include: string): Promise<void> => {
        const results = await new AxeBuilder({ page }).withTags(TAGS).include(include).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`),
          what,
        ).toEqual([]);
      };

      await openAddSheet(page);
      await page.getByRole('button', { name: copy.typeNotSet }).click();
      await expect(page.getByRole('dialog', { name: copy.popout })).toBeVisible();
      await scan('business type pop-out', '[data-slot="popover-content"]');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      await page.goto('/categories');
      await page.getByRole('button', { name: copy.typesOf(copy.groceries) }).click();
      await expect(page.getByRole('dialog', { name: copy.typesOf(copy.groceries) })).toBeVisible();
      await scan('business types sheet', '[role="dialog"]');
    });
  });
}

test.describe('@business-types on a phone', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The phone project.');
  });

  /** Controls inside `scope` shorter than 44px; the shared sheet's close button is existing chrome. */
  const short = (page: Page, scope: string) =>
    page.evaluate((selector) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll(
        `${selector} :is(button, a[href], input:not([type="hidden"]), [role="option"], [role="combobox"])`,
      )) {
        if (el.closest('[data-slot="sheet-close"], .sr-only') !== null) continue;
        const height = (el as HTMLElement).offsetHeight;
        if (height === 0) continue;
        if (height < 44)
          bad.push(`${el.tagName} "${el.textContent.trim().slice(0, 30)}" ${String(height)}px`);
      }
      return bad;
    }, scope);

  test('moves a business type, and keeps every new control at 44px', async ({ page }) => {
    const copy = COPY.en;
    await completeFirstRun(page, 'en', { demo: false });
    await addBakery(page, copy);

    await page.goto('/categories');
    await page.getByRole('button', { name: copy.typesOf(copy.dining) }).click();
    const sheet = page.getByRole('dialog', { name: copy.typesOf(copy.dining) });
    await expect(sheet).toBeVisible();
    expect(await short(page, '[role="dialog"]'), 'sheet').toEqual([]);
    await sheet.getByRole('button', { name: copy.add }).click();
    const popout = page.getByRole('dialog', { name: copy.popout });
    await popout.getByPlaceholder(copy.search).fill(copy.query);
    expect(await short(page, '[data-slot="popover-content"] [cmdk-list]'), 'pop-out').toEqual([]);
    await popout.getByRole('option', { name: copy.option }).click();
    await page
      .getByRole('alertdialog', { name: copy.question })
      .getByRole('button', { name: copy.yes })
      .click();
    await expect(sheet.getByText(copy.movedHere)).toBeVisible();
  });
});
