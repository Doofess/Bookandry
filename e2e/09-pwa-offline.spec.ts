import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import { completeFirstRun } from './support/seed';

/**
 * The PWA's actual promise: it still works with nothing serving it.
 *
 * `00-shell.spec.ts` asserts the manifest, the icons and an active service
 * worker - the things that decide whether Chrome OFFERS to install. This file
 * asserts the thing that decides whether installing was worth it, and it does so
 * by KILLING THE SERVER rather than by ticking DevTools' Offline box. The
 * checkbox only lies to the page about the network; a dead port cannot be
 * fooled and cannot half-work.
 *
 * It runs on its own origin for that reason - the shared preview server on 4173
 * is every other spec's lifeline, and this one has to be able to end it. Each
 * test installs the worker and kills the server itself, because a Playwright
 * test gets a fresh context: registrations and caches do not survive from one
 * test to the next, so a second test could only ever find an uninstalled app.
 *
 * Not asserted here, deliberately: `beforeinstallprompt`, the event behind the
 * omnibox install icon. Headless Chromium never fires it, so the assertion would
 * only ever skip - and a spec that skips is worse than an absent one, because it
 * reads as coverage. The install click itself is browser chrome, and stays in
 * the README's manual pass.
 */

/*
 * Playwright REQUIRES the first parameter to be a destructuring pattern, even
 * when no fixture is used.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Origin and lifecycle are owned by this spec.');
});

/**
 * Not 4173: this spec kills its server, and 4173 is the whole suite's lifeline.
 *
 * And not 4190, which looks just as free and is not usable: it is ManageSieve on
 * the Fetch spec's blocked-port list, so every request to it fails with "bad
 * port" however healthy the server is - a failure that names the port and never
 * mentions the rule.
 */
const PORT = 4174;
const ORIGIN = 'http://127.0.0.1:' + String(PORT);
const ROOT = path.resolve(import.meta.dirname, '..');

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Kept for the failure message: a bare "never answered" names no cause. */
let lastReachError = '';

async function reachable(timeoutMs = 2_000): Promise<boolean> {
  try {
    const response = await fetch(`${ORIGIN}/`, { signal: AbortSignal.timeout(timeoutMs) });
    lastReachError = `status ${String(response.status)}`;
    return response.ok;
  } catch (error) {
    const cause = error instanceof Error ? (error.cause as Error | undefined) : undefined;
    lastReachError =
      error instanceof Error
        ? `${error.name}: ${error.message} <- ${cause?.message ?? '(no cause)'}`
        : String(error);
    return false;
  }
}

/**
 * Serves the SAME `dist-local/` the suite's own preview server on 4173 does.
 *
 * The global `webServer` already ran `pnpm build`, so this costs a process, not
 * a build - and spawning vite's JS entry directly avoids the `.cmd` shim, which
 * needs a shell on Windows and then does not forward a kill to the real process.
 */
function startPreview(log: (text: string) => void): ChildProcess {
  const child = spawn(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/vite/bin/vite.js'),
      'preview',
      '--outDir',
      'dist-local',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    // Absolute paths and an explicit cwd: a worker's working directory is not
    // promised to be the project root, and a spawn that fails on a relative path
    // fails SILENTLY - the port simply never opens.
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  // Everything the child says, because a server that fails to start otherwise
  // presents as a bare timeout with no reason attached.
  child.stdout.on('data', (chunk: Buffer) => {
    log(`[out] ${chunk.toString().trim()} `);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    log(`[err] ${chunk.toString().trim()} `);
  });
  child.on('error', (error: Error) => {
    log(`[spawn failed] ${error.message} `);
  });
  return child;
}

/**
 * Load the app, wait for the worker to finish activating, and reload.
 *
 * The reload is not a formality. `clientsClaim` is deliberately false, so the
 * tab that INSTALLED the worker is never controlled by it - only the next
 * navigation is. Taking the network away before this point would test the error
 * page and pass for entirely the wrong reason.
 */
async function installServiceWorker(page: Page): Promise<void> {
  await page.goto(`${ORIGIN}/`);

  /*
   * ACTIVATED, not merely registered: `navigator.serviceWorker.ready` resolves
   * as soon as there is an active worker, and one still activating has not
   * finished writing the precache it is about to be asked for.
   */
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state === 'activated';
    },
    undefined,
    { timeout: 30_000 },
  );

  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test.describe('@pwa offline', () => {
  // One port, one lifecycle: these cannot overlap.
  test.describe.configure({ mode: 'serial' });

  let server: ChildProcess | undefined;
  let childOutput = '';

  test.beforeEach(async () => {
    // Build plus a second server start is not a 30-second operation cold.
    test.setTimeout(120_000);
    expect(await reachable(), `port ${String(PORT)} is already in use`).toBe(false);

    childOutput = '';
    server = startPreview((text) => {
      childOutput += text;
    });

    for (let i = 0; i < 60 && !(await reachable()); i += 1) await sleep(500);
    expect(
      await reachable(),
      `the spec-owned preview server never answered. fetch: ${lastReachError} :: child: ${childOutput}`,
    ).toBe(true);
  });

  test.afterEach(async () => {
    // Also the failure path: a spec that leaves the port bound poisons the next
    // run, and the next run's failure would point at the wrong thing entirely.
    server?.kill();
    for (let i = 0; i < 20 && (await reachable()); i += 1) await sleep(250);
  });

  /** Kill the server and refuse to continue until it is genuinely refusing. */
  async function goOffline(): Promise<void> {
    server?.kill();
    for (let i = 0; i < 20 && (await reachable()); i += 1) await sleep(250);
    expect(await reachable(), 'the server must be genuinely down, not merely slow').toBe(false);
  }

  test('serves the app with nothing running, from the precache', async ({ page }) => {
    await installServiceWorker(page);

    const precache = await page.evaluate(async () => {
      const names = await caches.keys();
      let entries = 0;
      for (const name of names) entries += (await (await caches.open(name)).keys()).length;
      return { names, entries };
    });

    expect(precache.names.some((name) => name.includes('workbox-precache'))).toBe(true);
    // The whole shell, not one stray opportunistic response.
    expect(precache.entries).toBeGreaterThan(10);

    await goOffline();

    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    // Rendered, not merely served: the first-run wizard's own control.
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
  });

  test('serves a DEEP route offline, which is what navigateFallback is for', async ({ page }) => {
    /*
     * The half an offline test on `/` cannot reach.
     *
     * The precache holds `index.html` under its own URL; a reload of `/chart`
     * asks for a document that was never built, so without `navigateFallback`
     * that request goes to the network and an installed app shows the dinosaur
     * on every route but the home one. Nothing about the first test notices.
     */
    await installServiceWorker(page);
    await goOffline();

    await page.goto(`${ORIGIN}/chart`);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('still has its data offline, which is the whole point of local-first', async ({ page }) => {
    /*
     * A shell without its data is a brochure.
     *
     * Everything lives in IndexedDB, so nothing here needs the network - but
     * "nothing needs it" is exactly the kind of claim the sweeper made while
     * going three phases without a caller. This seeds through the real wizard,
     * takes the server away, and asks for the same figure back.
     */
    await installServiceWorker(page);
    await completeFirstRun(page, 'en', { origin: ORIGIN });

    const before = await page.locator('[data-value]').first().getAttribute('data-value');
    expect(before).not.toBeNull();

    await goOffline();
    await page.reload();

    await expect(page.getByRole('main')).toBeVisible();
    // The integer, never the formatted string - and the SAME integer.
    await expect(page.locator('[data-value]').first()).toHaveAttribute('data-value', before ?? '');
  });
});
