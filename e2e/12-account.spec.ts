import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun } from './support/seed';

/**
 * An account's data is shown only while that account is signed in.
 *
 * A device holding an account's data with no session - locked after
 * inactivity, or signed out from another device - must show the sign-in
 * screen and nothing behind it. This drives the real build: the gate sits
 * outside the whole app, so a unit test of the gate alone would not prove the
 * feed never renders.
 */

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Drives English copy; once is enough.');
});

/** Mark this device's data as an account's, as an earlier sign-in would have. */
async function heldByAnAccount(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('greenback');
        open.onsuccess = () => {
          const tx = open.result.transaction(['meta'], 'readwrite');
          tx.objectStore('meta').put({ key: 'syncDataOwner', value: 'someone' });
          tx.objectStore('meta').put({ key: 'accountEmail', value: 'dana@example.com' });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error(String(tx.error)));
          };
        };
      }),
  );
}

test('shows only the sign-in screen, and can remove the data from there', async ({ page }) => {
  await completeFirstRun(page, 'en', { demo: true });
  await heldByAnAccount(page);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('dana@example.com');
  await expect(page.locator('[data-value]')).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove this data from the device' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove this data from the device' })
    .click();

  // Starts over from nothing: the setup wizard, no account in sight.
  await expect(page.getByRole('heading', { name: /language and currency/i })).toBeVisible();
});

test('a device with no account opens as it always did', async ({ page }) => {
  await completeFirstRun(page, 'en', { demo: true });
  await page.reload();
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await expect(page.locator('[data-value]').first()).toBeAttached();
});
