import { useSyncExternalStore } from 'react';

import type { BookandryDB } from '@/db/db';
import {
  changePassphrase,
  joinCheck,
  keyStatus,
  type JoinCheck,
  replaceRecoveryKey,
  rotateDataKey,
  setUpSync,
  unlock,
  type KeyServer,
  type Secret,
  type SyncKeyStatus,
  type UnlockResult,
} from '@/db/sync/account';
import { encryptingTransport, KeyUnavailableError } from '@/db/sync/codec';
import { forgetSyncIdentity, loadKeys } from '@/db/sync/keystore';
import type { AuthResult } from '@/services/supabase/auth';
import {
  accountsAvailable,
  getSupabase,
  rpcFor,
  shouldLoadAtBoot,
  type Session,
} from '@/services/supabase/client';
import {
  deleteMyAccount,
  getKeyState,
  putWrap,
  rotateKeys,
  rpcTransport,
  setupKeys,
  type Rpc,
} from '@/services/supabase/transport';

import { startSyncRunner, type SyncRunner, type SyncState } from './sync-runner';

/**
 * The account, as the screens see it: one store, one source of truth.
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
};

export type KeysView = 'checking' | SyncKeyStatus | 'unknown';

export type AccountView =
  | { readonly status: 'unavailable' }
  | { readonly status: 'loading' }
  | { readonly status: 'signed_out' }
  | {
      readonly status: 'signed_in';
      readonly user: AccountUser;
      readonly keys: KeysView;
      readonly sync: SyncState | undefined;
      /** Arrived from a password-reset email: ask for the new password. */
      readonly passwordRecovery: boolean;
    };

type SignedIn = Extract<AccountView, { status: 'signed_in' }>;

function userOf(session: Session): AccountUser {
  const provider = session.user.app_metadata.provider;
  return {
    id: session.user.id,
    email: session.user.email,
    provider: typeof provider === 'string' ? provider : 'email',
  };
}

export class AccountController {
  private view: AccountView;
  private readonly listeners = new Set<() => void>();
  private runner: SyncRunner | undefined;
  private connecting: Promise<Rpc> | undefined;
  private rpc: Rpc | undefined;

  constructor(private readonly db: BookandryDB) {
    this.view = accountsAvailable() ? { status: 'signed_out' } : { status: 'unavailable' };
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

  /** At boot: connect only if there is a session (or a sign-in redirect) to pick up. */
  start(): void {
    if (this.view.status === 'unavailable') return;
    if (shouldLoadAtBoot()) {
      this.set({ status: 'loading' });
      void this.connect().catch(() => {
        this.set({ status: 'signed_out' });
      });
    }
  }

  /** Load supabase-js and follow the session from here on. Idempotent. */
  connect(): Promise<Rpc> {
    this.connecting ??= (async () => {
      const supabase = await getSupabase();
      const rpc = rpcFor(supabase);
      this.rpc = rpc;
      supabase.auth.onAuthStateChange((event, session) => {
        // Deferred: supabase-js holds a lock while it calls this, and awaiting
        // another auth call from inside it deadlocks.
        setTimeout(() => {
          void this.onSession(session, event === 'PASSWORD_RECOVERY');
        }, 0);
      });
      const { data } = await supabase.auth.getSession();
      await this.onSession(data.session, false);
      return rpc;
    })();
    return this.connecting;
  }

  private async onSession(session: Session | null, recovery: boolean): Promise<void> {
    if (session === null) {
      this.stopRunner();
      if (this.view.status !== 'unavailable') this.set({ status: 'signed_out' });
      return;
    }
    const user = userOf(session);
    const current = this.view;
    if (current.status === 'signed_in' && current.user.id === user.id) {
      if (recovery) this.patch({ passwordRecovery: true });
      return;
    }
    this.stopRunner();
    this.set({ status: 'signed_in', user, keys: 'checking', sync: undefined, passwordRecovery: recovery });
    await this.refreshKeys();
  }

  /** Where this device stands with the account's key; starts syncing if it can. */
  async refreshKeys(): Promise<void> {
    if (this.view.status !== 'signed_in') return;
    const { id } = this.view.user;
    const local = await loadKeys(this.db);
    let keys: KeysView;
    try {
      keys = await keyStatus(this.db, this.server(), id);
    } catch {
      // Offline, most likely. Keys already here are good enough to start; the
      // runner finds out soon enough if the account has moved on.
      keys = local?.userId === id ? 'unlocked' : 'unknown';
    }
    this.patch({ keys });
    if (keys === 'unlocked') this.startRunner(id);
    else this.stopRunner();
  }

  private server(): KeyServer {
    const rpc = this.rpc;
    if (rpc === undefined) throw new Error('not connected');
    return {
      getKeyState: () => getKeyState(rpc),
      setupKeys: (wraps) => setupKeys(rpc, wraps),
      putWrap: (wrap) => putWrap(rpc, wrap),
      rotateKeys: (from, wraps) => rotateKeys(rpc, from, wraps),
    };
  }

  private userId(): string {
    if (this.view.status !== 'signed_in') throw new Error('not signed in');
    return this.view.user.id;
  }

  // -- syncing -----------------------------------------------------------------

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
        this.patch(sync.kind === 'locked' ? { sync, keys: 'locked' } : { sync });
        if (sync.kind === 'locked') this.stopRunner();
      },
    });
  }

  private stopRunner(): void {
    this.runner?.stop();
    this.runner = undefined;
  }

  syncNow(): void {
    this.runner?.now();
  }

  // -- signing in --------------------------------------------------------------

  private async auth<T>(fn: (supabase: Awaited<ReturnType<typeof getSupabase>>) => Promise<T>): Promise<T> {
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

  // -- the key -----------------------------------------------------------------

  /** Whether joining would take another account's data along: ask first. */
  async joinCheck(): Promise<JoinCheck> {
    return joinCheck(this.db, this.userId());
  }

  /**
   * Remove everything from this device and start the app over, still signed
   * in - the "start fresh" answer to joinCheck. The first-run screen then
   * offers to unlock the account.
   */
  async eraseDevice(): Promise<void> {
    this.stopRunner();
    await this.db.delete();
    window.location.assign('/');
  }

  async setUp(passphrase: string, addExistingData = false): Promise<{ readonly recoveryKey: string }> {
    const result = await setUpSync(this.db, this.server(), this.userId(), passphrase, { addExistingData });
    // Not refreshed yet: the recovery key screen comes first, and syncing
    // starts when the person has saved it (finishSetUp).
    return result;
  }

  async finishSetUp(): Promise<void> {
    await this.refreshKeys();
  }

  async unlock(secret: Secret, addExistingData = false): Promise<UnlockResult> {
    const result = await unlock(this.db, this.server(), this.userId(), secret, { addExistingData });
    if (result.ok) await this.refreshKeys();
    return result;
  }

  replaceRecoveryKey(secret: Secret): ReturnType<typeof replaceRecoveryKey> {
    return replaceRecoveryKey(this.server(), this.userId(), secret);
  }

  changePassphrase(secret: Secret, next: string): Promise<UnlockResult> {
    return changePassphrase(this.server(), this.userId(), secret, next);
  }

  /**
   * "I lost a device": new key, and every other session signed out. The new
   * recovery key is returned for the person to save.
   */
  async lostDevice(secret: Secret, passphrase: string): ReturnType<typeof rotateDataKey> {
    const result = await rotateDataKey(this.db, this.server(), this.userId(), secret, passphrase);
    if (result.ok) {
      const { signOut } = await import('@/services/supabase/auth');
      await this.auth((s) => signOut(s, 'others'));
      this.syncNow();
    }
    return result;
  }

  // -- leaving -----------------------------------------------------------------

  /**
   * Sign this device out. Its keys and cursor are forgotten either way; its
   * data stays unless the person chose to remove it, in which case the whole
   * database goes and the app starts over.
   */
  async signOut(removeData: boolean): Promise<void> {
    this.stopRunner();
    const { signOut } = await import('@/services/supabase/auth');
    await this.auth((s) => signOut(s, 'local'));
    await forgetSyncIdentity(this.db);
    this.set({ status: 'signed_out' });
    if (removeData) {
      await this.db.delete();
      window.location.assign('/');
    }
  }

  /** Delete the account and everything the server holds. This device keeps its copy. */
  async deleteAccount(): Promise<void> {
    this.stopRunner();
    await deleteMyAccount(await this.connect());
    await forgetSyncIdentity(this.db);
    const { signOut } = await import('@/services/supabase/auth');
    // The account is gone, so the server may refuse; the local session goes regardless.
    await this.auth((s) => signOut(s, 'local')).catch(() => undefined);
    this.set({ status: 'signed_out' });
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
