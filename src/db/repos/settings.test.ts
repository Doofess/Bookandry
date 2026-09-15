// @vitest-environment jsdom
// This suite asserts the Dexie write and the pre-paint localStorage mirror stay
// in step, so it needs both IndexedDB and Storage.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BOOT_KEY, readBootMirror } from '@/i18n/boot';
import { freshDb, type TestDb } from '@/test/db-harness';

import { DEFAULT_SETTINGS, ensureSettings, getSettings, SETTINGS_ID, writeSettings } from './settings';

const NOW = '2026-09-15T10:00:00.000Z' as never;

let handle: TestDb;

beforeEach(() => {
  handle = freshDb();
  localStorage.clear();
});

afterEach(async () => {
  await handle.dispose();
});

describe('ensureSettings', () => {
  it('creates the singleton on first run', async () => {
    const s = await ensureSettings(handle.db, NOW);
    expect(s.id).toBe(SETTINGS_ID);
    expect(s.defaultCurrency).toBe(DEFAULT_SETTINGS.defaultCurrency);
    expect(await handle.db.settings.count()).toBe(1);
  });

  it('is idempotent and never clobbers existing settings', async () => {
    await ensureSettings(handle.db, NOW);
    await writeSettings(handle.db, { defaultCurrency: 'ILS', language: 'he' }, NOW);
    const again = await ensureSettings(handle.db, NOW);

    expect(again.defaultCurrency).toBe('ILS');
    expect(again.language).toBe('he');
    expect(await handle.db.settings.count()).toBe(1);
  });
});

describe('writeSettings', () => {
  it('persists a patch without disturbing other fields', async () => {
    await ensureSettings(handle.db, NOW);
    await writeSettings(handle.db, { defaultCurrency: 'ILS' }, NOW);

    const s = await getSettings(handle.db);
    expect(s?.defaultCurrency).toBe('ILS');
    expect(s?.language).toBe('en');
  });

  it('updates the pre-paint mirror SYNCHRONOUSLY with the DB write', async () => {
    // If this were a store subscription it would run after paint, and a reload
    // triggered by import-replace would render one frame in the wrong direction.
    await ensureSettings(handle.db, NOW);
    await writeSettings(handle.db, { language: 'he', theme: 'dark' }, NOW);

    expect(readBootMirror()).toEqual({ lang: 'he', theme: 'dark' });
    expect(localStorage.getItem(BOOT_KEY)).toContain('he');
  });

  it('writes the mirror even when settings did not exist yet', async () => {
    await writeSettings(handle.db, { language: 'he' }, NOW);
    expect(readBootMirror().lang).toBe('he');
  });

  it('keeps the mirror in step across successive writes', async () => {
    await ensureSettings(handle.db, NOW);
    await writeSettings(handle.db, { language: 'he' }, NOW);
    await writeSettings(handle.db, { language: 'en', theme: 'light' }, NOW);
    expect(readBootMirror()).toEqual({ lang: 'en', theme: 'light' });
  });
});
