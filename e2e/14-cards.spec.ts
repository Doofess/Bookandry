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
    gold: 'Gold',
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
    pending: 'Not in the balance yet: bought by card, not yet charged',
    nextBill: /Next charge/,
    // The browser's locale makes dollars the base here: not the card's
    // currency, so its 2.5% foreign-currency fee is on top.
    charge: '256.25',
    demoCards: ['Max', 'Cal', 'Isracard'],
    networks: ['Mastercard', 'Visa'],
    household: 'Total commitments on the cards',
    commitments: 'Total commitments on the card',
  },
  he: {
    nav: 'כרטיסים',
    title: 'כרטיסי אשראי',
    add: 'הוספת כרטיס',
    label: 'תווית',
    lastDigits: '4 ספרות אחרונות',
    gold: 'זהב',
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
    pending: 'עדיין לא ביתרה: נקנה בכרטיס, טרם חויב',
    nextBill: /החיוב הבא/,
    charge: '250.00',
    demoCards: ['מקס', 'כאל', 'ישראכרט'],
    networks: ['מאסטרקארד', 'ויזה'],
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
      // The network's mark on the card, named for a screen reader.
      for (const network of copy.networks) {
        await expect(page.getByRole('img', { name: network, exact: true })).toBeVisible();
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
      await page.getByLabel(copy.lastDigits, { exact: true }).fill('5555');
      await page.getByRole('radio', { name: copy.max, exact: true }).click();
      // Its colour: picked from swatches shaped like the card.
      await page.getByTitle(copy.gold, { exact: true }).click();
      await page.getByRole('radio', { name: copy.day10, exact: true }).click();
      await page.getByLabel(copy.fxFee, { exact: true }).fill('2.5');
      await page.getByLabel(copy.limit, { exact: true }).fill('15,000');
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const tile = page.getByRole('article').filter({ hasText: 'Visa' });
      await expect(tile).toContainText(copy.billed);
      // Its last four digits, where a card prints them.
      await expect(tile).toContainText('5555');
      await expect(tile.getByTestId('card-face')).toHaveAttribute('data-color', 'gold');

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
      const sheet = page.locator('[data-slot="editor-panel"]');
      await expect(sheet.getByTestId('card-charge-note')).toContainText(copy.charged);
      await page.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(sheet).toHaveCount(0);
      // The feed says which card paid: a card and its last four digits.
      await expect(page.getByTestId('row-card').first()).toContainText('5555');

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

test.describe('@cards archive', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'en', 'The menu is read in English; its Hebrew copy is unit-tested.');
  });

  test('archives a card from its menu, keeps it under Archived cards, and restores it', async ({ page }) => {
    await completeFirstRun(page, 'en');
    await page.getByRole('link', { name: 'Cards' }).click();
    const card = page.getByRole('article').filter({ hasText: 'Yossi card' });
    await expect(card).toBeVisible();

    await card.getByRole('button', { name: 'Options for Yossi card' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await expect(page.locator('[data-sonner-toast]').first()).toContainText('Yossi card archived');
    await expect(card).toHaveCount(0);

    const archived = page.getByRole('button', { name: 'Archived cards (1)' });
    await archived.click();
    const list = page.getByRole('list', { name: 'Archived cards (1)' });
    await list.getByRole('button', { name: 'Options for Yossi card' }).click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();

    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: /^Archived cards/ })).toHaveCount(0);
  });
});

test.describe('@cards the brands’ logos', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'en',
      'Logos are the same in every language; the pickers are unit-tested.',
    );
  });

  /** Every logo on the page has loaded: bundled, precached and decodable, not a broken image. */
  const allLoaded = (page: Page) =>
    page
      .locator('[data-slot="brand-mark"] img')
      .evaluateAll((imgs) =>
        imgs.map((img) => (img instanceof HTMLImageElement && img.complete ? img.naturalWidth : 0)),
      );

  test('shows each bank, card company and network by its own logo, and fits a 320px phone', async ({
    page,
  }) => {
    await completeFirstRun(page, 'en', { demo: false });
    await page.getByRole('link', { name: 'Cards' }).click();
    await page.getByRole('button', { name: 'Add a card' }).click();
    const dialog = page.getByRole('dialog');
    const banks = dialog.getByRole('radiogroup', { name: 'Bank', exact: true });
    await expect(banks.getByRole('radio', { name: 'Bank Leumi' })).toBeVisible();
    await banks.getByRole('radio', { name: 'Bank Leumi' }).click();
    await expect(dialog.getByRole('radiogroup', { name: 'Card company', exact: true })).toBeVisible();

    const loaded = async () => {
      await expect.poll(async () => (await allLoaded(page)).length).toBeGreaterThan(20);
      await expect.poll(async () => (await allLoaded(page)).filter((width) => width === 0)).toEqual([]);
    };
    await loaded();
    // Each network by its mark alone, still named for a screen reader.
    for (const network of ['Visa', 'Mastercard', 'Amex', 'Diners', 'Isracard']) {
      await expect(
        dialog
          .getByRole('radiogroup', { name: 'Network' })
          .getByRole('radio', { name: network, exact: true }),
      ).toBeVisible();
    }

    await page.setViewportSize({ width: 320, height: 720 });
    await loaded();
    const sideways = await dialog.evaluate((sheet) => {
      const wide = [...sheet.querySelectorAll('[role="radiogroup"]')].filter(
        (group) => group.scrollWidth > group.clientWidth + 1,
      );
      return {
        page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        sheet: sheet.scrollWidth > sheet.clientWidth + 1,
        groups: wide.map((group) => group.getAttribute('aria-labelledby')),
      };
    });
    expect(sideways).toEqual({ page: false, sheet: false, groups: [] });
  });
});

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
    const fee = page.getByRole('listitem').filter({ hasText: 'דמי כרטיס' });
    await expect(fee).toContainText('14.90');

    // Its category icon is not a button (a fee is changed where the card is),
    // but a tap on it still opens what the row opens: the Cards screen.
    const icon = await fee.locator('[data-slot="category-chip"]').boundingBox();
    expect(icon).not.toBeNull();
    if (icon === null) return;
    await page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2);
    await expect(page).toHaveURL(/\/cards$/);
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
    const sheet = page.locator('[data-slot="editor-panel"]');
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
    // From lg the account is at the foot of the rail, below it in the screen head.
    const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
    const scope = desktop ? page.getByRole('navigation') : page.getByRole('main');
    await scope.getByRole('button', { name: 'חשבון והגדרות' }).click();
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

  test('highlights one bank at a time in the picker', async ({ page }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await openAccounts(page);
    await page.getByRole('button', { name: 'הוספת חשבון בנק' }).click();
    await page.getByRole('combobox', { name: /בנק/ }).click();
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    // Only the row the keyboard is on carries the highlight; every other row stays transparent.
    // Polled: the rows carry a (near-zero) colour transition, so the computed colour lags the attribute by a tick.
    await expect
      .poll(() =>
        options.evaluateAll(
          (rows) => rows.filter((row) => getComputedStyle(row).backgroundColor !== 'rgba(0, 0, 0, 0)').length,
        ),
      )
      .toBe(1);
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

test.describe('@forced-colours the Cards screen', () => {
  test('keeps an edge on every card face and the colour in every swatch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'en', 'One language is enough for a system colour scheme.');
    await page.emulateMedia({ forcedColors: 'active' });
    await completeFirstRun(page, 'en');
    await page.goto('/cards');

    // Windows High Contrast replaces backgrounds: the transparent 2px border is what it paints instead.
    const faces = page.getByTestId('card-face');
    await expect(faces.first()).toBeVisible();
    for (const face of await faces.all()) {
      const edge = await face.evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.borderTopWidth} ${style.borderTopStyle}`;
      });
      expect(edge).toBe('2px solid');
    }

    // The swatches keep their colour: here the colour is what is being chosen.
    await page.getByRole('button', { name: COPY.en.add }).click();
    const swatch = page.getByTitle(COPY.en.gold, { exact: true }).locator('[data-money]');
    expect(await swatch.evaluate((el) => getComputedStyle(el).forcedColorAdjust)).toBe('none');
  });
});
