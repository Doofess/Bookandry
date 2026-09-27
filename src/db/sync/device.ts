import type { Table } from 'dexie';

import { isDeviceId } from '@/lib/rev';

/** The `meta` key holding this install's device id. */
export const DEVICE_ID_KEY = 'deviceId';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Eight base-36 characters: 41 bits, plenty to tell one household's devices
 * apart. It only breaks exact rev ties, so it identifies nothing and needs no
 * secrecy. `getRandomValues` rather than `randomUUID`, which exists only in
 * secure contexts and would fail on the phone dev loop over plain http.
 */
export function newDeviceId(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

type MetaTable = Table<{ key: string; value: unknown }, string>;

/**
 * This install's device id, created on first use.
 *
 * Read-then-write inside one read-write transaction on `meta`, so two tabs
 * opening a brand-new database at once serialise here and agree on one id -
 * rather than each keeping its own in memory while only the last one is saved.
 */
export async function readOrCreateDeviceId(meta: MetaTable): Promise<string> {
  const existing = await meta.get(DEVICE_ID_KEY);
  if (typeof existing?.value === 'string' && isDeviceId(existing.value)) return existing.value;
  const id = newDeviceId();
  await meta.put({ key: DEVICE_ID_KEY, value: id });
  return id;
}
