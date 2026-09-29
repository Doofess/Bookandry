import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The app never runs over plain http.
 *
 * On an insecure page the browser withholds storage, crypto and passkeys, and
 * the app cannot start: a phone that opened http://bookandry.com got an empty
 * screen. The boot script sends such a visit to https before anything else
 * runs. Proven on a real, non-local hostname - localhost is exempt, which is
 * why the rest of this suite runs on http at all - answered with the built
 * index.html, exactly what the site serves.
 */

const HOST = 'bookandry.example';

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'One browser is enough.');
});

test('sends an http visit to https, keeping the path and query', async ({ page }) => {
  const html = readFileSync(join(import.meta.dirname, '..', 'dist', 'index.html'), 'utf8');
  await page.route(`http://${HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  const upgraded = page.waitForRequest((r) => r.url().startsWith(`https://${HOST}`));
  // The https request itself goes nowhere, which is fine: the point is that
  // the page asked for it before running anything else.
  await page.goto(`http://${HOST}/settings?from=phone`).catch(() => undefined);
  expect((await upgraded).url()).toBe(`https://${HOST}/settings?from=phone`);
});

test('sends www to the one hostname the app lives on', async ({ page }) => {
  const html = readFileSync(join(import.meta.dirname, '..', 'dist', 'index.html'), 'utf8');
  await page.route(`https://www.${HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  const forwarded = page.waitForRequest((r) => r.url().startsWith(`https://${HOST}/`));
  await page.goto(`https://www.${HOST}/chart#top`).catch(() => undefined);
  expect((await forwarded).url()).toBe(`https://${HOST}/chart`);
});

test('leaves local development alone', async ({ page }) => {
  await page.goto('/');
  expect(page.url()).toMatch(/^http:\/\/localhost:4173\//);
  await expect(page.locator('#root')).not.toBeEmpty();
});
