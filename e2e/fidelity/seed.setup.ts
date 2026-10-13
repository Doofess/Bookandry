import { expect, test as setup, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

import { conceptHousehold, type Envelope } from './concept-household';
import { STATE, TODAY_INSTANT } from './config';
import { completeFirstRun } from '../support/seed';

setup.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });

async function exportEnvelope(page: Page): Promise<Envelope> {
  await page.goto('/settings/data');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא גיבוי' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Envelope;
}

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

setup('restore the concept household', async ({ page }) => {
  setup.setTimeout(180_000);
  await page.clock.setFixedTime(new Date(TODAY_INSTANT));
  await completeFirstRun(page, 'he', { demo: false, theme: 'light' });

  // The empty household first: a person, no money. The board's empty states are checked on it.
  await fs.mkdir(path.dirname(STATE.empty), { recursive: true });
  await page.context().storageState({ path: STATE.empty, indexedDB: true });

  const base = await exportEnvelope(page);
  expect(base.defaultCurrency, 'the wizard in he-IL picks shekels').toBe('ILS');
  const household = conceptHousehold(base);

  await restore(page, household);
  await page.goto('/');
  await expect(page.getByTestId('balance-announced')).toContainText('58,555');
  await page.context().storageState({ path: STATE.household, indexedDB: true });

  // Then the English copy, restored from the screen while it is still in Hebrew (the labels above).
  await restore(page, { ...household, settings: { ...household.settings, language: 'en' } });
  await page.evaluate(() => {
    localStorage.setItem('gb.boot', JSON.stringify({ lang: 'en', theme: 'light' }));
  });
  await page.context().storageState({ path: STATE.householdEn, indexedDB: true });
});

/** Replace everything with `envelope`, from the Hebrew data screen, and wait for every row. */
async function restore(page: Page, envelope: Envelope): Promise<void> {
  await page.goto('/settings/data');
  await page.getByRole('radio', { name: 'החלפה מלאה' }).click();
  await page.getByLabel('בחירת קובץ גיבוי לשחזור').setInputFiles({
    name: 'concept-household.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope), 'utf8'),
  });
  await expect
    .poll(async () => storedTransactions(page), {
      timeout: 60_000,
      message: 'the import never wrote every row',
    })
    .toBe(envelope.data.transactions.length);
}
