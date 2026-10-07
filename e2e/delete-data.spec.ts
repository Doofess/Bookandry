import { expect, test } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';

/**
 * Delete all data, signed out: the local-only path, where "delete" erases this
 * device and asks nobody. The linked path (emails to every other member) needs
 * a real account and is covered by the unit and server tests.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'English copy; the flow is the same in every language.');
});

test('erases the transactions, keeps the built-in categories', async ({ page }) => {
  await completeFirstRun(page, 'en');
  // Demo data is there before: the feed is not in its empty state.
  await expect(page.getByText('Nothing here yet')).toHaveCount(0);

  await page.goto('/settings/data');
  await page.getByRole('button', { name: 'Delete all data' }).click();

  const dialog = page.getByRole('alertdialog');
  const confirm = dialog.getByRole('button', { name: 'Delete everything' });
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText('All data was deleted')).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // The feed is empty...
  await page.goto('/');
  await expect(page.getByText('Nothing here yet')).toBeVisible();

  // ...and the categories every install starts with are still offered.
  await openAddSheet(page);
  await page.getByRole('combobox', { name: /^Category/ }).click();
  await expect(page.getByRole('option', { name: 'Groceries' })).toBeVisible();
});
