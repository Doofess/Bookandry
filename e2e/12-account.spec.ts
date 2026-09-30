import { expect, test, type Page } from '@playwright/test';

/**
 * The front door, on the production build (accounts on).
 *
 * Nothing of the app is reachable before a sign-in: a first visit is the
 * sign-in screen, never the setup wizard, and a device holding an account's
 * data with no session shows only the sign-in screen for that account. These
 * drive the real build, because the gate sits outside the whole app and only
 * the whole app can show that nothing renders behind it.
 */

test.use({ baseURL: 'http://localhost:4174' });

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Drives English copy; once is enough.');
});

/** Write rows into the app's database, as earlier use of the device would have. */
async function seed(page: Page, rows: { meta?: object[]; profiles?: object[] }): Promise<void> {
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('greenback');
        open.onsuccess = () => {
          const tx = open.result.transaction(['meta', 'profiles'], 'readwrite');
          for (const row of data.meta ?? []) tx.objectStore('meta').put(row);
          for (const row of data.profiles ?? []) tx.objectStore('profiles').put(row);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error(String(tx.error)));
          };
        };
      }),
    rows,
  );
}

async function frontDoor(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
}

test('a first visit is the sign-in screen - no setup wizard, no app', async ({ page }) => {
  await page.goto('/');
  await frontDoor(page);
  await expect(page.getByRole('button', { name: /new here\? create an account/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /language and currency/i })).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);

  // Every route is the same front door.
  await page.goto('/settings');
  await frontDoor(page);
});

test('says data already on the device will join the account', async ({ page }) => {
  await page.goto('/');
  await frontDoor(page);
  await seed(page, { profiles: [{ id: 'p-before-accounts', name: 'Dana' }] });
  await page.reload();
  await expect(page.getByRole('note')).toHaveText(/already has data.*added to your account/i);
});

test("a device holding an account's data shows only that account's sign-in", async ({ page }) => {
  await page.goto('/');
  await frontDoor(page);
  await seed(page, {
    meta: [
      { key: 'syncDataOwner', value: 'someone' },
      { key: 'accountEmail', value: 'dana@example.com' },
    ],
    profiles: [{ id: 'p1', name: 'Dana' }],
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('dana@example.com');
  await expect(page.getByRole('navigation')).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove this data from the device' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove this data from the device' })
    .click();

  // Back to the front door, with nothing left behind.
  await frontDoor(page);
  await expect(page.getByRole('note')).toHaveCount(0);
});

test('the front door switches language', async ({ page }) => {
  await page.goto('/');
  await frontDoor(page);
  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'המשך עם Google' })).toBeVisible();
});

test('a return from Google is taken out of the address, and refused unless this browser started it', async ({
  page,
}) => {
  // What an attacker could send someone: a token for a sign-in they never began.
  await page.goto('/auth/callback#id_token=forged.token.here&state=guessed');
  await frontDoor(page);
  await expect(page).toHaveURL('http://localhost:4174/');
  await expect(page.getByRole('alert')).toHaveText("That didn't work. Try again.");
});

test("closing Google's page brings the front door back without an error", async ({ page }) => {
  await page.goto('/auth/callback#error=access_denied&state=s');
  await frontDoor(page);
  await expect(page).toHaveURL('http://localhost:4174/');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the privacy policy and terms are open to anyone, linked from the front door', async ({ page }) => {
  await page.goto('/');
  await frontDoor(page);
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'מדיניות פרטיות' })).toBeAttached();
  await page.getByRole('link', { name: /Terms of Service/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'תנאי שימוש' })).toBeAttached();
});
