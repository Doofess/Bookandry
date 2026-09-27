import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureSettings } from '@/db/repos/settings';
import { KeyUnavailableError } from '@/db/sync/codec';
import type { SyncTransport } from '@/db/sync/protocol';
import { instantFromMs } from '@/lib/dates';
import { ServerError } from '@/services/supabase/transport';
import { freshDb, type TestDb } from '@/test/db-harness';
import { MemorySyncServer } from '@/test/memory-sync-server';

import { classify, startSyncRunner, type SyncRunner, type SyncState } from './sync-runner';

/*
 * When the runner syncs, and what it calls the outcome. The sync itself is the
 * engine's, tested elsewhere; here the transport is the in-memory server.
 */

let handle: TestDb;
let server: MemorySyncServer;
let states: SyncState[];
let online: boolean;
let pulls: number;
let calls: number;
let fail: Error | undefined;
let runner: SyncRunner | undefined;
const target = new EventTarget();

function transport(): SyncTransport {
  const inner = server.transport();
  return {
    push: (records) => {
      calls += 1;
      return fail === undefined ? inner.push(records) : Promise.reject(fail);
    },
    pull: (cursor, limit) => {
      pulls += 1;
      calls += 1;
      return fail === undefined ? inner.pull(cursor, limit) : Promise.reject(fail);
    },
  };
}

function start(): SyncRunner {
  runner = startSyncRunner({
    db: handle.db,
    transport: () => Promise.resolve(transport()),
    onState: (s) => states.push(s),
    target,
    isOnline: () => online,
  });
  return runner;
}

const last = () => states.at(-1)?.kind;

/*
 * Real time, not fake. IndexedDB work and Dexie's change notifications run on
 * the real event loop, so "nothing happened" is only a finding after giving
 * them a real chance to happen. The fake clock advances alongside
 * (shouldAdvanceTime), so a short real wait still cannot reach the debounce.
 */
const realSetTimeout = globalThis.setTimeout;
const settle = (ms = 300) => new Promise<void>((resolve) => realSetTimeout(resolve, ms));

beforeEach(async () => {
  handle = freshDb();
  handle.db.syncNowMs = () => Date.parse('2026-09-27T10:00:00.000Z');
  await handle.db.open();
  await ensureSettings(handle.db, instantFromMs(Date.parse('2026-09-27T10:00:00.000Z')));
  // Only the runner's own timers: fake-indexeddb schedules its transactions
  // with setImmediate, and faking that stalls every database call.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  server = new MemorySyncServer();
  states = [];
  online = true;
  pulls = 0;
  calls = 0;
  fail = undefined;
});
afterEach(async () => {
  runner?.stop();
  runner = undefined;
  vi.useRealTimers();
  await handle.dispose();
});

describe('the sync runner', () => {
  it('syncs straight away, and says when', async () => {
    start();
    await vi.waitFor(() => {
      expect(last()).toBe('idle');
    });
    expect(states[0]?.kind).toBe('syncing');
    const idle = states.at(-1);
    expect(idle?.kind === 'idle' && idle.lastSyncedAt !== undefined).toBe(true);
  });

  it('syncs again soon after a local change, not on every keystroke', async () => {
    start();
    await vi.waitFor(() => {
      expect(last()).toBe('idle');
    });
    const before = pulls;
    await handle.db.profiles.put({ id: 'p1' } as never);
    await handle.db.profiles.put({ id: 'p2' } as never);
    await settle();
    expect(pulls).toBe(before);
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(() => {
      expect(
        server
          .snapshot()
          .map((r) => r.id)
          .sort(),
      ).toEqual(['p1', 'p2']);
    });
  });

  it('waits out being offline, and goes as soon as the network is back', async () => {
    online = false;
    start();
    await vi.waitFor(() => {
      expect(last()).toBe('offline');
    });
    expect(pulls).toBe(0);
    online = true;
    target.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(last()).toBe('idle');
    });
  });

  it('backs off after a failure, then recovers', async () => {
    fail = new Error('500');
    start();
    await vi.waitFor(() => {
      expect(last()).toBe('error');
    });
    const failed = calls;
    await vi.advanceTimersByTimeAsync(4_000);
    await settle(50);
    expect(calls).toBe(failed); // not hammering
    fail = undefined;
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => {
      expect(last()).toBe('idle');
    });
  });

  it('stops for good when the account has a key this device lacks', async () => {
    fail = new KeyUnavailableError(2);
    start();
    await vi.waitFor(() => {
      expect(last()).toBe('locked');
    });
    const after = calls;
    await vi.advanceTimersByTimeAsync(600_000);
    await settle();
    expect(calls).toBe(after);
  });

  it('does nothing once stopped', async () => {
    start().stop();
    await vi.advanceTimersByTimeAsync(120_000);
    await settle();
    expect(calls).toBe(0);
  });
});

describe('classify', () => {
  it('tells locked, offline and broken apart', () => {
    expect(classify(new KeyUnavailableError(3), true)).toBe('locked');
    expect(classify(new ServerError('stale_key_version'), true)).toBe('locked');
    expect(classify(new TypeError('Failed to fetch'), true)).toBe('offline');
    expect(classify(new Error('anything'), false)).toBe('offline');
    expect(classify(new ServerError('quota_exceeded'), true)).toBe('error');
  });
});
