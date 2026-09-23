import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun } from './support/seed';

/**
 * What an expense IS, which is not the same question as how often it repeats.
 *
 * The four types are the ones an Israeli already uses - עסקה רגילה, עסקת
 * תשלומים, עסקת קרדיט, הוראת קבע - and three of them collapse onto recurrence
 * the data model already had. These specs are about the parts a unit test
 * cannot see: which controls appear when, and the one required field that has
 * no default.
 */

/*
 * Playwright REQUIRES the first parameter to be a destructuring pattern, even
 * when no fixture is used.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Covered at desktop and in Hebrew.');
});

const COPY = {
  en: {
    regular: 'Regular transaction',
    installments: 'Installment transaction',
    credit: 'Credit installment',
    standing: 'Standing order',
    count: 'Number of payments',
    frequency: 'How often',
    monthly: 'Monthly',
    yearly: 'Yearly',
    save: 'Save',
    amount: 'Amount',
  },
  he: {
    regular: 'עסקה רגילה',
    installments: 'עסקת תשלומים',
    credit: 'עסקת קרדיט',
    standing: 'הוראת קבע',
    count: 'מספר תשלומים',
    frequency: 'כל כמה זמן',
    monthly: 'חודשי',
    yearly: 'שנתי',
    save: 'שמירה',
    amount: 'סכום',
  },
} as const;

async function openAddSheet(page: Page, lang: 'en' | 'he'): Promise<void> {
  await completeFirstRun(page, lang);
  await page.getByTestId('fab').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

for (const lang of ['en', 'he'] as const) {
  test.describe(`@type in ${lang}`, () => {
    // Each language runs in the project whose browser locale matches, so the
    // wizard and the sheet are both in the language being asserted.
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== lang, 'Language is set by the project.');
    });

    const copy = COPY[lang];

    test('offers the four types an Israeli actually uses', async ({ page }) => {
      await openAddSheet(page, lang);

      for (const name of [copy.regular, copy.installments, copy.credit, copy.standing]) {
        await expect(page.getByRole('radio', { name, exact: true })).toBeVisible();
      }

      // "Repeats" is gone for an expense: it asked the user to translate their
      // own word for the thing into the app's.
      await expect(page.getByRole('radio', { name: copy.monthly, exact: true })).toHaveCount(0);
    });

    test('opens the payment count for BOTH plans, and only for those', async ({ page }) => {
      /*
       * תשלומים and קרדיט ask the same question, because they are the same
       * arrangement - a purchase split over N months - and differ only in the
       * interest the issuer adds.
       */
      await openAddSheet(page, lang);
      const count = page.getByLabel(copy.count, { exact: true });

      await expect(count).toHaveCount(0);

      await page.getByRole('radio', { name: copy.installments, exact: true }).click();
      await expect(count).toBeVisible();

      await page.getByRole('radio', { name: copy.credit, exact: true }).click();
      await expect(count).toBeVisible();

      await page.getByRole('radio', { name: copy.regular, exact: true }).click();
      await expect(count).toHaveCount(0);
    });

    test('makes a standing order choose monthly or yearly, with neither preselected', async ({ page }) => {
      /*
       * The one required field with no default. Monthly is the likelier answer
       * and preselecting it would still be wrong: arnona and most insurance
       * policies are yearly, and a default that is right most of the time is
       * how the wrong one gets saved without ever being read.
       */
      await openAddSheet(page, lang);
      await page.getByRole('radio', { name: copy.standing, exact: true }).click();

      const monthly = page.getByRole('radio', { name: copy.monthly, exact: true });
      const yearly = page.getByRole('radio', { name: copy.yearly, exact: true });

      await expect(monthly).toBeVisible();
      await expect(yearly).toBeVisible();
      await expect(monthly).toHaveAttribute('aria-checked', 'false');
      await expect(yearly).toHaveAttribute('aria-checked', 'false');
    });

    test('refuses to save a standing order until the frequency is answered', async ({ page }) => {
      await openAddSheet(page, lang);

      await page.getByLabel(copy.amount, { exact: true }).fill('250');
      await page.getByRole('radio', { name: copy.standing, exact: true }).click();
      await page.getByRole('button', { name: copy.save, exact: true }).click();

      // Still open, because the form would not take it.
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.getByRole('radio', { name: copy.monthly, exact: true }).click();
      await page.getByRole('button', { name: copy.save, exact: true }).click();

      // And now it closes, which is the only proof that the refusal was about
      // the frequency and not about something else on the form.
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  });
}
