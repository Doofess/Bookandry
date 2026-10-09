import { useSyncExternalStore } from 'react';

import type { BookandryDB } from '@/db/db';
import { LOCK_SYNC, withLock } from '@/db/lock';
import { ensureMember } from '@/db/members';
import { connectDevice, dataOwner, type KeyServer } from '@/db/sync/account';
import { encryptingTransport, KeyUnavailableError } from '@/db/sync/codec';
import type { SyncSpace, SyncSpaces } from '@/db/sync/engine';
import { PULLED_TO_HEAD_KEY } from '@/db/sync/engine';
import { loadKeys, loadSpaceKeys } from '@/db/sync/keystore';
import { connectLinked } from '@/db/sync/linked';
import { forgetSpace, knownSpaces } from '@/db/sync/spaces';
import type { WireRequest } from '@/domain/import-wire';
import type { Language } from '@/i18n/boot';
import { systemClock } from '@/lib/clock';
import type { AuthFailure, AuthResult, Enrollment, Passkey, SecondStep } from '@/services/supabase/auth';
import type { CategoryChoice, Suggestion } from '@/services/supabase/categorize';
import {
  accountsAvailable,
  getSupabase,
  rpcFor,
  shouldLoadAtBoot,
  storedSessionNeedsCode,
  storedSessionUser,
  type Session,
} from '@/services/supabase/client';
import type { ExtractOutcome } from '@/services/supabase/extract';
import type { Household, InvitePreview, SendInviteOutcome } from '@/services/supabase/household';
import {
  acceptInvite,
  declineInvite,
  getHousehold,
  leaveHousehold,
  peekInvite,
  removeMember,
  revokeInvite,
  setMyMember,
} from '@/services/supabase/household';
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
import {
  cancelWipe,
  confirmWipe,
  declineWipe,
  peekWipe,
  wipeMyData,
  wipeStatus,
  type SendWipeOutcome,
  type WipePreview,
  type WipeStatus,
} from '@/services/supabase/wipe';
import type { Kind } from '@/types/money';

import {
  forgetAvatar,
  forgetMemberAvatar,
  readAvatarVersion,
  readMemberAvatarVersion,
  storeAvatar,
  storeMemberAvatar,
} from './avatar-store';
import { eraseThisDevice } from './erase-device';
import { idleExpired, touch, watchIdle, type IdleWatch } from './idle-lock';
import { clearShared } from './shared-files';
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
  /** The language its emails come in, once one was recorded. */
  readonly language: Language | undefined;
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
      /**
       * The accounts this one is linked with: null for none, undefined until
       * the server has been asked.
       */
      readonly household?: Household | null;
      /** This device was cleared by someone's erase: who asked, and when. */
      readonly wipeNotice?: {
        readonly by: string | undefined;
        readonly at: number;
        /** Who asked is still being looked up: the notice waits briefly for it. */
        readonly naming?: boolean;
      };
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
  const language = meta['language'];
  return {
    id: session.user.id,
    email: session.user.email,
    provider: typeof provider === 'string' ? provider : 'email',
    name: text(meta['full_name']) ?? text(meta['name']),
    picture: picture?.startsWith('https://lh3.googleusercontent.com/') === true ? picture : undefined,
    avatarVersion: typeof version === 'number' && Number.isFinite(version) ? version : undefined,
    language: language === 'en' || language === 'he' ? language : undefined,
  };
}

/** What the household calls an account that has not named its person yet. */
export function displayNameOf(user: AccountUser): string {
  return user.name ?? user.email?.split('@')[0] ?? '';
}

/** The language the page is in now: set on <html> by i18n/boot. */
const pageLanguage = (): Language => (document.documentElement.lang === 'he' ? 'he' : 'en');

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
  /** Fetch linked accounts' keys afresh on the next sync: one of them moved on. */
  private refreshLinked = false;
  /** This account's person in the household is in place for this session. */
  private memberReady = false;
  /** This start's data is settled (onDataReady), and who is waiting for it. */
  private dataReady = false;
  private readonly onReady: (() => void)[] = [];

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
    if (view.status === 'signed_out') this.markDataReady();
  }

  /**
   * Run fn once this start's data is settled: at once on a device that holds
   * no account's data (accounts unavailable, or signed out), and after the
   * first sync of a signed-in account has pulled - not before, so whatever
   * another device wrote meanwhile is here first. A locked device's data stays
   * hidden, and is never settled.
   */
  onDataReady(fn: () => void): void {
    if (this.dataReady) {
      fn();
      return;
    }
    this.onReady.push(fn);
    if (this.view.status === 'unavailable' || this.view.status === 'signed_out') this.markDataReady();
  }

  private markDataReady(): void {
    if (this.dataReady) return;
    this.dataReady = true;
    for (const fn of this.onReady.splice(0)) fn();
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
      void this.rememberLanguage(pageLanguage());
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
    void this.rememberLanguage(pageLanguage());
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
    // Whatever moved on may have been a linked account's key.
    this.refreshLinked = true;
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
      transport: async (): Promise<SyncSpaces> => {
        const keys = await loadKeys(this.db);
        if (keys?.userId !== userId) throw new KeyUnavailableError(0);
        const own: SyncSpace = {
          id: userId,
          transport: encryptingTransport(rpcTransport(rpc), { userId, keys: () => keys }),
        };
        return { own, linked: await this.linkedSpaces(rpc, userId) };
      },
      onWiped: () => {
        this.afterWipe();
      },
      onState: (sync) => {
        this.patch({ sync });
        if (sync.kind === 'idle' || sync.kind === 'rebasing') {
          this.markDataReady();
          void this.afterSync();
        }
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

  // -- linked accounts -------------------------------------------------------------

  /**
   * The linked accounts' spaces this sync reaches, asked of the server every
   * cycle: a link or an unlink made on another device (or by the other
   * person) takes effect at this device's next sync.
   */
  private async linkedSpaces(rpc: Rpc, me: string): Promise<SyncSpace[]> {
    let members: string[] | undefined;
    try {
      const household = await getHousehold(rpc);
      this.patch({ household });
      members = household?.members.map((m) => m.userId) ?? [];
      void this.syncMemberAvatars(household, me);
    } catch (error) {
      if (error instanceof ServerError && error.code === 'second_step_required') throw error;
      members = undefined; // offline: the spaces already held
    }
    const refresh = this.refreshLinked;
    this.refreshLinked = false;
    const ready = await connectLinked(
      this.db,
      { getKeyState: (s) => getKeyState(rpc, s) },
      me,
      members,
      refresh,
    );
    const spaces: SyncSpace[] = [];
    for (const id of ready) {
      const keys = await loadSpaceKeys(this.db, id);
      if (keys === undefined) continue;
      spaces.push({
        id,
        transport: encryptingTransport(rpcTransport(rpc, id), { userId: id, keys: () => keys }),
      });
    }
    return spaces;
  }

  /**
   * Once the device holds everything: this account's own person in the
   * household, and what the other members see of it.
   */
  private async afterSync(): Promise<void> {
    if (this.view.status !== 'signed_in') return;
    const { user, household } = this.view;
    try {
      if (!this.memberReady && (await this.db.meta.get(PULLED_TO_HEAD_KEY)) !== undefined) {
        await ensureMember(this.db, user.id, displayNameOf(user), systemClock.nowIso(), systemClock.today());
        this.memberReady = true;
      }
      const mine = household?.members.find((m) => m.userId === user.id);
      if (mine === undefined || this.rpc === undefined) return;
      const name = (await this.db.profiles.get(user.id))?.name ?? displayNameOf(user);
      const version = user.avatarVersion ?? 0;
      if (mine.displayName !== name || mine.avatarVersion !== version || mine.pictureUrl !== user.picture) {
        await setMyMember(this.rpc, name, version, user.picture);
      }
    } catch {
      // Offline, or the device being cleared; the next sync tries again.
    }
  }

  /** Each linked account's picture, kept on this device in step with its version. */
  private async syncMemberAvatars(household: Household | null, me: string): Promise<void> {
    try {
      for (const member of household?.members ?? []) {
        if (member.userId === me) continue;
        const kept = await readMemberAvatarVersion(this.db, member.userId);
        if (member.avatarVersion === 0) {
          if (kept !== undefined) await forgetMemberAvatar(this.db, member.userId);
          continue;
        }
        if (kept === member.avatarVersion) continue;
        const { downloadAvatar } = await import('@/services/supabase/avatar');
        const image = await downloadAvatar(await getSupabase(), member.userId);
        await storeMemberAvatar(this.db, member.userId, member.avatarVersion, image);
      }
    } catch {
      // Initials stand in until the next sync brings it.
    }
  }

  // -- deleting all data ----------------------------------------------------------

  /**
   * An erase reached this device: the engine already cleared it, so what is
   * left is to start over as a new member would, and say who asked.
   */
  private afterWipe(): void {
    // The person is queued again by the erase; ensureMember waits for the next pull to head.
    this.memberReady = false;
    // Shared files are the data too, and the engine's clear does not reach them.
    void clearShared().catch(() => undefined);
    // Told at once, so the sync's own state is not held up by the server; who
    // asked is looked up after, and the notice waits a moment for the name.
    const at = systemClock.nowMs();
    this.patch({ wipeNotice: { by: undefined, at, naming: true } });
    void this.nameWipe(at);
  }

  private async nameWipe(at: number): Promise<void> {
    let by: string | undefined;
    try {
      const status = await wipeStatus(await this.connect());
      // A blank name reads as no name: "at 's request" is worse than none.
      if (status?.status === 'done') by = status.requesterName || undefined;
    } catch {
      // Named or not, the notice still shows.
    }
    // Only for the erase it was asked about: a later one has its own lookup.
    if (this.view.status !== 'signed_in' || this.view.wipeNotice?.at !== at) return;
    this.patch({ wipeNotice: { by, at } });
  }

  /** Alone: erase everything, on the server and here. With no account on the device: here only. */
  async wipeMyData(): Promise<void> {
    if (this.view.status === 'signed_out' || this.view.status === 'unavailable') {
      await eraseThisDevice(this.db);
      return;
    }
    // A device that holds an account's data but is not signed in (locked, at
    // the code step, still loading) must not erase locally alone: the server
    // would still hold everything, and it would sync straight back.
    if (this.view.status !== 'signed_in') throw new Error('not signed in');
    const userId = this.view.user.id;
    const rpc = await this.connect();
    // The server's erase and ours are one step under the sync lock: no sync can
    // meet the new erase counter before it is recorded, and mistake it for
    // someone else's erase.
    await withLock(LOCK_SYNC, async () => {
      const epoch = await wipeMyData(rpc);
      await eraseThisDevice(this.db, { epochs: new Map([[userId, epoch]]) });
    });
    this.memberReady = false;
    this.runner?.now();
  }

  /** Ask the household to agree to an erase: each member is emailed a link. */
  async requestWipe(language: 'en' | 'he'): Promise<SendWipeOutcome> {
    if (this.view.status !== 'signed_in') return { ok: false, error: 'not_linked' };
    try {
      const { sendWipeRequests } = await import('@/services/supabase/send-wipe');
      await this.connect();
      return await sendWipeRequests(await getSupabase(), language);
    } catch {
      return { ok: false, error: 'offline' };
    }
  }

  async wipeStatus(): Promise<WipeStatus | null> {
    return wipeStatus(await this.connect());
  }

  async peekWipe(token: string): Promise<WipePreview> {
    return peekWipe(await this.connect(), token);
  }

  /** The last confirmation erases; this device is told by its next sync, so ask for one. */
  async confirmWipe(token: string): Promise<'waiting' | 'done'> {
    const outcome = await confirmWipe(await this.connect(), token);
    if (outcome === 'done') this.runner?.now();
    return outcome;
  }

  async declineWipe(token: string): Promise<void> {
    await declineWipe(await this.connect(), token);
  }

  async cancelWipe(): Promise<void> {
    await cancelWipe(await this.connect());
  }

  /** Ask the server who is in the household now. */
  async refreshHousehold(): Promise<Household | null | undefined> {
    if (this.view.status !== 'signed_in') return undefined;
    const household = await getHousehold(await this.connect());
    this.patch({ household });
    return household;
  }

  /** Email an invitation to join this account's household. */
  async invite(email: string, currency: string, language: 'en' | 'he'): Promise<SendInviteOutcome> {
    if (this.view.status !== 'signed_in') return { ok: false, error: 'offline' };
    const user = this.view.user;
    const name = (await this.db.profiles.get(user.id))?.name ?? displayNameOf(user);
    const { sendInvite } = await import('@/services/supabase/send-invite');
    try {
      await this.connect();
      // The others see this name in the email and on the invitation.
      await setMyMember(await this.connect(), name, user.avatarVersion ?? 0, user.picture).catch(
        () => undefined,
      );
      const outcome = await sendInvite(await getSupabase(), email, currency, language, name);
      if (outcome.ok) await this.refreshHousehold().catch(() => undefined);
      return outcome;
    } catch {
      return { ok: false, error: 'offline' };
    }
  }

  async revokeInvite(id: string): Promise<void> {
    await revokeInvite(await this.connect(), id);
    await this.refreshHousehold();
  }

  async peekInvite(token: string): Promise<InvitePreview> {
    return peekInvite(await this.connect(), token);
  }

  async declineInvite(token: string): Promise<void> {
    await declineInvite(await this.connect(), token);
  }

  /**
   * Join the household the invitation is for. The caller has already brought
   * this account's books into the household's currency; what is waiting to be
   * sent goes first, so the others meet this account as it is now.
   */
  async acceptInvite(token: string, currency: string): Promise<void> {
    if (this.view.status !== 'signed_in') throw new Error('not signed in');
    const user = this.view.user;
    await this.unsavedChanges();
    const name = (await this.db.profiles.get(user.id))?.name ?? displayNameOf(user);
    const household = await acceptInvite(await this.connect(), token, currency, name);
    this.patch({ household });
    this.runner?.now();
  }

  /**
   * Unlink this account from the household. Each keeps their own: the
   * others' rows leave this device, this account's leave theirs.
   */
  async leaveHousehold(): Promise<void> {
    await leaveHousehold(await this.connect());
    for (const space of await knownSpaces(this.db)) await forgetSpace(this.db, space);
    this.patch({ household: null });
    this.runner?.now();
  }

  /** The household's owner unlinks someone else. */
  async removeMember(userId: string): Promise<void> {
    await removeMember(await this.connect(), userId);
    await forgetSpace(this.db, userId);
    await this.refreshHousehold();
    this.runner?.now();
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

  async signUp(
    email: string,
    password: string,
    language: Language,
  ): Promise<AuthResult & { readonly confirm?: boolean }> {
    const { signUpWithEmail } = await import('@/services/supabase/auth');
    return this.auth((s) => signUpWithEmail(s, email, password, language));
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
    // Started without waiting, so nothing may escape: offline, most likely,
    // or the device being cleared underneath it (signing out closes the
    // database). The initials (or Google's picture) stand in until the next
    // sign-in or change brings it.
    try {
      const kept = await readAvatarVersion(this.db);
      if (avatarVersion === undefined) {
        if (kept !== undefined) await forgetAvatar(this.db);
        return;
      }
      if (kept === avatarVersion) return;
      const { downloadAvatar } = await import('@/services/supabase/avatar');
      await storeAvatar(this.db, avatarVersion, await downloadAvatar(await getSupabase(), id));
    } catch {
      // Kept as it was; see above.
    }
  }

  /**
   * Which of `choices` the typed name belongs in, and an expense's business
   * type, by asking Claude through the account's server
   * (services/supabase/categorize.ts). Only while signed in - the server
   * answers nobody else - and `{}` whenever there is no answer: the person
   * chooses, as they always could.
   */
  async suggestCategory(name: string, kind: Kind, choices: readonly CategoryChoice[]): Promise<Suggestion> {
    if (this.view.status !== 'signed_in') return {};
    try {
      const { suggestCategory } = await import('@/services/supabase/categorize');
      return await suggestCategory(await getSupabase(), name, kind, choices);
    } catch {
      return {};
    }
  }

  /**
   * One call to "Smart import"'s reader (services/supabase/extract.ts). Only
   * while signed in: the server reads for nobody else, and counts each call
   * against the person's daily cap.
   */
  async extractTransactions(request: WireRequest, signal?: AbortSignal): Promise<ExtractOutcome> {
    if (this.view.status !== 'signed_in') return { ok: false, error: 'unauthorized' };
    try {
      const { callExtract } = await import('@/services/supabase/extract');
      return await callExtract(await getSupabase(), request, signal);
    } catch {
      return { ok: false, error: signal?.aborted === true ? 'aborted' : 'offline' };
    }
  }

  /**
   * Keeps the account's emails in the language the person uses here: on
   * every sign-in, and whenever they switch. Started without waiting, so
   * nothing may escape - the next sign-in tries again.
   */
  async rememberLanguage(language: Language): Promise<void> {
    if (this.view.status !== 'signed_in' || this.view.user.language === language) return;
    const user = this.view.user;
    try {
      const { rememberLanguage } = await import('@/services/supabase/auth');
      await rememberLanguage(await getSupabase(), language);
      this.patch({ user: { ...user, language } });
    } catch {
      // Offline, most likely.
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
    // Files shared to the app and not yet read are the person's too.
    await clearShared().catch(() => undefined);
    await this.db.delete();
    this.restart();
  }
}

let controller: AccountController | undefined;

export function initAccount(db: BookandryDB): AccountController {
  controller ??= new AccountController(db);
  return controller;
}

/** A language switch, passed on to the account (when there is one). */
export function rememberAccountLanguage(language: Language): void {
  void controller?.rememberLanguage(language);
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
