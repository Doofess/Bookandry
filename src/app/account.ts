import { useSyncExternalStore } from 'react';

import type { BookandryDB } from '@/db/db';
import { connectDevice, dataOwner, type KeyServer } from '@/db/sync/account';
import { encryptingTransport, KeyUnavailableError } from '@/db/sync/codec';
import { loadKeys } from '@/db/sync/keystore';
import { systemClock } from '@/lib/clock';
import type { AuthFailure, AuthResult, Enrollment, Passkey, SecondStep } from '@/services/supabase/auth';
import {
  accountsAvailable,
  getSupabase,
  rpcFor,
  shouldLoadAtBoot,
  storedSessionNeedsCode,
  storedSessionUser,
  type Session,
} from '@/services/supabase/client';
import { takeArrival, type Arrival } from '@/services/supabase/id-token';
import {
  deleteMyAccount,
  getKeyState,
  rotateKeys,
  rpcTransport,
  ServerError,
  setupKeys,
  type Rpc,
} from '@/services/supabase/transport';

import { forgetAvatar, readAvatarVersion, storeAvatar } from './avatar-store';
import { idleExpired, touch, watchIdle, type IdleWatch } from './idle-lock';
import { startSyncRunner, type SyncRunner, type SyncState } from './sync-runner';

/**
 * The account, as the screens see it: one store, one source of truth.
 *
 * The model is a bank's, not a sync product's. A device either has nothing to
 * do with an account (the app as it always was, local-only), or it holds an
 * account's data - and then that data is shown only while the account is
 * signed in. Signing out takes the data off the device; a session that ends
 * any other way (signed out from another device, or locked after inactivity)
 * leaves it behind the sign-in screen. Keeping the device and the account in
 * step is the app's business, never a thing the person manages.
 *
 * Signed out is the normal state of this app, not an error one. Nothing here
 * runs, and supabase-js is not even downloaded, until someone signs in or
 * comes back already signed in.
 */
export type AccountUser = {
  readonly id: string;
  readonly email: string | undefined;
  /** 'email' or 'google'. Deleting an account re-checks a password only for 'email'. */
  readonly provider: string;
  /** The person's name, where the sign-in gave one (Google does). */
  readonly name: string | undefined;
  /** Google's picture for the account, for an account without one of its own. */
  readonly picture: string | undefined;
  /** The account's own picture: its current version, or undefined for none. */
  readonly avatarVersion: number | undefined;
};

/** Where this device stands with the account's key. */
export type KeysView =
  | { readonly kind: 'checking' }
  /** Holds the account's current key; keeping in step. */
  | { readonly kind: 'ready' }
  /** The server offered an older key than this device holds. Everything pauses. */
  | { readonly kind: 'rolled_back' }
  /** Could not reach the server to find out. */
  | { readonly kind: 'unknown' };

export type AccountView =
  | { readonly status: 'unavailable' }
  | { readonly status: 'loading' }
  /** No account on this device. */
  | { readonly status: 'signed_out' }
  /**
   * This device holds an account's data, and the account is not signed in
   * here: the data stays hidden until it is.
   */
  | { readonly status: 'locked'; readonly email: string | undefined; readonly idle: boolean }
  /**
   * Signed in with the password (or Google), and the account has two-step
   * sign-in on: the code comes next. The server serves nothing until it does.
   * `owned`: this device already holds the account's data, so the code is
   * asked for in front of the whole app rather than in Settings.
   */
  | { readonly status: 'second_step'; readonly user: AccountUser; readonly owned: boolean }
  | {
      readonly status: 'signed_in';
      readonly user: AccountUser;
      readonly keys: KeysView;
      readonly sync: SyncState | undefined;
      /** Arrived from a password-reset email: ask for the new password. */
      readonly passwordRecovery: boolean;
      /** Two-step sign-in (an authenticator-app code) is on for this account. */
      readonly twoStep: boolean;
    };

type SignedIn = Extract<AccountView, { status: 'signed_in' }>;

/** The email of the account whose data this device holds, for the sign-in screen. */
const OWNER_EMAIL_KEY = 'accountEmail';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

function userOf(session: Pick<Session, 'user'>): AccountUser {
  const provider = session.user.app_metadata.provider;
  // user_metadata is the account's own to edit: everything read from it is
  // checked for shape, and a picture is taken only from Google's image host -
  // the one the content security policy lets an <img> load from.
  const meta = (session.user.user_metadata as Record<string, unknown> | undefined) ?? {};
  const picture = text(meta['avatar_url']) ?? text(meta['picture']);
  const version = meta['avatar_version'];
  return {
    id: session.user.id,
    email: session.user.email,
    provider: typeof provider === 'string' ? provider : 'email',
    name: text(meta['full_name']) ?? text(meta['name']),
    picture: picture?.startsWith('https://lh3.googleusercontent.com/') === true ? picture : undefined,
    avatarVersion: typeof version === 'number' && Number.isFinite(version) ? version : undefined,
  };
}

const isRetryable = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AuthRetryableFetchError';

export class AccountController {
  private view: AccountView;
  private readonly listeners = new Set<() => void>();
  private runner: SyncRunner | undefined;
  private idle: IdleWatch | undefined;
  private connecting: Promise<Rpc> | undefined;
  private rpc: Rpc | undefined;
  private lastReconnect = 0;
  private lockedForIdle = false;
  /** Shown from the stored session at boot, before supabase-js confirmed it. */
  private provisional = false;
  /** Clearing the device: the page is about to start over; ignore everything. */
  private leaving = false;
  /** Why the sign-in this page came back from Google with did not go through. */
  private redirectFailure: AuthFailure | undefined;
  private readonly settled = new Set<(state: SyncState) => void>();

  constructor(
    private readonly db: BookandryDB,
    /** Starts the app over from nothing. Tests watch it instead of navigating. */
    private readonly restart: () => void = () => {
      window.location.assign('/');
    },
  ) {
    this.view = accountsAvailable() ? { status: 'loading' } : { status: 'unavailable' };
  }

  // -- store -----------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getView = (): AccountView => this.view;

  private set(view: AccountView): void {
    this.view = view;
    for (const listener of this.listeners) listener();
  }

  private patch(change: Partial<Omit<SignedIn, 'status'>>): void {
    if (this.view.status === 'signed_in') this.set({ ...this.view, ...change });
  }

  // -- lifecycle ---------------------------------------------------------------

  /**
   * At boot. Connects only if there is a session (or a sign-in redirect) to
   * pick up; a session left idle past the limit is ended before anything of
   * the account's is shown.
   */
  start(): void {
    if (this.view.status === 'unavailable') return;
    void (async () => {
      const arrival = takeArrival();
      if (arrival !== undefined) {
        await this.finishArrival(arrival);
        return;
      }
      if (!shouldLoadAtBoot()) {
        await this.onSession(null);
        return;
      }
      // A local-first app opens straight away, like a banking app opening on
      // its last view: a stored session for the account this device already
      // holds shows the app at once, while supabase-js loads and checks it.
      // If it turns out to have ended, the sign-in screen replaces the app.
      const stored = storedSessionUser();
      if (
        stored !== undefined &&
        stored.id === (await dataOwner(this.db)) &&
        !idleExpired(systemClock.nowMs()) &&
        !storedSessionNeedsCode()
      ) {
        this.provisional = true;
        this.set({
          status: 'signed_in',
          user: userOf({ user: stored }),
          keys: { kind: 'checking' },
          sync: undefined,
          passwordRecovery: false,
          twoStep: false,
        });
      }
      await this.connect();
    })().catch(() => this.onSession(null));
  }

  /**
   * Back from Google with an ID token: made into a session BEFORE
   * the session is followed, so the sign-in screen does not flash up first.
   */
  private async finishArrival(arrival: Arrival): Promise<void> {
    if (arrival.ok) {
      touch(systemClock.nowMs());
      const { finishGoogleSignIn } = await import('@/services/supabase/auth');
      const result = await finishGoogleSignIn(await getSupabase(), arrival);
      if (!result.ok && result.reason !== 'cancelled') this.redirectFailure = result.reason;
    } else if (arrival.reason !== 'cancelled') {
      this.redirectFailure = arrival.reason;
    }
    await this.connect();
  }

  /**
   * Why the last sign-in with Google failed, for the sign-in screen
   * the page came back to. Cleared by the next attempt.
   */
  signInFailure(): AuthFailure | undefined {
    return this.redirectFailure;
  }

  /** Load supabase-js and follow the session from here on. Idempotent. */
  connect(): Promise<Rpc> {
    this.connecting ??= (async () => {
      const supabase = await getSupabase();
      const rpc = rpcFor(supabase);
      this.rpc = rpc;
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return; // getSession below covers it
        // Deferred: supabase-js holds a lock while it calls this, and awaiting
        // another auth call from inside it deadlocks.
        setTimeout(() => {
          void this.onSession(session, event === 'PASSWORD_RECOVERY');
        }, 0);
      });
      const { data, error } = await supabase.auth.getSession();
      if (data.session === null && isRetryable(error)) {
        // Offline with an access token past its hour. The session is still
        // stored and still good; the data is this person's. Carry on offline -
        // supabase-js refreshes when the network is back, and reports a
        // session that really has ended as SIGNED_OUT.
        const user = storedSessionUser();
        await this.onSession(user === undefined ? null : { user }, false);
      } else {
        await this.onSession(data.session, false);
      }
      return rpc;
    })();
    return this.connecting;
  }

  private async onSession(session: Pick<Session, 'user'> | null, recovery = false): Promise<void> {
    if (this.leaving) return;
    const owner = await dataOwner(this.db);
    if (session === null) {
      this.provisional = false;
      this.stop();
      if (this.view.status === 'unavailable') return;
      if (owner === undefined) {
        this.set({ status: 'signed_out' });
      } else {
        const email = (await this.db.meta.get(OWNER_EMAIL_KEY))?.value;
        this.set({
          status: 'locked',
          email: typeof email === 'string' ? email : undefined,
          idle: this.lockedForIdle,
        });
      }
      return;
    }

    const user = userOf(session);
    if (owner !== undefined && owner !== user.id) {
      // Someone else signed in on a device holding another account's data.
      // That data is safe in its own account; it leaves this device before
      // anything of the new account arrives.
      await this.clearDevice();
      return;
    }

    const current = this.view;
    if (current.status === 'signed_in' && current.user.id === user.id && !this.provisional) {
      // The same person, the account itself changed (a new picture, say).
      this.patch(recovery ? { user, passwordRecovery: true } : { user });
      void this.syncAvatar();
      return;
    }
    // A session restored after sitting idle past the limit ends here, before
    // anything of the account's is shown. A fresh sign-in has just reset the
    // clock (see auth()), so this never catches one.
    if (idleExpired(systemClock.nowMs())) {
      await this.lock();
      return;
    }
    this.stop();
    this.lockedForIdle = false;
    this.provisional = false;
    const step = await this.secondStep();
    if (step.needsCode) {
      this.set({ status: 'second_step', user, owned: owner !== undefined });
      return;
    }
    if (user.email !== undefined) await this.db.meta.put({ key: OWNER_EMAIL_KEY, value: user.email });
    this.set({
      status: 'signed_in',
      user,
      keys: { kind: 'checking' },
      sync: undefined,
      passwordRecovery: recovery,
      twoStep: step.enabled,
    });
    this.idle = watchIdle({ onIdle: () => void this.lock(), nowMs: () => systemClock.nowMs() });
    void this.syncAvatar();
    await this.refreshKeys();
  }

  /**
   * Get this device the account's key - there is nothing for the person to
   * type; signing in is enough - and start keeping in step. Run on every
   * sign-in and whenever the account's key has moved on.
   */
  async refreshKeys(): Promise<void> {
    if (this.view.status !== 'signed_in') return;
    const { id } = this.view.user;
    let keys: KeysView;
    try {
      const result = await connectDevice(this.db, this.server(), id);
      keys = result.ok ? { kind: 'ready' } : { kind: 'rolled_back' };
    } catch (error) {
      // The server's own word that this session still owes a code - one the
      // screens did not see coming (codes turned on from another device while
      // this session lived, say). Ask for it.
      if (error instanceof ServerError && error.code === 'second_step_required') {
        const owned = (await dataOwner(this.db)) !== undefined;
        this.stop();
        this.set({ status: 'second_step', user: this.view.user, owned });
        return;
      }
      // Offline, most likely. Keys already here are good enough to start; the
      // runner finds out soon enough if the account has moved on.
      const local = await loadKeys(this.db);
      keys = local?.userId === id ? { kind: 'ready' } : { kind: 'unknown' };
    }
    this.patch({ keys });
    if (keys.kind === 'ready') this.startRunner(id);
    else this.stopRunner();
  }

  private server(): KeyServer {
    const rpc = this.rpc;
    if (rpc === undefined) throw new Error('not connected');
    return {
      getKeyState: () => getKeyState(rpc),
      setupKeys: (wraps) => setupKeys(rpc, wraps),
      rotateKeys: (from, wraps) => rotateKeys(rpc, from, wraps),
    };
  }

  // -- keeping in step -----------------------------------------------------------

  private startRunner(userId: string): void {
    if (this.runner !== undefined) return;
    const rpc = this.rpc;
    if (rpc === undefined) return;
    this.runner = startSyncRunner({
      db: this.db,
      transport: async () => {
        const keys = await loadKeys(this.db);
        if (keys?.userId !== userId) throw new KeyUnavailableError(0);
        return encryptingTransport(rpcTransport(rpc), { userId, keys: () => keys });
      },
      onState: (sync) => {
        this.patch({ sync });
        if (sync.kind !== 'syncing') {
          for (const resolve of this.settled) resolve(sync);
          this.settled.clear();
        }
        if (sync.kind === 'locked') {
          // The account's key moved on. Fetch the new one - at most twice a
          // minute, so a server that keeps saying so cannot spin this.
          this.stopRunner();
          const now = systemClock.nowMs();
          if (now - this.lastReconnect > 30_000) {
            this.lastReconnect = now;
            void this.refreshKeys();
          } else {
            this.patch({ keys: { kind: 'unknown' } });
          }
        }
      },
    });
  }

  private stopRunner(): void {
    this.runner?.stop();
    this.runner = undefined;
  }

  private stop(): void {
    this.stopRunner();
    this.idle?.stop();
    this.idle = undefined;
  }

  /** Try again now, after "Couldn't reach your account". */
  retry(): void {
    this.runner?.now();
  }

  /**
   * Send what is waiting, as far as the network allows, and say how many
   * changes still have not reached the account. Signing out asks this first:
   * the only thing signing out can lose is what never left the device.
   */
  async unsavedChanges(timeoutMs = 15_000): Promise<number> {
    const runner = this.runner;
    if (runner !== undefined && navigator.onLine) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, timeoutMs);
        function done(): void {
          clearTimeout(timer);
          resolve();
        }
        this.settled.add(done);
        runner.now();
      });
    }
    return this.db.outbox.count();
  }

  // -- signing in --------------------------------------------------------------

  /** Every sign-in starts the inactivity clock afresh. */
  private async auth<T>(fn: (supabase: Awaited<ReturnType<typeof getSupabase>>) => Promise<T>): Promise<T> {
    touch(systemClock.nowMs());
    this.redirectFailure = undefined;
    await this.connect();
    return fn(await getSupabase());
  }

  async signUp(email: string, password: string): Promise<AuthResult & { readonly confirm?: boolean }> {
    const { signUpWithEmail } = await import('@/services/supabase/auth');
    return this.auth((s) => signUpWithEmail(s, email, password));
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { signInWithEmail } = await import('@/services/supabase/auth');
    return this.auth((s) => signInWithEmail(s, email, password));
  }

  /** Leaves the page for Google; start() finishes the sign-in on the way back. */
  async signInWithGoogle(): Promise<AuthResult> {
    const { signInWithGoogle } = await import('@/services/supabase/auth');
    return this.auth((s) => signInWithGoogle(s));
  }

  async sendPasswordReset(email: string): Promise<AuthResult> {
    const { sendPasswordReset } = await import('@/services/supabase/auth');
    return this.auth((s) => sendPasswordReset(s, email));
  }

  async setNewPassword(password: string): Promise<AuthResult> {
    const { setNewPassword } = await import('@/services/supabase/auth');
    const result = await this.auth((s) => setNewPassword(s, password));
    if (result.ok) this.patch({ passwordRecovery: false });
    return result;
  }

  /**
   * "Sign out all other devices" - for a lost or stolen one. Every other
   * session ends, so it can fetch nothing more from the account; signing back
   * in needs the password (and the second step, where there is one). What a
   * device already had on it stays behind its sign-in screen.
   */
  async signOutOthers(): Promise<void> {
    const { signOut } = await import('@/services/supabase/auth');
    const result = await this.auth((s) => signOut(s, 'others'));
    if (!result.ok) throw new Error(result.reason);
  }

  // -- two-step sign-in ----------------------------------------------------------

  /**
   * Where this session stands with the account's second step. Unknown counts
   * as none: the server enforces it regardless, and says so (refreshKeys).
   */
  private async secondStep(): Promise<SecondStep> {
    try {
      const { secondStep } = await import('@/services/supabase/auth');
      return await secondStep(await getSupabase());
    } catch {
      return { enabled: false, needsCode: false };
    }
  }

  /** The code from the authenticator app, after the password or Google. */
  async verifyCode(code: string): Promise<AuthResult> {
    const { verifyCode } = await import('@/services/supabase/auth');
    const result = await this.auth((s) => verifyCode(s, code));
    if (result.ok) {
      const { data } = await (await getSupabase()).auth.getSession();
      await this.onSession(data.session);
    }
    return result;
  }

  /** Back out of the code step: the session ends; any data stays behind the sign-in screen. */
  async cancelSecondStep(): Promise<void> {
    this.stop();
    const { signOut } = await import('@/services/supabase/auth');
    await signOut(await getSupabase(), 'local').catch(() => undefined);
    await this.onSession(null);
  }

  async startTwoStep(): Promise<Enrollment> {
    const { startEnrollment } = await import('@/services/supabase/auth');
    return this.auth((s) => startEnrollment(s));
  }

  async finishTwoStep(factorId: string, code: string): Promise<AuthResult> {
    const { finishEnrollment } = await import('@/services/supabase/auth');
    const result = await this.auth((s) => finishEnrollment(s, factorId, code));
    if (result.ok) this.patch({ twoStep: true });
    return result;
  }

  async turnOffTwoStep(): Promise<AuthResult> {
    const { turnOffCodes } = await import('@/services/supabase/auth');
    const result = await this.auth((s) => turnOffCodes(s));
    if (result.ok) this.patch({ twoStep: false });
    return result;
  }

  // -- passkeys ------------------------------------------------------------------

  async signInWithPasskey(): Promise<AuthResult> {
    const { signInWithPasskey } = await import('@/services/supabase/auth');
    return this.auth((s) => signInWithPasskey(s));
  }

  async addPasskey(): Promise<AuthResult> {
    const { addPasskey } = await import('@/services/supabase/auth');
    return this.auth((s) => addPasskey(s));
  }

  async listPasskeys(): Promise<readonly Passkey[]> {
    const { listPasskeys } = await import('@/services/supabase/auth');
    return this.auth((s) => listPasskeys(s));
  }

  async removePasskey(id: string): Promise<AuthResult> {
    const { removePasskey } = await import('@/services/supabase/auth');
    return this.auth((s) => removePasskey(s, id));
  }

  // -- leaving -----------------------------------------------------------------

  /**
   * Locked after inactivity: the session ends - on the server too, where the
   * network allows - and the data waits behind the sign-in screen, changes not
   * yet sent included. Signing back in to the same account picks up exactly
   * where it stopped.
   */
  async lock(): Promise<void> {
    this.stop();
    this.lockedForIdle = true;
    // Not through auth(): locking is not activity, and must not reset the clock.
    // signOut('local') forgets the session here even when the server cannot
    // be told; the SIGNED_OUT that follows lands in onSession(null) as well.
    const { signOut } = await import('@/services/supabase/auth');
    await signOut(await getSupabase(), 'local').catch(() => undefined);
    await this.onSession(null);
  }

  /**
   * Sign out, and take the account's data off this device. The account keeps
   * it; the next sign-in, here or anywhere, brings it back. The caller has
   * already asked about changes that have not reached the account.
   */
  async signOut(): Promise<void> {
    this.stop();
    const { signOut } = await import('@/services/supabase/auth');
    await this.auth((s) => signOut(s, 'local')).catch(() => undefined);
    await this.clearDevice();
  }

  /**
   * From the sign-in screen: remove the account's data from this device
   * without signing in - a device being handed on, or someone who is not
   * the account holder.
   */
  async removeFromDevice(): Promise<void> {
    this.stop();
    await this.clearDevice();
  }

  /** Delete the account and everything the server holds, and this device's copy. */
  async deleteAccount(): Promise<void> {
    this.stop();
    // Storage keeps its files apart from the database: the picture goes first.
    await this.removeAvatar().catch(() => undefined);
    await deleteMyAccount(await this.connect());
    const { signOut } = await import('@/services/supabase/auth');
    // The account is gone, so the server may refuse; the local session goes regardless.
    await this.auth((s) => signOut(s, 'local')).catch(() => undefined);
    await this.clearDevice();
  }

  // -- profile picture -----------------------------------------------------------

  /** This device's copy of the account's picture, brought in step with the account. */
  private async syncAvatar(): Promise<void> {
    if (this.view.status !== 'signed_in') return;
    const { id, avatarVersion } = this.view.user;
    const kept = await readAvatarVersion(this.db);
    if (avatarVersion === undefined) {
      if (kept !== undefined) await forgetAvatar(this.db);
      return;
    }
    if (kept === avatarVersion) return;
    try {
      const { downloadAvatar } = await import('@/services/supabase/avatar');
      await storeAvatar(this.db, avatarVersion, await downloadAvatar(await getSupabase(), id));
    } catch {
      // Offline, most likely: the initials (or Google's picture) stand in
      // until the next sign-in or change brings it.
    }
  }

  /** A new picture for the account, already squared and shrunk (avatar-image.ts). */
  async setAvatar(image: Blob): Promise<void> {
    if (this.view.status !== 'signed_in') throw new Error('not signed in');
    const user = this.view.user;
    const version = systemClock.nowMs();
    const { uploadAvatar } = await import('@/services/supabase/avatar');
    await uploadAvatar(await getSupabase(), user.id, image, version);
    await storeAvatar(this.db, version, image);
    this.patch({ user: { ...user, avatarVersion: version } });
  }

  async removeAvatar(): Promise<void> {
    if (this.view.status !== 'signed_in') throw new Error('not signed in');
    const user = this.view.user;
    const { removeAvatar } = await import('@/services/supabase/avatar');
    await removeAvatar(await getSupabase(), user.id);
    await forgetAvatar(this.db);
    this.patch({ user: { ...user, avatarVersion: undefined } });
  }

  /** Everything off this device; the app starts over from the beginning. */
  private async clearDevice(): Promise<void> {
    this.leaving = true;
    this.stop();
    await this.db.delete();
    this.restart();
  }
}

let controller: AccountController | undefined;

export function initAccount(db: BookandryDB): AccountController {
  controller ??= new AccountController(db);
  return controller;
}

export function accountController(): AccountController {
  if (controller === undefined) throw new Error('initAccount() was not called');
  return controller;
}

/** What a screen sees before initAccount() - in a component test, say: no accounts. */
const UNAVAILABLE: AccountView = { status: 'unavailable' };
const noAccounts = {
  subscribe: () => () => undefined,
  getView: () => UNAVAILABLE,
};

export function useAccount(): AccountView {
  const store = controller ?? noAccounts;
  return useSyncExternalStore(store.subscribe, store.getView);
}
