import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LOCK_AFTER,
  idleExpired,
  LAST_ACTIVE_KEY,
  LOCK_AFTER_KEY,
  lockAfter,
  setLockAfter,
  watchIdle,
} from './idle-lock';

const MIN = 60_000;

afterEach(() => {
  localStorage.clear();
});

describe('how long a device may sit unused', () => {
  it('is 15 minutes unless chosen otherwise, and ignores nonsense', () => {
    expect(lockAfter()).toBe(DEFAULT_LOCK_AFTER);
    expect(DEFAULT_LOCK_AFTER).toBe(15);
    setLockAfter(60);
    expect(lockAfter()).toBe(60);
    localStorage.setItem(LOCK_AFTER_KEY, '7');
    expect(lockAfter()).toBe(15);
  });

  it('counts from the last touch, and never from "no record"', () => {
    const now = 100 * MIN;
    expect(idleExpired(now)).toBe(false);
    localStorage.setItem(LAST_ACTIVE_KEY, String(now - 14 * MIN));
    expect(idleExpired(now)).toBe(false);
    localStorage.setItem(LAST_ACTIVE_KEY, String(now - 16 * MIN));
    expect(idleExpired(now)).toBe(true);
    setLockAfter(0);
    expect(idleExpired(now)).toBe(false);
  });
});

describe('watching', () => {
  it('locks once the limit passes, noticed when the page comes back into view', () => {
    let now = 100 * MIN;
    const onIdle = vi.fn();
    const watch = watchIdle({ onIdle, nowMs: () => now });
    expect(onIdle).not.toHaveBeenCalled();

    now += 16 * MIN; // asleep in a pocket: no timers ran
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onIdle).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(onIdle).toHaveBeenCalledTimes(1);
    watch.stop();
  });

  it('is kept at bay by use', () => {
    let now = 100 * MIN;
    const onIdle = vi.fn();
    const watch = watchIdle({ onIdle, nowMs: () => now });
    for (let i = 0; i < 6; i++) {
      now += 10 * MIN;
      window.dispatchEvent(new Event('pointerdown'));
    }
    expect(onIdle).not.toHaveBeenCalled();
    expect(Number(localStorage.getItem(LAST_ACTIVE_KEY))).toBe(now);
    watch.stop();
  });

  it('does not let the first touch after the limit count as use', () => {
    let now = 100 * MIN;
    const onIdle = vi.fn();
    watchIdle({ onIdle, nowMs: () => now });
    now += 20 * MIN;
    window.dispatchEvent(new Event('pointerdown'));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
