import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCK_SYNC, LockBusyError, withLock } from '@/db/lock';
import { ensureSettings } from '@/db/repos/settings';
import { DATA_OWNER_KEY } from '@/db/sync/account';
import { adoptKeyring, loadKeys } from '@/db/sync/keystore';
import { epochKeyOf } from '@/db/sync/tables';
import { instantFromMs } from '@/lib/dates';
import { deriveKeyring, newDataKey } from '@/services/crypto/keys';
import type * as Client from '@/services/supabase/client';
import type * as IdToken from '@/services/supabase/id-token';
import { getKeyState, setupKeys, type Rpc } from '@/services/supabase/transport';
import { freshDb, type TestDb } from '@/test/db-harness';
import { freshPg, type TestPg } from '@/test/pg-harness';

import { LAST_ACTIVE_KEY, LOCK_AFTER_KEY } from './idle-lock';

/*
 * The controller, end to end: a session, the real runner, and the SQL on real
 * Postgres. Only supabase-js is replaced - by a session that is there or not,
 * and an rpc that goes straight to the database.
 */

type ClientModule = typeof Client;

const USER = '00000000-0000-4000-8000-0000000000ee';
const OTHER = '00000000-0000-4000-8000-0000000000ff';

type FakeUser = { id: string; email: string; app_metadata: { provider: string } };
const userFor = (id: string): FakeUser => ({
  id,
  email: id === USER ? 'dana@example.com' : 'noa@example.com',
  app_metadata: { provider: 'google' },
});

const fake = vi.hoisted(() => ({
  rpc: undefined as Rpc | undefined,
  session: undefined as { user: unknown } | null | undefined,
  sessionError: undefined as Error | undefined,
  signOut: vi.fn<(options: unknown) => Promise<{ error: null }>>(),
  /** The session's assurance level, and what the account asks for. */
  aal: { current: 'aal1', next: 'aal1' },
  /** What a right code does: raise the session. Set per test. */
  onCode: (): void => undefined,
  /** Back from Google, as main.tsx's captureArrival would have found. */
  arrival: undefined as IdToken.Arrival | undefined,
  signInWithIdToken: vi.fn<(credentials: unknown) => Promise<{ data: unknown; error: Error | null }>>(),
  /** Supabase Storage's avatars bucket, by path. */
  files: new Map<string, Blob>(),
  /** What updateUser was last asked to merge into the account's metadata. */
  metadata: ((): Record<string, unknown> => ({}))(),
}));

vi.mock('@/services/supabase/id-token', async (importOriginal) => ({
  ...(await importOriginal<typeof IdToken>()),
  takeArrival: () => {
    const taken = fake.arrival;
    fake.arrival = undefined;
    fake.files.clear();
    fake.metadata = {};
    return taken;
  },
}));

vi.mock('@/services/supabase/client', async (importOriginal) => ({
  // What reads the stored session is real: it only reads localStorage.
  storedSessionUser: (await importOriginal<ClientModule>()).storedSessionUser,
  storedSessionNeedsCode: (await importOriginal<ClientModule>()).storedSessionNeedsCode,
  accountsAvailable: () => true,
  shouldLoadAtBoot: () => fake.session !== null,
  getSupabase: () =>
    Promise.resolve({
      storage: {
        from: () => ({
          upload: (path: string, blob: Blob) => {
            fake.files.set(path, blob);
            return Promise.resolve({ data: {}, error: null });
          },
          download: (path: string) => {
            const blob = fake.files.get(path);
            return Promise.resolve(
              blob === undefined
                ? { data: null, error: new Error('not found') }
                : { data: blob, error: null },
            );
          },
          remove: (paths: string[]) => {
            for (const p of paths) fake.files.delete(p);
            return Promise.resolve({ data: [], error: null });
          },
        }),
      },
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: () =>
          Promise.resolve({ data: { session: fake.session ?? null }, error: fake.sessionError ?? null }),
        signOut: fake.signOut,
        signInWithIdToken: fake.signInWithIdToken,
        updateUser: ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(fake.metadata, data);
          return Promise.resolve({ data: {}, error: null });
        },
        mfa: {
          getAuthenticatorAssuranceLevel: () =>
            Promise.resolve({
              data: { currentLevel: fake.aal.current, nextLevel: fake.aal.next },
              error: null,
            }),
          listFactors: () =>
            Promise.resolve({
              data: { totp: [{ id: 'f1', status: 'verified' }], all: [] },
              error: null,
            }),
          challengeAndVerify: ({ code }: { code: string }) => {
            if (code !== '123456') {
              const error = Object.assign(new Error('Invalid TOTP code entered'), {
                code: 'mfa_verification_failed',
              });
              return Promise.resolve({ data: null, error });
            }
            fake.aal.current = 'aal2';
            fake.onCode();
            return Promise.resolve({ data: {}, error: null });
          },
        },
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
let restarted: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  pg = await freshPg();
  fake.rpc = pg.as(USER).rpc;
  fake.session = { user: userFor(USER) };
  fake.sessionError = undefined;
  fake.aal = { current: 'aal1', next: 'aal1' };
  fake.onCode = () => undefined;
  fake.metadata = {};
  fake.arrival = undefined;
  fake.signInWithIdToken.mockReset().mockImplementation(() => {
    fake.session = { user: { ...userFor(USER), app_metadata: { provider: 'google' } } };
    return Promise.resolve({ data: {}, error: null });
  });
  fake.signOut.mockReset().mockImplementation(() => {
    fake.session = null;
    return Promise.resolve({ error: null });
  });
  restarted = vi.fn<() => void>();
  device = freshDb();
  await device.db.open();
  await ensureSettings(device.db, instantFromMs(Date.parse('2026-09-29T10:00:00.000Z')));
});
afterEach(async () => {
  (controller as unknown as { stop(): void } | undefined)?.stop();
  controller = undefined;
  localStorage.clear();
  await device.dispose();
  await pg.close();
});

function make(): InstanceType<typeof AccountController> {
  controller = new AccountController(device.db, restarted);
  return controller;
}

function status(): string | undefined {
  const view = controller?.getView();
  return view?.status === 'signed_in' ? view.keys.kind : view?.status;
}

/** This device already holds USER's data, as after an earlier sign-in. */
async function ownedBy(userId: string): Promise<void> {
  await device.db.meta.put({ key: DATA_OWNER_KEY, value: userId });
  await device.db.meta.put({ key: 'accountEmail', value: 'dana@example.com' });
  await device.db.profiles.put({ id: 'p1' } as never);
}

describe('signing in', () => {
  it('asks nothing: the first device makes the key and the account holds it', async () => {
    await make().connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    const state = await getKeyState(pg.as(USER).rpc);
    expect(state.keyVersion).toBe(1);
    expect(state.wraps.map((w) => w.kind)).toEqual(['account']);
    expect((await device.db.meta.get(DATA_OWNER_KEY))?.value).toBe(USER);
  });

  it('moves an account set up behind a passphrase over by itself', async () => {
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
    await ownedBy(USER);

    await make().connect();
    await vi.waitFor(async () => {
      expect((await loadKeys(device.db))?.current.version).toBe(2);
    });
    const state = await getKeyState(pg.as(USER).rpc);
    expect(state.wraps.map((w) => w.kind)).toEqual(['account']);

    // ...and everything this device holds goes back up under the new key.
    await vi.waitFor(
      async () => {
        const held = await pg.pg.query<{ n: number }>(
          'select count(*)::int as n from public.records where key_version = 2',
        );
        expect(held.rows[0]?.n ?? 0).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
  });

  it('keeps going offline on a session whose access token ran out', async () => {
    await ownedBy(USER);
    localStorage.setItem('bookandry.auth', JSON.stringify({ user: userFor(USER) }));
    fake.session = undefined; // supabase-js: no session...
    const offline = new Error('fetch failed');
    offline.name = 'AuthRetryableFetchError';
    fake.sessionError = offline; // ...because it could not refresh it

    make().start();
    await vi.waitFor(() => {
      expect(controller?.getView().status).toBe('signed_in');
    });
    // Let the key check finish before the database goes away.
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
  });

  it('opens straight away on a stored session for this device, before supabase-js answers', async () => {
    await ownedBy(USER);
    localStorage.setItem('bookandry.auth', JSON.stringify({ user: userFor(USER) }));
    make().start();
    await vi.waitFor(() => {
      expect(controller?.getView().status).toBe('signed_in');
    });
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
  });
});

describe('the profile picture', () => {
  const picture = (): Blob => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
  const kept = async (): Promise<unknown> => (await device.db.meta.get('accountAvatar'))?.value;

  it('is saved to the account, kept on this device, and shown at once', async () => {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    await c.setAvatar(picture());
    expect(fake.files.has(`${USER}/avatar`)).toBe(true);
    const version = fake.metadata.avatar_version;
    expect(typeof version).toBe('number');
    expect(c.getView()).toMatchObject({ user: { avatarVersion: version } });
    expect(await kept()).toMatchObject({ version, type: 'image/webp' });
  });

  it('is removed from the account and from this device', async () => {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    await c.setAvatar(picture());
    await c.removeAvatar();
    expect(fake.files.size).toBe(0);
    expect(fake.metadata.avatar_version).toBeNull();
    expect(c.getView()).toMatchObject({ user: { avatarVersion: undefined } });
    expect(await kept()).toBeUndefined();
  });

  it('arrives on another device by itself, at sign-in', async () => {
    fake.files.set(`${USER}/avatar`, picture());
    fake.session = { user: { ...userFor(USER), user_metadata: { avatar_version: 42 } } };
    await make().connect();
    await vi.waitFor(async () => {
      expect(await kept()).toMatchObject({ version: 42 });
    });
  });

  it("takes a name, and Google's picture from Google's image host", async () => {
    fake.session = {
      user: {
        ...userFor(USER),
        user_metadata: { full_name: 'Dana Levi', avatar_url: 'https://lh3.googleusercontent.com/a/pic' },
      },
    };
    const c = make();
    await c.connect();
    expect(c.getView()).toMatchObject({
      user: { name: 'Dana Levi', picture: 'https://lh3.googleusercontent.com/a/pic' },
    });
  });

  it('takes no picture from anywhere else', async () => {
    fake.session = {
      user: { ...userFor(USER), user_metadata: { avatar_url: 'https://evil.example/x.png' } },
    };
    const c = make();
    await c.connect();
    expect(c.getView()).toMatchObject({ user: { picture: undefined } });
  });
});

describe("the account's emails", () => {
  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('come in the language the person uses here, kept on the account at sign-in', async () => {
    document.documentElement.lang = 'he';
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(fake.metadata).toMatchObject({ language: 'he' });
    });
    expect(c.getView()).toMatchObject({ user: { language: 'he' } });
  });

  it('follow a language switch, and leave a language already kept alone', async () => {
    fake.session = { user: { ...userFor(USER), user_metadata: { language: 'en' } } };
    const c = make();
    await c.connect();
    await c.rememberLanguage('en');
    expect(fake.metadata).toEqual({});

    await c.rememberLanguage('he');
    expect(fake.metadata).toEqual({ language: 'he' });
  });
});

describe('coming back from Google', () => {
  it('finishes the sign-in before anything is shown - never the sign-in screen first', async () => {
    fake.session = null;
    fake.arrival = { ok: true, token: 'id.token', nonce: 'raw-nonce' };
    const c = make();
    const seen: (string | undefined)[] = [];
    c.subscribe(() => seen.push(status()));
    c.start();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    expect(fake.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'id.token',
      nonce: 'raw-nonce',
    });
    expect(seen).not.toContain('signed_out');
    expect(c.getView()).toMatchObject({ user: { provider: 'google' } });
  });

  it('says why when the answer is refused, on the sign-in screen', async () => {
    fake.session = null;
    fake.arrival = { ok: true, token: 'forged', nonce: 'n' };
    fake.signInWithIdToken.mockResolvedValue({ data: null, error: new Error('Bad ID token') });
    const c = make();
    c.start();
    await vi.waitFor(() => {
      expect(status()).toBe('signed_out');
    });
    expect(c.signInFailure()).toBe('unknown');
  });

  it("stays quiet when the person closed Google's page", async () => {
    fake.session = null;
    fake.arrival = { ok: false, reason: 'cancelled' };
    const c = make();
    c.start();
    await vi.waitFor(() => {
      expect(status()).toBe('signed_out');
    });
    expect(c.signInFailure()).toBeUndefined();
    expect(fake.signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('the data is shown only while the account is signed in', () => {
  it('shows the sign-in screen, not the data, when the session has ended', async () => {
    await ownedBy(USER);
    fake.session = null;
    make().start();
    await vi.waitFor(() => {
      expect(controller?.getView()).toEqual({ status: 'locked', email: 'dana@example.com', idle: false });
    });
    expect(await device.db.profiles.count()).toBe(1); // still here, out of sight
  });

  it('is plainly signed out on a device that never held an account', async () => {
    fake.session = null;
    make().start();
    await vi.waitFor(() => {
      expect(controller?.getView()).toEqual({ status: 'signed_out' });
    });
  });

  it('locks a session restored after sitting idle past the limit, before showing anything', async () => {
    await ownedBy(USER);
    localStorage.setItem('bookandry.auth', JSON.stringify({ user: userFor(USER) }));
    localStorage.setItem(LOCK_AFTER_KEY, '5');
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now() - 6 * 60_000));
    const seen: string[] = [];
    const c = make();
    c.subscribe(() => seen.push(c.getView().status));

    c.start();
    await vi.waitFor(() => {
      expect(c.getView()).toMatchObject({ status: 'locked', idle: true });
    });
    expect(seen).not.toContain('signed_in');
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('never locks with "Never" chosen', async () => {
    await ownedBy(USER);
    localStorage.setItem(LOCK_AFTER_KEY, '0');
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now() - 30 * 86_400_000));
    await make().connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
  });

  it('clears the device when a different account signs in on it', async () => {
    await ownedBy(OTHER);
    await make().connect();
    await vi.waitFor(() => {
      expect(restarted).toHaveBeenCalled();
    });
    expect(controller?.getView().status).not.toBe('signed_in');
  });
});

describe('signing out', () => {
  it('takes the data off the device', async () => {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    await c.signOut();
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(restarted).toHaveBeenCalled();
  });

  it('says how many changes have not reached the account', async () => {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    await vi.waitFor(async () => {
      expect(await c.unsavedChanges()).toBe(0);
    });
    // Offline FIRST: the other way round, a background sync can upload the
    // change in the moment between the two lines and leave nothing to count.
    fake.rpc = () => Promise.reject(new Error('offline'));
    await device.db.outbox.put({ tbl: 'profiles', id: 'p-late' });
    expect(await c.unsavedChanges(200)).toBeGreaterThan(0);
  });
});

describe('two-step sign-in', () => {
  /** Codes on for USER, on the server as in the app. */
  async function codesOn(): Promise<void> {
    await pg.as(USER).query('select 1'); // creates the auth user
    await pg.pg.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [USER]);
    fake.aal = { current: 'aal1', next: 'aal2' };
    fake.onCode = () => {
      fake.rpc = pg.as(USER, { aal: 'aal2' }).rpc;
    };
  }

  it('asks for the code after the password, and shows nothing of the account until it is right', async () => {
    await codesOn();
    await ownedBy(USER);
    const c = make();
    await c.connect();
    expect(c.getView()).toMatchObject({ status: 'second_step', owned: true });

    expect(await c.verifyCode('000000')).toEqual({ ok: false, reason: 'wrong_code' });
    expect(c.getView().status).toBe('second_step');

    expect(await c.verifyCode('123456')).toEqual({ ok: true });
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    expect(c.getView()).toMatchObject({ twoStep: true });
  });

  it('asks for it on a device joining, too, without taking over the screen', async () => {
    await codesOn();
    const c = make();
    await c.connect();
    expect(c.getView()).toMatchObject({ status: 'second_step', owned: false });
  });

  it('asks when only the server knows the code is owed', async () => {
    await codesOn();
    fake.aal = { current: 'aal1', next: 'aal1' }; // the app's view is out of date
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(c.getView().status).toBe('second_step');
    });
  });

  it('never opens the app at boot on a stored session that still owes the code', async () => {
    await codesOn();
    await ownedBy(USER);
    const payload = btoa(JSON.stringify({ aal: 'aal1' }));
    localStorage.setItem(
      'bookandry.auth',
      JSON.stringify({
        access_token: `x.${payload}.y`,
        user: { ...userFor(USER), factors: [{ status: 'verified' }] },
      }),
    );
    const seen: string[] = [];
    const c = make();
    c.subscribe(() => seen.push(c.getView().status));
    c.start();
    await vi.waitFor(() => {
      expect(c.getView().status).toBe('second_step');
    });
    expect(seen).not.toContain('signed_in');
  });

  it('backs out to the sign-in screen, keeping the data', async () => {
    await codesOn();
    await ownedBy(USER);
    const c = make();
    await c.connect();
    await c.cancelSecondStep();
    expect(c.getView()).toMatchObject({ status: 'locked' });
    expect(restarted).not.toHaveBeenCalled();
  });
});

describe('deleting all data', () => {
  it('alone: erases here and on the server, and remembers the erase under the account', async () => {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    await device.db.transactions.put({ id: 't1' } as never);

    await c.wipeMyData();

    expect(await device.db.transactions.count()).toBe(0);
    expect(await device.db.categories.count()).toBeGreaterThan(20);
    const epoch = (await device.db.meta.get(epochKeyOf(USER)))?.value;
    expect(typeof epoch).toBe('number');
    expect(c.getView()).not.toHaveProperty('wipeNotice');
  });

  it('holds the sync lock from the server call to the end of the local erase', async () => {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    const inner = fake.rpc!;
    let lockHeldDuringCall: boolean | undefined;
    fake.rpc = async (fn, args) => {
      if (fn === 'wipe_my_data') {
        lockHeldDuringCall = await withLock(LOCK_SYNC, () => Promise.resolve(false), {
          ifAvailable: true,
        }).catch((error: unknown) => error instanceof LockBusyError);
      }
      return inner(fn, args);
    };

    await c.wipeMyData();

    expect(lockHeldDuringCall).toBe(true);
  });

  it('refuses to erase alone a device that holds an account it is not signed in to', async () => {
    await ownedBy(USER);
    fake.session = null;
    const c = make();
    c.start();
    await vi.waitFor(() => {
      expect(c.getView().status).toBe('locked');
    });

    await expect(c.wipeMyData()).rejects.toThrow('not signed in');
    expect(await device.db.profiles.count()).toBe(1);
  });

  it('signed out: clears only the device', async () => {
    fake.session = null;
    const c = make();
    c.start();
    await vi.waitFor(() => {
      expect(c.getView().status).toBe('signed_out');
    });
    await device.db.transactions.put({ id: 't1' } as never);

    await c.wipeMyData();

    expect(await device.db.transactions.count()).toBe(0);
    expect(await device.db.meta.get(epochKeyOf(USER))).toBeUndefined();
  });
});

describe('being told the data was deleted', () => {
  const afterWipe = (c: InstanceType<typeof AccountController>): void => {
    (c as unknown as { afterWipe(): void }).afterWipe();
  };

  async function signedIn(): Promise<InstanceType<typeof AccountController>> {
    const c = make();
    await c.connect();
    await vi.waitFor(() => {
      expect(status()).toBe('ready');
    });
    return c;
  }

  it('names who asked, once the server says it is done', async () => {
    const c = await signedIn();
    const inner = fake.rpc!;
    fake.rpc = (fn, args) =>
      fn === 'wipe_status'
        ? Promise.resolve({
            id: 'w1',
            status: 'done',
            mine: false,
            requesterName: 'Dana',
            createdAt: '2026-10-07T10:00:00.000Z',
            expiresAt: '2026-10-08T10:00:00.000Z',
            waitingFor: [],
          })
        : inner(fn, args);

    afterWipe(c);

    // Told at once, still unnamed: the sync is not held up by the lookup.
    expect(c.getView()).toMatchObject({ wipeNotice: { by: undefined, naming: true } });
    await vi.waitFor(() => {
      expect(c.getView()).toMatchObject({ wipeNotice: { by: 'Dana' } });
    });
    const view = c.getView();
    expect(view.status === 'signed_in' && view.wipeNotice?.naming).toBeUndefined();
  });

  it('reads a blank name as no name', async () => {
    const c = await signedIn();
    const inner = fake.rpc!;
    fake.rpc = (fn, args) =>
      fn === 'wipe_status'
        ? Promise.resolve({
            id: 'w1',
            status: 'done',
            mine: false,
            requesterName: '',
            createdAt: '2026-10-07T10:00:00.000Z',
            expiresAt: '2026-10-08T10:00:00.000Z',
            waitingFor: [],
          })
        : inner(fn, args);

    afterWipe(c);

    await vi.waitFor(() => {
      const view = c.getView();
      expect(view.status === 'signed_in' && view.wipeNotice?.naming).toBeUndefined();
    });
    expect(c.getView()).toMatchObject({ wipeNotice: { by: undefined } });
  });

  it('tells at once, even when the server never answers who asked', async () => {
    const c = await signedIn();
    const inner = fake.rpc!;
    fake.rpc = (fn, args) => (fn === 'wipe_status' ? new Promise<never>(() => undefined) : inner(fn, args));

    afterWipe(c);

    const view = c.getView();
    expect(view.status === 'signed_in' && view.wipeNotice).toMatchObject({ by: undefined, naming: true });
  });

  it('still tells, unnamed, when the server cannot be asked', async () => {
    const c = await signedIn();
    const inner = fake.rpc!;
    fake.rpc = (fn, args) => (fn === 'wipe_status' ? Promise.reject(new Error('offline')) : inner(fn, args));

    afterWipe(c);

    await vi.waitFor(() => {
      const settled = c.getView();
      expect(settled.status === 'signed_in' && settled.wipeNotice?.naming).toBeUndefined();
    });
    const view = c.getView();
    expect(view.status === 'signed_in' && view.wipeNotice).toMatchObject({ by: undefined });
    expect(view.status === 'signed_in' && typeof view.wipeNotice?.at).toBe('number');
  });
});
