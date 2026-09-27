import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { completeFirstRun } from './support/seed';

/**
 * The app, served with the exact Content-Security-Policy the build writes for
 * Cloudflare (dist/_headers), must not trip it anywhere.
 *
 * `vite preview` does not read _headers, so the policy is attached here to
 * every page this origin serves. A policy that is correct on paper but blocks
 * the boot script, a stylesheet or the Argon2id WebAssembly renders a blank
 * app in production and nowhere else - this is where that shows up first.
 */

// The service worker would answer navigations itself, past this interception.
test.use({ serviceWorkers: 'block' });

function builtPolicy(): string {
  const headers = readFileSync('dist/_headers', 'utf8');
  const csp = /Content-Security-Policy: (.+)/.exec(headers)?.[1];
  if (csp === undefined) throw new Error('dist/_headers has no Content-Security-Policy');
  return csp;
}

test('@csp the app runs under its own content security policy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'About the policy, not the locale.');
  const csp = builtPolicy();

  await page.route('http://localhost:4173/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': csp },
    });
  });

  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  await completeFirstRun(page, 'en', { demo: true });
  for (const path of ['/', '/chart', '/profiles', '/settings']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }

  // The account card and its sheet: the only UI that exists only with accounts.
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // The app never tripped the policy...
  expect(violations).toEqual([]);

  /*
   * ...and the policy was really there. page.evaluate() runs outside the
   * page's CSP, so "eval is blocked" cannot be shown with it. A script
   * element added to the DOM is subject to it: it must not run, and the
   * browser must report it.
   */
  const ran = await page.evaluate(async () => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.body.append(script);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return (window as unknown as { __injected?: boolean }).__injected === true;
  });
  expect(ran).toBe(false);
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  expect(violations.join(' ')).toMatch(/script-src/);
});
