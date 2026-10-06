import { deriveKeyring } from '@/services/crypto/keys';
import { keyFromAccountEntry } from '@/services/crypto/wrap';
import type { KeyState } from '@/services/supabase/transport';

import type { BookandryDB } from '../db';
import { loadSpaceKeys, saveSpaceKeys } from './keystore';
import { forgetSpace, knownSpaces, rememberSpaces } from './spaces';

/**
 * Keeping this device in step with the household it belongs to: a key for
 * every linked account's space, and nothing left of anyone who is no longer
 * linked.
 *
 * The server is passed in, so the tests drive this against the real SQL.
 */
export type LinkedKeyServer = {
  /** A linked account's key state: its version and its own key entry. */
  getKeyState(space: string): Promise<KeyState>;
};

/**
 * `members`: every account in the household, this one included - or
 * undefined when the server could not be asked (offline), and the device
 * carries on with the linked spaces it already holds keys for.
 *
 * `refresh`: fetch each linked account's key even when one is held - after a
 * space turned out sealed under a newer key than this device has.
 *
 * Returns the linked spaces this device can keep in step with now.
 */
export async function connectLinked(
  db: BookandryDB,
  server: LinkedKeyServer,
  me: string,
  members: readonly string[] | undefined,
  refresh = false,
): Promise<readonly string[]> {
  if (members === undefined) {
    const ready: string[] = [];
    for (const space of await knownSpaces(db)) {
      if ((await loadSpaceKeys(db, space)) !== undefined) ready.push(space);
    }
    return ready;
  }

  const linked = members.filter((m) => m !== me);
  // Unlinked, from either side: their rows leave this device; they keep them.
  for (const gone of await knownSpaces(db)) {
    if (!linked.includes(gone)) await forgetSpace(db, gone);
  }
  await rememberSpaces(db, linked);

  const ready: string[] = [];
  for (const space of linked) {
    const held = await loadSpaceKeys(db, space);
    if (held === undefined || refresh) {
      try {
        await fetchKey(db, server, space, held === undefined ? 0 : held.current.version);
      } catch {
        // Their space is not ready (never synced), or the network failed:
        // the next cycle asks again.
      }
    }
    if ((await loadSpaceKeys(db, space)) !== undefined) ready.push(space);
  }
  return ready;
}

async function fetchKey(
  db: BookandryDB,
  server: LinkedKeyServer,
  space: string,
  floor: number,
): Promise<void> {
  const state = await server.getKeyState(space);
  // Keys only move forward, as for the account's own (see connectDevice).
  if (state.keyVersion === 0 || state.keyVersion < floor) return;
  const held = await loadSpaceKeys(db, space);
  if (held?.byVersion.has(state.keyVersion) === true) return;
  const entry = state.wraps.find((w) => w.kind === 'account' && w.keyVersion === state.keyVersion);
  if (entry === undefined) return;
  const raw = keyFromAccountEntry(entry);
  try {
    await saveSpaceKeys(db, space, await deriveKeyring(raw, state.keyVersion));
  } finally {
    raw.fill(0);
  }
}
