import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { frameBox, openConcept, readTokens } from './concept';
import { KINDS, THEMES, THRESHOLDS, type Theme } from './config';
import { countKinds } from './probe';
import { scoreInBrowser, toBins, type ScoreOutput } from './score';

const conceptKinds = Object.fromEntries(Object.entries(KINDS).map(([kind, s]) => [kind, s.concept]));

/** A plausible faithful build: other copy, one rail place fewer, the board 6px lower. */
async function near(page: Page) {
  await page.evaluate(() => {
    const desk = document.querySelector<HTMLElement>('.desk');
    desk?.querySelectorAll('.nav-item')[1]?.remove();
    const title = desk?.querySelector('.topbar h1');
    if (title) title.textContent = 'ערב טוב, דניאל';
    const board = desk?.querySelector<HTMLElement>('.board');
    if (board) board.style.translate = '0 6px';
  });
}

/** A build that drifted: 24px gaps, a 200px balance, an account sheet missing, month 5 + categories 7. */
async function loose(page: Page) {
  await page.evaluate(() => {
    const desk = document.querySelector<HTMLElement>('.desk');
    const board = desk?.querySelector<HTMLElement>('.board');
    if (board) board.style.gap = '24px';
    const mega = desk?.querySelector<HTMLElement>('.bal .mega');
    if (mega) mega.style.fontSize = '200px';
    desk?.querySelectorAll('.acct')[3]?.remove();
    const month = desk?.querySelector<HTMLElement>('.month');
    if (month) month.style.gridColumn = 'span 5';
    const cats = desk?.querySelector<HTMLElement>('.cats');
    if (cats) cats.style.gridColumn = 'span 7';
  });
}

async function fold(browser: Browser, theme: Theme, change?: (page: Page) => Promise<void>) {
  const concept = await openConcept(browser, theme);
  await change?.(concept.page);
  const frame = await frameBox(concept.page, { kind: 'desk' });
  const png = await concept.page.screenshot({ fullPage: true, clip: frame.clip });
  const bins = toBins(await readTokens(concept.page));
  await concept.context.close();
  return { url: `data:image/png;base64,${png.toString('base64')}`, bins };
}

async function score(
  browser: Browser,
  a: string,
  b: string,
  bins: ReturnType<typeof toBins>,
): Promise<ScoreOutput> {
  const page = await browser.newPage();
  const result = await page.evaluate(scoreInBrowser, {
    a,
    b,
    w: 180,
    h: 112,
    tokens: bins,
    deltaE: THRESHOLDS.deltaE,
    minShare: THRESHOLDS.colourShare,
  });
  await page.close();
  return result;
}

test.describe('@fid-selftest the harness measures what the plan says', () => {
  test('the concept is the approved file, and counts as the plan inventories it', async ({ browser }) => {
    const concept = await openConcept(browser, 'light');
    const frame = await frameBox(concept.page, { kind: 'desk' });
    const counts = await concept.page.evaluate(countKinds, {
      kinds: conceptKinds,
      scope: frame.scope,
      scopeIndex: 0,
      origin: frame.origin,
      height: frame.height,
    });
    await concept.context.close();
    expect(counts).toEqual({
      sheet: 15,
      numeral: 8,
      mark: 8,
      hueBar: 10,
      huePill: 8,
      chip: 14,
      pill: 5,
      round: 3,
      dayHeading: 3,
      accountSheet: 5,
      cardSheet: 5,
      navItem: 9,
    });
  });

  for (const theme of THEMES) {
    test(`${theme}: itself scores 1, a near-faithful build passes, a loose one fails`, async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const truth = await fold(browser, theme);
      const self = await score(browser, truth.url, truth.url, truth.bins);
      expect(self.structure).toBeCloseTo(1, 3);
      expect(self.palette).toBeCloseTo(1, 3);

      const good = await score(browser, truth.url, (await fold(browser, theme, near)).url, truth.bins);
      expect(good.structure).toBeGreaterThanOrEqual(THRESHOLDS.structure);
      expect(good.palette).toBeGreaterThanOrEqual(THRESHOLDS.palette);

      const bad = await score(browser, truth.url, (await fold(browser, theme, loose)).url, truth.bins);
      expect(bad.structure).toBeLessThan(THRESHOLDS.structure);
    });
  }

  test('the shipped feed of 50b4e5b fails, as the audit found', async ({ browser }) => {
    const shipped = path.join(
      os.homedir(),
      '.bookandry-private',
      'design-audit',
      'app',
      'feed-fold-he-desktop-light.png',
    );
    test.skip(!fs.existsSync(shipped), 'the audit image is not on this machine');
    const truth = await fold(browser, 'light');
    const result = await score(
      browser,
      truth.url,
      `data:image/png;base64,${fs.readFileSync(shipped).toString('base64')}`,
      truth.bins,
    );
    expect(result.structure).toBeLessThan(THRESHOLDS.structure);
    expect(result.palette).toBeLessThan(THRESHOLDS.palette);
  });
});
