import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun } from './support/seed';

/**
 * The virtualised feed, at a size it will actually meet.
 *
 * Everything else that touches the feed runs on demo data - about sixty rows -
 * and `src/domain/scale.test.ts` covers the pure layers at five thousand. Both
 * leave the same hole: the VIRTUALIZER itself has only ever been asked to draw
 * a screenful of a short list. Delete it and every test in this repository
 * still passes, because rendering four thousand rows is correct. It is only
 * unusable.
 *
 * So this seeds four thousand transactions into one month and asserts the thing
 * that separates a virtual list from a slow one: almost none of it is in the
 * DOM, and it stays that way after scrolling.
 *
 * Seeded through the app's own EXPORT and IMPORT, not through a test-only hook.
 * A fixture that wrote to IndexedDB directly would have to reproduce
 * `materialize()` - seriesStart, seriesEnd, the derived isDeleted - and would
 * drift from it silently. Exporting first means the app itself supplies every
 * shape, and the round trip is exercised at four thousand rows as a bonus.
 */

/*
 * Playwright REQUIRES the first parameter to be a destructuring pattern, even
 * when no fixture is used.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and CPU budget are set explicitly.');
});

/**
 * Four thousand in ONE month - denser than any real ledger.
 *
 * The plan sizes layer C at "<= 2k items" for a typical month, so this is twice
 * the number the design admits to, in the single window the user is looking at.
 */
const ROWS = 4_000;

/** What a healthy window looks like: a screenful plus overscan, not a list. */
const MAX_RENDERED = 80;

type Envelope = {
  counts: Record<string, number>;
  data: {
    transactions: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** Pull a real, valid document out of the running app. */
async function exportEnvelope(page: Page): Promise<Envelope> {
  await page.goto('/settings/data');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export a backup' }).click();
  const stream = await (await download).createReadStream();

  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Envelope;
}

/**
 * Clone one real transaction into `ROWS` one-time rows inside `month`.
 *
 * One-time rather than recurring on purpose: a recurring series would put one
 * occurrence per month in the window and the feed would stay short. The point
 * here is a dense month, which is what the virtualizer is for.
 */
function inflate(envelope: Envelope, month: string, lastDay: number): Envelope {
  const template = envelope.data.transactions[0] as Record<string, unknown>;
  expect(template, 'the demo data should have given us a transaction to clone').toBeDefined();

  const transactions = Array.from({ length: ROWS }, (_, i) => {
    const day = String((i % lastDay) + 1).padStart(2, '0');
    const date = `${month}-${day}`;
    const id = `perf-${String(i).padStart(5, '0')}`;

    return {
      ...template,
      id,
      seriesRootId: id,
      recurrence: { type: 'one_time' },
      date,
      // A one-time row's interval is the day itself. Getting this wrong means
      // the interval query never returns the row and the feed looks empty.
      seriesStart: date,
      seriesEnd: date,
      note: `perf row ${String(i)}`,
      // Overrides belong to ids that no longer exist, so they go too.
      deletedAt: undefined,
      isDeleted: 0,
    };
  });

  return {
    ...envelope,
    // Counts are VALIDATED against the arrays, so they cannot be left stale.
    counts: { ...envelope.counts, transactions: transactions.length, overrides: 0 },
    data: { ...envelope.data, transactions, overrides: [] },
  };
}

/**
 * How many transactions the app has actually stored.
 *
 * Read straight out of IndexedDB rather than inferred from a toast. The toast
 * was the obvious signal and the wrong one twice: its count goes through i18n,
 * so at four figures it reads "4,000" and a literal match waits for a string
 * the app never writes; and it fades after a few seconds, so a slow import and
 * a finished one look identical. This is the state being changed, so this is
 * what to wait on - and it is a black-box read, not a test hook in the app.
 */
async function storedTransactions(page: Page): Promise<number> {
  return page.evaluate(
    async () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('greenback');
        open.onsuccess = () => {
          const request = open.result
            .transaction('transactions', 'readonly')
            .objectStore('transactions')
            .count();
          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            resolve(-1);
          };
        };
        open.onerror = () => {
          resolve(-1);
        };
      }),
  );
}

async function importEnvelope(page: Page, envelope: Envelope): Promise<void> {
  await page.goto('/settings/data');
  await page.getByRole('radio', { name: 'Replace everything' }).click();

  await page.getByLabel('Choose a backup file to restore').setInputFiles({
    name: 'perf.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope), 'utf8'),
  });

  /*
   * Stay on this page until every row has landed.
   *
   * The import runs in the page, so navigating while it is working destroys it
   * half-written - which surfaced later as an empty feed and read as a
   * virtualizer bug. Waiting on the exact count means a partial write fails
   * here, naming the number it got to.
   */
  await expect
    .poll(async () => storedTransactions(page), {
      timeout: 120_000,
      message: 'the import never wrote every row',
    })
    .toBe(ROWS);
}

/** Rows currently in the DOM - the number the whole design is about. */
async function renderedRows(page: Page): Promise<number> {
  return page.locator('[role="listitem"]').count();
}

test.describe('@scale a dense month', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 390, height: 844 } });

  test('draws a screenful of four thousand rows, and keeps drawing a screenful', async ({ page }) => {
    test.setTimeout(180_000);

    await completeFirstRun(page, 'en');

    const today = await page.evaluate(() => {
      const now = new Date();
      const month = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return { month, day: now.getDate() };
    });

    const envelope = await exportEnvelope(page);
    // Dated up to today only: a future date is a PROJECTION, which the feed
    // groups separately, and this is measuring one dense list.
    await importEnvelope(page, inflate(envelope, today.month, today.day));

    /*
     * CPU throttled 4x, which is roughly a mid-range phone.
     *
     * At full desktop speed a non-virtualised list of four thousand rows is
     * merely slow rather than broken, and the difference the design exists for
     * would not show up in a pass/fail.
     */
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const started = Date.now();
    await page.goto(`/?m=${today.month}-01`);
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 60_000 });
    // The board's sheet shows the newest eight rows; its round arrow opens the whole month, the list this measures.
    await page.getByRole('button', { name: 'All transactions' }).click();
    const firstPaint = Date.now() - started;

    /*
     * The assertion the whole file exists for.
     *
     * Not "it is fast" - a slow list and a virtual one differ in what they PUT
     * IN THE DOM, and four thousand list items is the failure whether or not
     * the machine running the test happens to cope with it.
     */
    const atTop = await renderedRows(page);
    expect(atTop, `${String(atTop)} rows in the DOM; the window should be tiny`).toBeLessThan(MAX_RENDERED);
    expect(atTop).toBeGreaterThan(0);

    // The list is nonetheless SIZED for all of them, which is what makes the
    // scrollbar honest and the position meaningful.
    const totalHeight = await page
      .locator('[data-slot="transactions-sheet"] [role="list"]')
      .evaluate((el) => el.clientHeight);
    expect(totalHeight).toBeGreaterThan(ROWS * 20);

    /*
     * And it still holds after scrolling.
     *
     * A list that appends without removing passes the check above and fails
     * this one: the node count climbs with distance travelled, which is the
     * shape of a leak rather than a window.
     */
    for (const fraction of [0.25, 0.5, 0.9, 1]) {
      const scrolled = Date.now();
      await page.evaluate((f) => {
        window.scrollTo(0, document.body.scrollHeight * f);
      }, fraction);
      await page.waitForFunction(() => document.querySelectorAll('[role="listitem"]').length > 0);

      const rendered = await renderedRows(page);
      const where = fraction === 1 ? 'the very end' : `${String(fraction * 100)}% scrolled`;

      // Reached AND recycled. A window that cannot render its own last row is a
      // different bug with the same symptoms, so both bounds matter.
      expect(rendered, `${String(rendered)} rows in the DOM at ${where}`).toBeGreaterThan(0);
      expect(rendered, `${String(rendered)} rows in the DOM at ${where}`).toBeLessThan(MAX_RENDERED);

      /*
       * The budget goes HERE, on scrolling, and not on first paint.
       *
       * First paint at this density is dominated by layers A and B - the
       * interval query and the expansion of four thousand rows - which
       * `src/domain/scale.test.ts` already covers and which a 4x-throttled
       * browser makes look far worse than any real month ever would: four
       * thousand transactions in one month is a hundred and thirty a day.
       * Scrolling touches NEITHER layer. It is the virtualizer alone, it is the
       * thing this file is about, and it has to stay cheap however much data is
       * behind it.
       */
      const redraw = Date.now() - scrolled;
      expect(redraw, `${String(redraw)}ms to redraw at ${where}, 4x throttled`).toBeLessThan(5_000);
    }

    // Reported, not asserted: it measures the query, not the list, and pinning
    // it would make this file fail for a reason it does not test.
    console.log(`[scale] first rows at 4x throttle: ${String(firstPaint)}ms for ${String(ROWS)} rows`);
  });
});
