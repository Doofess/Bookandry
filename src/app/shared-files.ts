/**
 * Files shared to the app from the phone's Share menu.
 *
 * The service worker (public/share-target-sw.js) receives the share - a POST
 * the page itself never sees - keeps each file in this cache under the
 * share's id, and opens the app on `/?import=shared&id=<id>`. The app reads
 * them from here, and nothing is sent anywhere until the person says "Read".
 *
 * They are the person's data on this device, so they go when that does
 * (`clearDevice`), when they have been read or dismissed, and after a day.
 */

export const SHARED_FILES_CACHE = 'bookandry-shared';
const PREFIX = '/__shared__/';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cache Storage, where there is one: not in every test environment, nor on plain http. */
const sharedCaches = (): CacheStorage | undefined => ('caches' in globalThis ? globalThis.caches : undefined);

function idOf(url: string): string | undefined {
  const path = new URL(url, 'https://x').pathname;
  if (!path.startsWith(PREFIX)) return undefined;
  return path.slice(PREFIX.length).split('/')[0];
}

/** The files of one share, in the order they were shared. */
export async function readShared(id: string): Promise<File[]> {
  const cache = await sharedCaches()?.open(SHARED_FILES_CACHE);
  if (cache === undefined) return [];
  const keys = (await cache.keys()).filter((request) => idOf(request.url) === id);
  keys.sort((a, b) => a.url.localeCompare(b.url, 'en', { numeric: true }));
  const files: File[] = [];
  for (const request of keys) {
    const response = await cache.match(request);
    if (response === undefined) continue;
    const blob = await response.blob();
    const name = decodeURIComponent(response.headers.get('x-file-name') ?? 'shared');
    files.push(new File([blob], name, { type: blob.type }));
  }
  return files;
}

/** Shares waiting to be read, newest first. */
export async function pendingShares(): Promise<string[]> {
  const cache = await sharedCaches()?.open(SHARED_FILES_CACHE);
  if (cache === undefined) return [];
  const ids = new Set<string>();
  for (const request of await cache.keys()) {
    const id = idOf(request.url);
    if (id !== undefined) ids.add(id);
  }
  return [...ids].sort().reverse();
}

/** Forget a share: read, or dismissed. */
export async function forgetShared(id: string): Promise<void> {
  const cache = await sharedCaches()?.open(SHARED_FILES_CACHE);
  if (cache === undefined) return;
  for (const request of await cache.keys()) {
    if (idOf(request.url) === id) await cache.delete(request);
  }
}

/** Every share, unread or not: the device is being cleared. */
export async function clearShared(): Promise<void> {
  await sharedCaches()?.delete(SHARED_FILES_CACHE);
}

/** Shares older than a day are dropped unread: on boot, so nothing lingers. */
export async function sweepShared(nowMs: number): Promise<void> {
  const cache = await sharedCaches()?.open(SHARED_FILES_CACHE);
  if (cache === undefined) return;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    const at = Number(response?.headers.get('x-shared-at') ?? '0');
    if (!Number.isFinite(at) || nowMs - at > DAY_MS) await cache.delete(request);
  }
}
