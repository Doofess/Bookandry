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
    loan: 'Loan',
    loanCount: 'Number of monthly payments',
    loansCategory: 'Loans',
    loanRow: 'Loan 1 of 360',
    fixed: 'Fixed',
    prime: 'Prime',
    margin: 'On top of prime',
    primeTitle: 'Prime rate',
    primeLoan: /This loan: 6\.25% a year/,
    count: 'Number of payments',
    frequency: 'How often',
    monthly: 'Monthly',
    yearly: 'Yearly',
    save: 'Save',
    amount: 'Amount',
    paidWith: 'Paid with',
    rate: 'Annual interest',
    addMethod: 'Add a payment method',
    methodLabel: 'Label',
    methodRate: 'Annual credit interest',
    cash: 'Cash',
    cheque: 'Cheque',
    firstPayment: 'First payment',
    day: 'On day',
    typed: '11/01/2025',
    midMonth: '11/16/2025',
    partial: 'Charge only for the days used in the first month',
    partialText: /15 of 30 days/,
    readout: /November 1, 2025/,
    past: /Starts in the past: \d+ payments, November 2025 to/,
  },
  he: {
    regular: 'עסקה רגילה',
    installments: 'עסקת תשלומים',
    credit: 'עסקת קרדיט',
    standing: 'הוראת קבע',
    loan: 'הלוואה',
    loanCount: 'מספר החזרים חודשיים',
    loansCategory: 'הלוואות',
    loanRow: 'הלוואה 1 מתוך 360',
    fixed: 'קבועה',
    prime: 'פריים',
    margin: 'מעל הפריים',
    primeTitle: 'ריבית הפריים',
    primeLoan: /ריבית ההלוואה: 6\.25% לשנה/,
    count: 'מספר תשלומים',
    frequency: 'כל כמה זמן',
    monthly: 'חודשי',
    yearly: 'שנתי',
    save: 'שמירה',
    amount: 'סכום',
    paidWith: 'אמצעי תשלום',
    rate: 'ריבית שנתית',
    addMethod: 'הוספת אמצעי תשלום',
    methodLabel: 'תווית',
    methodRate: 'ריבית שנתית לעסקאות קרדיט',
    cash: 'מזומן',
    cheque: "צ'ק",
    firstPayment: 'תשלום ראשון',
    day: 'ביום',
    typed: '01/11/2025',
    midMonth: '16/11/2025',
    partial: 'חיוב רק על הימים שנוצלו בחודש הראשון',
    partialText: /15 מתוך 30 ימים/,
    readout: /1 בנובמבר 2025/,
    past: /מתחיל בעבר: \d+ תשלומים, מ־נובמבר 2025 עד/,
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

    test('offers the five types an Israeli actually uses', async ({ page }) => {
      await openAddSheet(page, lang);

      for (const name of [copy.regular, copy.installments, copy.credit, copy.standing, copy.loan]) {
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

    test('prices a קרדיט plan with the card’s own rate, and shows the interest in money', async ({
      page,
    }) => {
      /*
       * The rate is set ONCE, on the card, and arrives in the form when the
       * card is chosen - nobody should be asked for a number that is printed on
       * their statement every month. ₪1,200 over 6 at 12% is six payments of
       * ₪207.06: ₪1,242.36 in all, ₪42.36 of it interest.
       */
      await completeFirstRun(page, lang, { demo: false });

      await page.goto('/payment-methods');
      await page.getByRole('button', { name: copy.addMethod, exact: true }).click();
      await page.getByLabel(copy.methodLabel, { exact: true }).fill('Visa');
      await page.getByLabel(copy.methodRate, { exact: true }).fill('12');
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.goto('/');
      await page.getByTestId('fab').click();
      await page.getByLabel(copy.amount, { exact: true }).fill('1200');
      await page.getByRole('radio', { name: copy.credit, exact: true }).click();
      await page.getByLabel(copy.count, { exact: true }).fill('6');

      const rate = page.getByLabel(copy.rate, { exact: true });
      // No card yet, so no rate: an empty field is an interest-free plan.
      await expect(rate).toHaveValue('');

      await page.getByRole('combobox', { name: new RegExp(copy.paidWith) }).click();
      await page.getByRole('option', { name: /Visa/ }).click();
      await expect(rate).toHaveValue('12');

      // The SHEET, by its slot: the method picker is a dialog too, and it is
      // still in the DOM for the length of its closing animation.
      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toContainText('1,242.36');
      await expect(sheet).toContainText('207.06');
      // The interest on its own, not as the tail of "1,242.36".
      await expect(sheet).toContainText(/(?<![\d,])42\.36/);

      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(sheet).toHaveCount(0);

      // What the feed shows is what the card will charge, not the price typed.
      await expect(page.getByText(/207\.06/).first()).toBeVisible();
    });

    test('pays back a loan, priced on a לוח שפיצר, filed under Loans', async ({ page }) => {
      /*
       * ₪500,000 over 30 years at 5%: ₪2,684.11 a month, ₪966,279.60 in all,
       * ₪466,279.60 of it interest - said before saving, in money.
       */
      await completeFirstRun(page, lang, { demo: false });
      await page.getByTestId('fab').click();
      await page.getByLabel(copy.amount, { exact: true }).fill('500000');
      await page.getByRole('radio', { name: copy.loan, exact: true }).click();
      await page.getByLabel(copy.loanCount, { exact: true }).fill('360');
      await page.getByRole('radio', { name: copy.fixed, exact: true }).click();
      await page.getByLabel(copy.rate, { exact: true }).fill('5');

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toContainText('2,684.11');
      await expect(sheet).toContainText('966,279.60');
      await expect(sheet).toContainText('466,279.60');
      // The type chose the category.
      await expect(sheet).toContainText(copy.loansCategory);

      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(sheet).toHaveCount(0);

      // The feed says which repayment it is.
      const row = page.getByRole('listitem').filter({ hasText: copy.loanRow });
      await expect(row).toBeVisible();
      await expect(row).toContainText('2,684.11');
    });

    test('prices a loan at prime plus its margin, prime being the Bank of Israel’s', async ({ page }) => {
      /*
       * The Bank of Israel at 3.25 makes prime 4.75. A loan at P+1.5 is 6.25%:
       * ₪500,000 over 30 years is ₪3,078.59 a month. Prime is shown, not typed.
       */
      // This build has no relay (no Supabase), so prime is the build's own
      // figure - the Bank of Israel at 3.25 - shown with its date.
      await completeFirstRun(page, lang, { demo: false });

      // On the main screen.
      const strip = page.getByTestId('prime-strip');
      await expect(strip).toContainText(copy.primeTitle);
      await expect(strip).toContainText('4.75%');
      await expect(strip).toContainText('3.25%');

      await page.getByTestId('fab').click();
      await page.getByLabel(copy.amount, { exact: true }).fill('500000');
      await page.getByRole('radio', { name: copy.loan, exact: true }).click();
      await page.getByLabel(copy.loanCount, { exact: true }).fill('360');

      const prime = page.getByLabel(copy.prime, { exact: true });
      await expect(prime).toHaveValue('4.75');
      await expect(prime).toHaveAttribute('readonly', '');
      await page.getByLabel(copy.margin, { exact: true }).fill('1.5');

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toContainText(copy.primeLoan);
      await expect(sheet).toContainText('3,078.59');

      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByRole('listitem').filter({ hasText: copy.loanRow })).toContainText('3,078.59');
    });

    test('pays by cheque once or in instalments, and a קרדיט only by credit card', async ({ page }) => {
      await completeFirstRun(page, lang, { demo: false });
      await page.goto('/payment-methods');
      await page.getByRole('button', { name: copy.addMethod, exact: true }).click();
      await page.getByLabel(copy.methodLabel, { exact: true }).fill('Visa');
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.goto('/');
      await page.getByTestId('fab').click();
      await page.getByLabel(copy.amount, { exact: true }).fill('4500');
      const paidWith = page.getByRole('combobox', { name: new RegExp(copy.paidWith) });
      const offered = async (): Promise<string[]> => {
        await paidWith.click();
        const names = await page.getByRole('option').allInnerTexts();
        await page.keyboard.press('Escape');
        return names.join('|').split('|');
      };

      // A regular purchase: cheques are there from the start, nothing to set up.
      await paidWith.click();
      await page.getByRole('option', { name: new RegExp(copy.cheque) }).click();
      await expect(paidWith).toContainText(copy.cheque);

      // תשלומים by post-dated cheques keeps it.
      await page.getByRole('radio', { name: copy.installments, exact: true }).click();
      await expect(paidWith).toContainText(copy.cheque);

      // A standing order is the bank paying by itself: the cheque goes, and is not offered.
      await page.getByRole('radio', { name: copy.standing, exact: true }).click();
      await expect(paidWith).not.toContainText(copy.cheque);
      const forStanding = (await offered()).join(' ');
      expect(forStanding).not.toContain(copy.cheque);
      expect(forStanding).toContain(copy.cash);

      // קרדיט: the card's own arrangement, so the card and nothing else.
      await page.getByRole('radio', { name: copy.credit, exact: true }).click();
      const forCredit = (await offered()).join(' ');
      expect(forCredit).toContain('Visa');
      expect(forCredit).not.toContain(copy.cash);
      expect(forCredit).not.toContain(copy.cheque);
    });

    test('starts a standing order in the past, typed the way the language writes dates', async ({ page }) => {
      await openAddSheet(page, lang);
      await page.getByLabel(copy.amount, { exact: true }).fill('3200');
      await page.getByRole('radio', { name: copy.standing, exact: true }).click();
      await page.getByRole('radio', { name: copy.monthly, exact: true }).click();

      // November 1st 2025: 11/01 in English, 01/11 in Hebrew - and spelled out
      // underneath, so the order it was read in is never a guess.
      const date = page.getByLabel(copy.firstPayment, { exact: true });
      await date.fill(copy.typed);
      await date.press('Enter');
      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toContainText(copy.readout);

      // The day it repeats on follows the first payment.
      await expect(page.getByLabel(copy.day, { exact: true })).toHaveValue('1');
      // And the months since are said to be filled in, before saving.
      await expect(sheet).toContainText(copy.past);

      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // And the feed says what it is, not only what it cost.
      await expect(page.getByRole('listitem').filter({ hasText: copy.standing }).first()).toBeVisible();
    });

    test('charges a first month that starts mid-month only for its days', async ({ page }) => {
      /*
       * ₪300 a month, billed on the 1st, started on 16 November: 15 of the
       * month's 30 days, so ₪150 then, and ₪300 from 1 December.
       */
      await completeFirstRun(page, lang, { demo: false });
      await page.getByTestId('fab').click();
      await page.getByLabel(copy.amount, { exact: true }).fill('300');
      await page.getByRole('radio', { name: copy.standing, exact: true }).click();
      await page.getByRole('radio', { name: copy.monthly, exact: true }).click();
      const date = page.getByLabel(copy.firstPayment, { exact: true });
      await date.fill(copy.midMonth);
      await date.press('Enter');
      await page.getByLabel(copy.day, { exact: true }).fill('1');

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(page.getByRole('switch', { name: copy.partial })).toBeChecked();
      await expect(sheet).toContainText(copy.partialText);
      await expect(sheet).toContainText('150.00');

      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Exactly what was promised: one part-month charge, one rule from the 1st.
      const saved = await page.evaluate(
        () =>
          new Promise<{ date: string; amount: number; type: string }[]>((resolve, reject) => {
            const open = indexedDB.open('greenback');
            open.onerror = () => {
              reject(new Error('open failed'));
            };
            open.onsuccess = () => {
              const all = open.result.transaction('transactions').objectStore('transactions').getAll();
              all.onsuccess = () => {
                const rows = all.result as {
                  date: string;
                  money: { amountMinor: number };
                  recurrence: { type: string };
                }[];
                resolve(
                  rows
                    .map((r) => ({ date: r.date, amount: r.money.amountMinor, type: r.recurrence.type }))
                    .sort((a, b) => a.date.localeCompare(b.date)),
                );
              };
            };
          }),
      );
      expect(saved).toEqual([
        { date: '2025-11-16', amount: 15000, type: 'one_time' },
        { date: '2025-12-01', amount: 30000, type: 'monthly' },
      ]);
    });

    test('refuses a rate that is not one, and says why', async ({ page }) => {
      await openAddSheet(page, lang);
      await page.getByLabel(copy.amount, { exact: true }).fill('1200');
      await page.getByRole('radio', { name: copy.credit, exact: true }).click();

      const rate = page.getByLabel(copy.rate, { exact: true });
      await rate.fill('150');
      await page.getByRole('button', { name: copy.save, exact: true }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(rate).toHaveAttribute('aria-invalid', 'true');

      await rate.fill('9.9');
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  });
}
