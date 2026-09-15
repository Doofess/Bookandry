import { afterEach, describe, expect, it, vi } from 'vitest';

import { LOCK_RECONVERT, LockBusyError, withLock } from './lock';

/** A gate a test can hold open, so a "still running" task can be observed. */
function barrier(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withLock — in-process fallback (no navigator.locks)', () => {
  it('runs a single task straight through', async () => {
    await expect(withLock('t.simple', () => Promise.resolve('done'))).resolves.toBe('done');
  });

  it('serialises overlapping tasks', async () => {
    const order: string[] = [];
    const gate = barrier();

    const a = withLock('t.serial', async () => {
      order.push('a:start');
      await gate.wait;
      order.push('a:end');
    });
    const b = withLock('t.serial', () => {
      order.push('b:start');
      return Promise.resolve();
    });

    // b must not have started while a holds the lock.
    await Promise.resolve();
    expect(order).toEqual(['a:start']);

    gate.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('releases the lock when a task throws', async () => {
    await expect(withLock('t.throws', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(withLock('t.throws', () => Promise.resolve('next'))).resolves.toBe('next');
  });

  it('does not propagate a predecessor’s failure to the next waiter', async () => {
    const gate = barrier();
    const failing = withLock('t.independent', async () => {
      await gate.wait;
      throw new Error('first failed');
    });
    const following = withLock('t.independent', () => Promise.resolve('second ok'));

    gate.open();
    await expect(failing).rejects.toThrow('first failed');
    await expect(following).resolves.toBe('second ok');
  });

  it('refuses rather than queueing when ifAvailable is set', async () => {
    const gate = barrier();
    const holder = withLock('t.busy', () => gate.wait);
    await Promise.resolve();

    await expect(withLock('t.busy', () => Promise.resolve('never'), { ifAvailable: true })).rejects.toThrow(
      LockBusyError,
    );

    gate.open();
    await holder;
    // Once free, the same call succeeds.
    await expect(withLock('t.busy', () => Promise.resolve('now'), { ifAvailable: true })).resolves.toBe(
      'now',
    );
  });

  it('treats a queued waiter as busy, so ifAvailable cannot jump the queue', async () => {
    const gate = barrier();
    const holder = withLock('t.queue', () => gate.wait);
    const queued = withLock('t.queue', () => Promise.resolve('queued'));
    await Promise.resolve();

    await expect(withLock('t.queue', () => Promise.resolve('cut in'), { ifAvailable: true })).rejects.toThrow(
      LockBusyError,
    );

    gate.open();
    await holder;
    await expect(queued).resolves.toBe('queued');
  });

  it('keeps different lock names independent', async () => {
    const gate = barrier();
    const held = withLock('t.one', () => gate.wait);
    await expect(withLock('t.two', () => Promise.resolve('free'), { ifAvailable: true })).resolves.toBe(
      'free',
    );
    gate.open();
    await held;
  });
});

type RequestArgs = [string, unknown, (lock: unknown) => Promise<unknown>];

describe('withLock — real Web Locks', () => {
  it('delegates to navigator.locks when present', async () => {
    const request = vi.fn((...args: RequestArgs) => args[2]({ name: args[0] }));
    vi.stubGlobal('navigator', { locks: { request } });

    await expect(withLock(LOCK_RECONVERT, () => Promise.resolve(42))).resolves.toBe(42);
    expect(request).toHaveBeenCalledWith(LOCK_RECONVERT, { mode: 'exclusive' }, expect.any(Function));
  });

  it('reports a busy lock when the browser hands back a null lock', async () => {
    // With ifAvailable the callback STILL runs when the lock was not granted,
    // with `null` in place of a lock. Anything that ignores that difference
    // silently runs the guarded operation twice.
    const request = vi.fn((...args: RequestArgs) => args[2](null));
    vi.stubGlobal('navigator', { locks: { request } });

    const ran = vi.fn();
    await expect(
      withLock(
        LOCK_RECONVERT,
        () => {
          ran();
          return Promise.resolve();
        },
        { ifAvailable: true },
      ),
    ).rejects.toThrow(LockBusyError);

    expect(ran).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      LOCK_RECONVERT,
      { mode: 'exclusive', ifAvailable: true },
      expect.any(Function),
    );
  });
});
