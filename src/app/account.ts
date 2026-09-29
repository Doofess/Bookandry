import { useSyncExternalStore } from 'react';

import type { BookandryDB } from '@/db/db';
import { connectDevice, rotateAccountKey, type KeyServer } from '@/db/sync/account';
import { encryptingTransport, KeyUnavailableError } from '@/db/sync/codec';
import { forgetSyncIdentity, loadKeys } from '@/db/sync/keystore';
import { systemClock } from '@/lib/clock';
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

/** Where this device stands with the account's key. */
export type KeysView =
  | { readonly kind: 'checking' }
  /** Holds the account's current key; syncing. */
  | { readonly kind: 'ready' }
  /** Holds another account's data: the person chooses (add it, or remove it). */
  | { readonly kind: 'foreign'; readonly profiles: number; readonly transactions: number }
  /** The account was set up behind a passphrase and this device never held that key. */
  | { readonly kind: 'legacy_locked' }
  /** The server offered an older key than this device holds. Sync stops. */
  | { readonly kind: 'rolled_back' }
  /** Could not reach the server to find out. */
  | { readonly kind: 'unknown' };

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
    this.set({
      status: 'signed_in',
      user,
      keys: { kind: 'checking' },
      sync: undefined,
      passwordRecovery: recovery,
    });
    await this.refreshKeys();
  }

  /**
   * Get this device the account's key - there is nothing for the person to
   * type; signing in is enough - and start syncing. Run on every sign-in and
   * whenever the account's key has moved on.
   */
  async refreshKeys(addExistingData = false): Promise<void> {
    if (this.view.status !== 'signed_in') return;
    const { id } = this.view.user;
    let keys: KeysView;
    try {
      const result = await connectDevice(this.db, this.server(), id, { addExistingData });
      if (result.ok) {
        this.moveToAccountKey = result.needsAccountKey;
        keys = { kind: 'ready' };
      } else if (result.reason === 'foreign_data') {
        keys = { kind: 'foreign', profiles: result.profiles, transactions: result.transactions };
      } else if (result.reason === 'downgrade') {
        keys = { kind: 'rolled_back' };
      } else {
        keys = { kind: 'legacy_locked' };
      }
    } catch {
      // Offline, most likely. Keys already here are good enough to start; the
      // runner finds out soon enough if the account has moved on.
      const local = await loadKeys(this.db);
      keys = local?.userId === id ? { kind: 'ready' } : { kind: 'unknown' };
    }
    this.patch({ keys });
    if (keys.kind === 'ready') this.startRunner(id);
    else this.stopRunner();
  }

  /**
   * Set on a device holding the key of an account set up behind a sync
   * passphrase. After its first complete sync - so it holds everything the
   * account had - it moves the account to a key the account holds itself.
   */
  private moveToAccountKey = false;
  private lastReconnect = 0;

  private server(): KeyServer {
    const rpc = this.rpc;
    if (rpc === undefined) throw new Error('not connected');
    return {
      getKeyState: () => getKeyState(rpc),
      setupKeys: (wraps) => setupKeys(rpc, wraps),
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
        this.patch({ sync });
        if (sync.kind === 'locked') {
          // The account's key moved on (another device signed the others out,
          // or moved the account over). Fetch the new one - at most twice a
          // minute, so a server that keeps saying so cannot spin this.
          this.stopRunner();
          const now = systemClock.nowMs();
          if (now - this.lastReconnect > 30_000) {
            this.lastReconnect = now;
            void this.refreshKeys();
          } else {
            this.patch({ keys: { kind: 'unknown' } });
          }
        } else if (sync.kind === 'idle' && this.moveToAccountKey) {
          this.moveToAccountKey = false;
          void this.rotate().catch(() => {
            this.moveToAccountKey = true; // try again after the next sync
          });
        }
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

  /** The person chose to add this device's other-account data to this account. */
  async addExistingData(): Promise<void> {
    await this.refreshKeys(true);
  }

  /**
   * Remove everything from this device and start the app over, still signed
   * in - the other answer to "this device holds another account's data".
   */
  async eraseDevice(): Promise<void> {
    this.stopRunner();
    await this.db.delete();
    window.location.assign('/');
  }

  private async rotate(): Promise<void> {
    this.stopRunner();
    try {
      await rotateAccountKey(this.db, this.server(), this.userId());
    } finally {
      await this.refreshKeys();
    }
  }

  /**
   * An account set up behind a passphrase that no device here can open: start
   * the synced copy over from what this device holds.
   */
  startFresh(): Promise<void> {
    return this.rotate();
  }

  /**
   * "Sign out all other devices" - for a lost or stolen one. Every other
   * session ends, so it can fetch nothing more from the account; signing back
   * in needs the password (and the second factor, where there is one).
   *
   * No new key: the account holds its key, so a device able to sign in again
   * could fetch a new one just as well. What it already has on it, it keeps -
   * the README says so.
   */
  async signOutOthers(): Promise<void> {
    const { signOut } = await import('@/services/supabase/auth');
    const result = await this.auth((s) => signOut(s, 'others'));
    if (!result.ok) throw new Error(result.reason);
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
