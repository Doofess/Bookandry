import type { BookandryDB } from '@/db/db';
import { eraseLocalData } from '@/db/sync/erase';

/**
 * This device emptied of the data: the built-ins back as on a new install, the
 * people kept. For a device with no account to answer to, and for the app's
 * own name for the step.
 */
export async function eraseThisDevice(db: BookandryDB): Promise<void> {
  await eraseLocalData(db);
}
