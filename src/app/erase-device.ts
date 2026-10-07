import type { BookandryDB } from '@/db/db';
import { eraseLocalData, type EraseOptions } from '@/db/sync/erase';

import { clearShared } from './shared-files';

/**
 * This device emptied of the data: the built-ins back as on a new install, the
 * people kept. For a device with no account to answer to, and for the app's
 * own name for the step.
 *
 * Files shared to the app from the phone's Share menu and not yet read are
 * the data too, so they go with it. They live in Cache Storage, not in the
 * database, so they are cleared just after it: a failure there leaves the
 * erase done, and the files still go within a day (sweepShared).
 */
export async function eraseThisDevice(db: BookandryDB, options?: EraseOptions): Promise<void> {
  await eraseLocalData(db, options);
  await clearShared().catch(() => undefined);
}
