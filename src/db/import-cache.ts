import type { BookandryDB } from './db';

/**
 * "Smart import" used to keep what it read from each file, by its SHA-256, so
 * a file picked again was not read again - and so kept every mistake of that
 * reading past the fixes made since. Files are always read afresh now; what
 * older versions kept is cleared from the device.
 */
const PREFIX = 'importCache:';

export async function forgetImportReads(db: BookandryDB): Promise<void> {
  await db.meta.where('key').startsWith(PREFIX).delete();
}
