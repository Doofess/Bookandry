/**
 * Locking after inactivity, the way a banking app does.
 *
 * A signed-in device that has sat untouched for longer than the person's
 * chosen time ends its session: the next person to pick it up sees the
 * sign-in screen, not the household's money. Measured across tabs and across
 * restarts - the last touch is kept in localStorage - so closing the app and
 * opening it tomorrow counts as the time in between.
 *
 * Per device, not per account: how long a phone may sit unlocked is a
 * property of the phone.
 */

export const LOCK_AFTER_KEY = 'bookandry.lockAfter';
export const LAST_ACTIVE_KEY = 'bookandry.lastActive';

/** Minutes; 0 means never. */
export const LOCK_AFTER_CHOICES = [5, 15, 60, 1440, 0] as const;
export type LockAfter = (typeof LOCK_AFTER_CHOICES)[number];
export const DEFAULT_LOCK_AFTER: LockAfter = 15;

const TOUCH_EVERY_MS = 15_000;
const CHECK_EVERY_MS = 30_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the lock still works within this page's lifetime */
  }
}

export function lockAfter(): LockAfter {
  const n = Number(read(LOCK_AFTER_KEY));
  return (LOCK_AFTER_CHOICES as readonly number[]).includes(n) && read(LOCK_AFTER_KEY) !== null
    ? (n as LockAfter)
    : DEFAULT_LOCK_AFTER;
}

export function setLockAfter(minutes: LockAfter): void {
  write(LOCK_AFTER_KEY, String(minutes));
}

/** Record activity now. */
export function touch(nowMs: number): void {
  write(LAST_ACTIVE_KEY, String(nowMs));
}

/**
 * Whether the device has been idle past the limit. No record of activity is
 * not "idle forever": a device signed in before this existed, or with storage
 * blocked, starts counting from now.
 */
export function idleExpired(nowMs: number): boolean {
  const minutes = lockAfter();
  if (minutes === 0) return false;
  const last = Number(read(LAST_ACTIVE_KEY));
  if (!Number.isFinite(last) || last <= 0) return false;
  return nowMs - last > minutes * 60_000;
}

export type IdleWatch = { stop(): void };

/**
 * Watch for activity, and call `onIdle` once the limit passes. Checked on a
 * timer and whenever the page comes back into view - a phone asleep in a
 * pocket runs no timers, and waking it is exactly when the check matters.
 */
export function watchIdle({
  onIdle,
  nowMs,
  target = window,
}: {
  readonly onIdle: () => void;
  readonly nowMs: () => number;
  readonly target?: Window;
}): IdleWatch {
  let lastWrite = 0;
  let fired = false;

  const check = (): void => {
    if (fired || !idleExpired(nowMs())) return;
    fired = true;
    stop();
    onIdle();
  };

  const activity = (): void => {
    // Coming back after the limit is not activity that resets it.
    check();
    if (fired) return;
    const now = nowMs();
    if (now - lastWrite >= TOUCH_EVERY_MS) {
      lastWrite = now;
      touch(now);
    }
  };

  const visibility = (): void => {
    if (target.document.visibilityState === 'visible') check();
  };

  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  for (const e of events) target.addEventListener(e, activity, { passive: true });
  target.document.addEventListener('visibilitychange', visibility);
  const timer = target.setInterval(check, CHECK_EVERY_MS);
  if (idleExpired(nowMs())) {
    check();
  } else {
    lastWrite = nowMs();
    touch(lastWrite);
  }

  function stop(): void {
    for (const e of events) target.removeEventListener(e, activity);
    target.document.removeEventListener('visibilitychange', visibility);
    target.clearInterval(timer);
  }

  return { stop };
}
