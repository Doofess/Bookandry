import { expect, test } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';

/**
 * The card catalog, end to end: a card linked through its bank and company,
 * the rate table it fills in, and a purchase on it under the card's own deal.
 *
 * The figures are the catalog's: Mizrahi's published maximum for a Max
 * International card's fixed-installment credit is prime + 10.75. The e2e
 * build has no live prime, so it uses the built-in Bank of Israel rate (3.25,
 * so prime 4.75): 15.50% nominal, and 16.65% once compounded monthly (מתואמת).
 */

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'The catalog is read in English; Hebrew has its own labels.');
});

test('links a Max card through Mizrahi, shows its real rates, and prices a Credit Plus purchase', async ({
  page,
}) => {
  await completeFirstRun(page, 'en', { demo: false });

  // A card, linked: bank, then card company, then its type.
  await page.getByRole('link', { name: 'Cards' }).click();
  await page.getByRole('button', { name: 'Add a card' }).click();
  await page.getByLabel('Label', { exact: true }).fill('Max Mizrahi');
  const chooser = page.getByRole('group', { name: 'Who issues this card' });
  await chooser.getByRole('radio', { name: 'Mizrahi-Tefahot', exact: true }).click();
  await chooser.getByRole('radio', { name: 'Max', exact: true }).click();
  await chooser.getByRole('radio', { name: 'International', exact: true }).click();

  // The rate table: prime 4.75 + 10.75, and the same rate compounded monthly.
  const credit = page.getByTestId('rate-credit');
  await expect(credit).toContainText('15.50%');
  await expect(credit).toContainText('16.65%');
  await expect(page.getByText('Rates follow prime: 4.75% today')).toBeVisible();

  // Mizrahi publishes no Credit Plus rate: it is typed from the statement.
  const plus = page.getByTestId('rate-long_credit');
  await expect(plus).toContainText('Enter it from your statement');
  await plus.getByLabel('Credit Plus, on top of prime', { exact: true }).fill('10.75');
  await expect(plus).toContainText('15.50%');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: 'Max Mizrahi' })).toBeVisible();

  // A purchase on it: the card's own deal, with its reset at payment 19.
  await page.goto('/');
  await openAddSheet(page);
  await page.getByLabel('Amount', { exact: true }).fill('3000');
  // Shekels: the card's own deals are priced in them.
  await page.getByRole('combobox', { name: /^Currency/ }).click();
  await page.getByPlaceholder('Search currencies').fill('ILS');
  await page.getByRole('option', { name: /ILS/ }).first().click();
  await page.getByRole('combobox', { name: /Paid with/ }).click();
  await page.getByRole('option', { name: /Max Mizrahi/ }).click();
  await page.getByRole('radio', { name: 'Credit Plus', exact: true }).click();
  await page.getByLabel('Number of payments', { exact: true }).fill('24');
  await expect(page.getByTestId('deal-schedule')).toContainText('From payment 19');

  const sheet = page.locator('[data-slot="sheet-content"]');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('row-card').first()).toContainText('Max Mizrahi');
});
