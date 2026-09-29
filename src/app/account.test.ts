import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureSettings } from '@/db/repos/settings';
import { adoptKeyring, loadKeys } from '@/db/sync/keystore';
import { instantFromMs } from '@/lib/dates';
import { deriveKeyring, newDataKey } from '@/services/crypto/keys';
import { getKeyState, setupKeys, type Rpc } from '@/services/supabase/transport';
import { freshDb, type TestDb } from '@/test/db-harness';
import { freshPg, type TestPg } from '@/test/pg-harness';

/*
 * The controller, end to end: a signed-in session, the real sync runner, and
 * the migration running on real Postgres. Only supabase-js is replaced - by a
 * session that is simply there, and an rpc that goes straight to the SQL.
 */

const USER = '00000000-0000-4000-8000-0000000000ee';

const fake = vi.hoisted(() => ({ rpc: undefined as Rpc | undefined }));

vi.mock('@/services/supabase/client', () => ({
  accountsAvailable: () => true,
  shouldLoadAtBoot: () => false,
  getSupabase: () =>
    Promise.resolve({
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: () =>
          Promise.resolve({
            data: {
              session: {
                user: { id: USER, email: 'dana@example.com', app_metadata: { provider: 'google' } },
              },
            },
          }),
      },
    }),
  rpcFor: () => (fn: string, args: Record<string, unknown>) => {
    if (fake.rpc === undefined) throw new Error('no database');
    return fake.rpc(fn, args);
  },
}));

const { AccountController } = await import('./account');

let pg: TestPg;
let device: TestDb;
let controller: InstanceType<typeof AccountController> | undefined;

beforeEach(async () => {
  pg = await freshPg();
  fake.rpc = pg.as(USER).rpc;
  device = freshDb();
  await device.db.open();
  await ensureSettings(device.db, instantFromMs(Date.parse('2026-09-29T10:00:00.000Z')));
});
afterEach(async () => {
  // Signed out without touching the network: stops the runner.
  (controller as unknown as { stopRunner(): void } | undefined)?.stopRunner();
  controller = undefined;
  await device.dispose();
  await pg.close();
});

function keysKind(): string | undefined {
  const view = controller?.getView();
  return view?.status === 'signed_in' ? view.keys.kind : view?.status;
}

describe('the account controller', () => {
  it('signs in and syncs with nothing asked: the first device makes the key', async () => {
    controller = new AccountController(device.db);
    await controller.connect();
    await vi.waitFor(() => {
      expect(keysKind()).toBe('ready');
    });
    const state = await getKeyState(pg.as(USER).rpc);
    expect(state.keyVersion).toBe(1);
    expect(state.wraps.map((w) => w.kind)).toEqual(['account']);
  });

  it('moves an account set up behind a passphrase over, once this device has synced it down', async () => {
    // The account as the first release left it: only secret-held ways in,
    // and this device holding version 1 of the key.
    await setupKeys(pg.as(USER).rpc, [
      {
        kind: 'recovery',
        id: 'recovery',
        keyVersion: 1,
        salt: 'A'.repeat(22),
        iv: 'A'.repeat(16),
        ct: 'A'.repeat(64),
      },
    ]);
    await adoptKeyring(device.db, USER, await deriveKeyring(newDataKey(), 1));
    await device.db.profiles.put({ id: 'p1' } as never);

    controller = new AccountController(device.db);
    await controller.connect();

    await vi.waitFor(
      async () => {
        const state = await getKeyState(pg.as(USER).rpc);
        expect(state.keyVersion).toBe(2);
        expect(state.wraps.map((w) => w.kind)).toEqual(['account']);
      },
      { timeout: 10_000 },
    );
    // The server moves first; this device adopts the new key a moment later.
    await vi.waitFor(async () => {
      expect((await loadKeys(device.db))?.current.version).toBe(2);
    });

    // ...and everything this device holds is back on the server, under the new key.
    await vi.waitFor(
      async () => {
        const held = await pg.pg.query<{ n: number }>(
          'select count(*)::int as n from public.records where key_version = 2',
        );
        expect(held.rows[0]?.n ?? 0).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
    expect(keysKind()).toBe('ready');
  });
});
