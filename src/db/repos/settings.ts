import type { BookandryDB } from '@/db/db';
import { writeBootMirror } from '@/i18n/boot';
import type { Settings } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

export const SETTINGS_ID = 'singleton';

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  id: SETTINGS_ID,
  defaultCurrency: 'USD',
  language: 'en',
  theme: 'system',
  activeProfileId: 'all',
};

/**
 * Settings live in Dexie, not Zustand.
 *
 * The spec put them in Zustand+localStorage (§2), defined them as a data-model
 * type (§3), and required them to round-trip through the JSON export (§5.5).
 * Those three cannot all hold: localStorage state cannot ride along in a Dexie
 * export, so a "replace" import would restore transactions against the OLD
 * defaultCurrency and silently corrupt every displayed balance.
 */
export async function ensureSettings(db: BookandryDB, now: IsoInstant): Promise<Settings> {
  const existing = await db.settings.get(SETTINGS_ID);
  if (existing) return existing;

  const created: Settings = { ...DEFAULT_SETTINGS, updatedAt: now };
  await db.settings.put(created);
  return created;
}

export async function getSettings(db: BookandryDB): Promise<Settings | undefined> {
  return db.settings.get(SETTINGS_ID);
}

/**
 * The ONE write path for settings.
 *
 * The Dexie write and the pre-paint localStorage mirror happen in the same
 * function, synchronously after the DB write - NOT via a store subscription.
 * A subscription is a React effect, so it lands after paint, which loses the
 * race against an import-replace reload or a clear-all-data and leaves one full
 * frame rendered in the wrong language and theme.
 */
export async function writeSettings(
  db: BookandryDB,
  patch: Partial<Omit<Settings, 'id' | 'updatedAt'>>,
  now: IsoInstant,
): Promise<Settings> {
  const next = await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get(SETTINGS_ID)) ?? { ...DEFAULT_SETTINGS, updatedAt: now };
    const updated: Settings = { ...current, ...patch, id: SETTINGS_ID, updatedAt: now };
    await db.settings.put(updated);
    return updated;
  });

  writeBootMirror({ lang: next.language, theme: next.theme });
  return next;
}
