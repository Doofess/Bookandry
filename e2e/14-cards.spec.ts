import { expect, test, type Page } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';

/**
 * Credit cards: what is on each one, and when the bank is charged for it.
 *
 * The point a unit test cannot see is the whole path: a card set up with a
 * billing day, an expense paid with it, and the balance NOT moving until the
 * bill - with the breakdown saying why - while the card's own screen shows the
 * bill it is waiting on.
 */

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Covered at desktop and in Hebrew.');
});

const COPY = {
  en: {
    nav: 'Cards',
    title: 'Credit cards',
    add: 'Add a card',
    label: 'Label',
    lastDigits: 'Last 4 digits',
    max: 'Max',
    day10: 'The 10th',
    fxFee: 'Foreign-currency fee',
    limit: 'Credit limit',
    save: 'Save',
    billed: 'Billed on the 10th',
    amount: 'Amount',
    paidWith: 'Paid with',
    charged: /Charged to the bank with this card's bill on/,
    balance: 'Balance',
    pending: 'Bought by card, not yet charged',
    nextBill: /Next charge/,
    // The browser's locale makes dollars the base here: not the card's
    // currency, so its 2.5% foreign-currency fee is on top.
    charge: '256.25',
    demoCards: ['Max', 'Cal', 'Isracard'],
    household: 'Total commitments on the cards',
    commitments: 'Total commitments on the card',
  },
  he: {
    nav: 'כרטיסים',
    title: 'כרטיסי אשראי',
    add: 'הוספת כרטיס',
    label: 'תווית',
    lastDigits: '4 ספרות אחרונות',
    max: 'מקס',
    day10: 'ב־10 לחודש',
    fxFee: 'עמלת עסקה במט״ח',
    limit: 'מסגרת אשראי',
    save: 'שמירה',
    billed: 'חיוב ב־10 לחודש',
    amount: 'סכום',
    paidWith: 'אמצעי תשלום',
    charged: /יחויב בבנק עם חיוב הכרטיס ב־/,
    balance: 'יתרה',
    pending: 'נקנה בכרטיס, טרם חויב',
    nextBill: /החיוב הבא/,
    charge: '250.00',
    demoCards: ['מקס', 'כאל', 'ישראכרט'],
    household: 'סך הכל התחייבויות בכרטיסים',
    commitments: 'סך הכל התחייבויות בכרטיס',
  },
} as const;

for (const lang of ['en', 'he'] as const) {
  test.describe(`@cards in ${lang}`, () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== lang, 'Language is set by the project.');
    });
    const copy = COPY[lang];

    test('shows each card the way its company does, with its next bill', async ({ page }) => {
      await completeFirstRun(page, lang);
      await page.getByRole('link', { name: copy.nav }).click();
      await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
      for (const issuer of copy.demoCards) {
        await expect(page.getByRole('article').filter({ hasText: issuer }).first()).toBeVisible();
      }
      // A limit, as a meter.
      await expect(page.getByRole('meter', { name: copy.limit }).first()).toBeVisible();
      // What the household's cards still have to charge, and each card's own.
      await expect(page.getByRole('heading', { level: 2, name: copy.household })).toBeVisible();
      await expect(page.getByTestId('card-commitments').first()).toContainText(copy.commitments);
    });

    test('charges a card purchase on the billing day, not the day it was made', async ({ page }) => {
      await completeFirstRun(page, lang, { demo: false });

      // The card: Max, billed on the 10th.
      await page.getByRole('link', { name: copy.nav }).click();
      await page.getByRole('button', { name: copy.add }).click();
      await page.getByLabel(copy.label, { exact: true }).fill('Visa');
      await page.getByLabel(copy.lastDigits, { exact: true }).fill('3214');
      await page.getByRole('radio', { name: copy.max, exact: true }).click();
      await page.getByRole('radio', { name: copy.day10, exact: true }).click();
      await page.getByLabel(copy.fxFee, { exact: true }).fill('2.5');
      await page.getByLabel(copy.limit, { exact: true }).fill('15,000');
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const tile = page.getByRole('article').filter({ hasText: 'Visa' });
      await expect(tile).toContainText(copy.billed);
      // Its last four digits, where a card prints them.
      await expect(tile).toContainText('3214');

      // The balance before.
      await page.goto('/');
      const balance = page.getByTestId('balance-amount');
      const before = await balance.getAttribute('data-value', { timeout: 5000 }).catch(() => null);
      const beforeText = await balance.textContent();

      // A purchase on it, today.
      await openAddSheet(page);
      await page.getByLabel(copy.amount, { exact: true }).fill('250');
      await page.getByRole('combobox', { name: new RegExp(copy.paidWith) }).click();
      await page.getByRole('option', { name: /Visa/ }).click();
      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet.getByTestId('card-charge-note')).toContainText(copy.charged);
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(sheet).toHaveCount(0);
      // The feed says which card paid: a card and its last four digits.
      await expect(page.getByTestId('row-card').first()).toContainText('3214');

      // Not taken yet: the balance is as it was, and the breakdown says why.
      await expect(balance).toHaveText(beforeText ?? '');
      if (before !== null) await expect(balance).toHaveAttribute('data-value', before);
      await page
        .getByRole('button', { name: new RegExp(copy.balance) })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toContainText(copy.pending);
      await expect(page.getByRole('dialog')).toContainText(copy.charge);
      await page.keyboard.press('Escape');

      // And it is on the card's coming bill.
      await page.getByRole('link', { name: copy.nav }).click();
      await expect(tile).toContainText(copy.nextBill);
      await expect(tile).toContainText(copy.charge);
      // A commitment until it is charged: on the card, and in the household's total.
      await expect(tile.getByTestId('card-commitments')).toContainText(copy.charge);
      await expect(page.getByTestId('household-commitments')).toContainText(copy.charge);
    });
  });
}

test.describe('@cards the monthly fee', () => {
  // A shekel base: the fee is in shekels, so the Hebrew project is the one.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'he', 'The fee is charged in a shekel base.');
  });

  test('charges the fee on the card each month, and says how close the discount is', async ({ page }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await page.getByRole('link', { name: 'כרטיסים' }).click();
    await page.getByRole('button', { name: 'הוספת כרטיס' }).click();
    await page.getByLabel('תווית', { exact: true }).fill('Visa');
    await page.getByRole('radio', { name: 'ב־10 לחודש', exact: true }).click();
    await page.getByLabel('דמי כרטיס, לחודש', { exact: true }).fill('14.90');
    await page.getByLabel('סכום שימוש חודשי לקבלת ההנחה', { exact: true }).fill('3,000');
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const status = page.getByTestId('fee-status');
    await expect(status).toContainText('14.90');
    await expect(status).toContainText('3,000.00');
    await expect(page.getByRole('meter', { name: 'ההוצאה לקראת ההנחה בדמי הכרטיס' })).toBeVisible();

    // And in the feed, as a line on the card at the month's end.
    await page.getByRole('link', { name: 'תנועות' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'דמי כרטיס' })).toContainText('14.90');
  });
});

test.describe('@cards what a card is committed to', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'he', 'Shekels on a shekel card: covered in Hebrew.');
  });

  test('counts a קרדיט plan’s every payment, interest included, on the card and in the household', async ({
    page,
  }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await page.getByRole('link', { name: 'כרטיסים' }).click();
    await page.getByRole('button', { name: 'הוספת כרטיס' }).click();
    await page.getByLabel('תווית', { exact: true }).fill('Visa');
    await page.getByRole('radio', { name: 'ב־10 לחודש', exact: true }).click();
    await page
      .getByRole('radiogroup', { name: 'ריבית קרדיט', exact: true })
      .getByRole('radio', { name: 'קבועה', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'ריבית קרדיט', exact: true }).fill('12');
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ₪1,200 over 6 at 12%: six payments of ₪207.06, ₪1,242.36 in all.
    await page.goto('/');
    await openAddSheet(page);
    await page.getByLabel('סכום', { exact: true }).fill('1200');
    await page.getByRole('radio', { name: 'עסקת קרדיט', exact: true }).click();
    await page.getByLabel('מספר תשלומים', { exact: true }).fill('6');
    await page.getByRole('combobox', { name: /אמצעי תשלום/ }).click();
    await page.getByRole('option', { name: /Visa/ }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(sheet).toHaveCount(0);

    await page.getByRole('link', { name: 'כרטיסים' }).click();
    const box = page.getByTestId('card-commitments');
    await expect(box).toContainText('סך הכל התחייבויות בכרטיס');
    await expect(box).toContainText('1,242.36');
    await expect(box).toContainText('מתוכם ריבית');
    await box.getByRole('button', { name: /עסקאות תשלומים והלוואות בכרטיס/ }).click();
    await expect(box).toContainText('נותרו 6 מתוך 6 תשלומים');
    await expect(page.getByTestId('household-commitments')).toContainText('1,242.36');
  });
});

test.describe('@cards bank accounts', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'he', 'Hebrew: the language the account is written in.');
  });

  /** From the account menu, where the household's setup lives. */
  const openAccounts = async (page: Page) => {
    await page.getByRole('button', { name: 'חשבון והגדרות' }).click();
    await page.getByRole('menuitem', { name: 'חשבונות בנק' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'חשבונות בנק' })).toBeVisible();
  };

  test('adds an account by its number, names its branch, and offers it to a new card', async ({ page }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await openAccounts(page);

    // Pasted whole, the way a cheque prints it: bank, branch and number fill in.
    await page.getByRole('button', { name: 'הוספת חשבון בנק' }).click();
    await page.getByLabel('מספר חשבון', { exact: true }).fill('12-532-123456');
    await expect(page.getByRole('combobox', { name: /בנק/ })).toContainText('בנק הפועלים');
    await expect(page.getByLabel('מספר סניף', { exact: true })).toHaveValue('532');
    await expect(page.getByLabel('מספר חשבון', { exact: true })).toHaveValue('123456');
    // The branch, by name, from the Bank of Israel's list.
    await expect(page.getByText('סניף: שאול המלך')).toBeVisible();
    // Named after its bank until named otherwise.
    await expect(page.getByLabel('תווית', { exact: true })).toHaveValue('בנק הפועלים');
    await page.getByRole('radio', { name: 'משותף', exact: true }).click();
    await page.getByLabel('בעלים נוספים', { exact: true }).fill('דנה');
    await page.getByLabel('מסגרת עו״ש', { exact: true }).fill('10,000');
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const account = page.getByRole('article').filter({ hasText: '12-532-123456' });
    await expect(account).toContainText('משותף');
    await expect(account).toContainText('דנה');
    await expect(account).toContainText('10,000');

    // A new card is offered the account it is paid from.
    await page.getByRole('link', { name: 'כרטיסים' }).click();
    await page.getByRole('button', { name: 'הוספת כרטיס' }).click();
    await page.getByLabel('תווית', { exact: true }).fill('Visa');
    await page.getByRole('radio', { name: 'ב־10 לחודש', exact: true }).click();
    await page
      .getByRole('radiogroup', { name: 'משולם מהחשבון', exact: true })
      .getByRole('radio', { name: /3456/ })
      .click();
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The Cards screen is about cards: the accounts are not on it.
    await expect(page.getByRole('heading', { name: 'חשבונות בנק' })).toHaveCount(0);
    await openAccounts(page);
    await expect(account).toContainText('חיובי כרטיסים שיורדים מהחשבון');
    await expect(account).toContainText('Visa');
  });

  test('finds the Arab banks by their Arabic name', async ({ page }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await openAccounts(page);
    await page.getByRole('button', { name: 'הוספת חשבון בנק' }).click();
    await page.getByRole('combobox', { name: /בנק/ }).click();
    await page.getByPlaceholder('חיפוש לפי שם או קוד').fill('بنك فلسطين');
    await page.getByRole('option', { name: /בנק פלסטין/ }).click();
    await expect(page.getByRole('combobox', { name: /בנק/ })).toContainText('בנק פלסטין');
  });
});
