/**
 * Row revisions for sync: which version of a row is newer.
 *
 * A rev is a fixed-width string, so plain string comparison IS the order - in
 * JavaScript, in IndexedDB and in Postgres under `COLLATE "C"`. Three parts:
 *
 *   0001790000000000.0000.a1b2c3d4
 *   ^ epoch ms (16)  ^ ctr ^ device
 *
 * Monotonic PER ROW, not globally. The next rev for a row is at least the wall
 * clock and strictly above that row's previous rev, whoever wrote it. That is
 * all last-write-wins needs, and it is what a hybrid logical clock kept in one
 * tab's memory gets wrong: two tabs with two clocks can hand a later edit a
 * LOWER rev than the one it replaces, and the server would then refuse it.
 *
 * The counter breaks ties inside one millisecond; the device id breaks ties
 * between devices that picked the same millisecond and counter, so two devices
 * can never produce the same rev for different contents.
 */

export type Rev = string & { readonly __brand: 'Rev' };

const MS_WIDTH = 16;
const COUNTER_WIDTH = 4;
const COUNTER_MAX = 0xffff;
const DEVICE_RE = /^[0-9a-z]{8}$/;
const REV_RE = /^(\d{16})\.([0-9a-f]{4})\.([0-9a-z]{8})$/;

/**
 * Below every real rev. Built-in rows that were never edited and the default
 * settings row sit here, so ANY real edit on any device beats a pristine seed.
 */
export const ZERO_REV = `${'0'.repeat(MS_WIDTH)}.${'0'.repeat(COUNTER_WIDTH)}.00000000` as Rev;

export type RevParts = { readonly ms: number; readonly counter: number; readonly deviceId: string };

export function isDeviceId(value: string): boolean {
  return DEVICE_RE.test(value);
}

export function makeRev(parts: RevParts): Rev {
  if (!Number.isSafeInteger(parts.ms) || parts.ms < 0)
    throw new RangeError(`bad rev time: ${String(parts.ms)}`);
  if (!Number.isInteger(parts.counter) || parts.counter < 0 || parts.counter > COUNTER_MAX) {
    throw new RangeError(`bad rev counter: ${String(parts.counter)}`);
  }
  if (!isDeviceId(parts.deviceId)) throw new RangeError(`bad device id: ${parts.deviceId}`);
  return `${String(parts.ms).padStart(MS_WIDTH, '0')}.${parts.counter
    .toString(16)
    .padStart(COUNTER_WIDTH, '0')}.${parts.deviceId}` as Rev;
}

export function isRev(value: string): value is Rev {
  return REV_RE.test(value);
}

export function parseRev(rev: Rev): RevParts {
  const m = REV_RE.exec(rev);
  if (m === null) throw new RangeError(`not a rev: ${rev}`);
  return { ms: Number(m[1]), counter: Number.parseInt(m[2]!, 16), deviceId: m[3]! };
}

export function compareRev(a: Rev, b: Rev): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxRev(a: Rev, b: Rev): Rev {
  return a >= b ? a : b;
}

/**
 * The rev for a write to a row whose current rev is `previous`.
 *
 * Strictly greater than `previous` even when the wall clock is BEHIND it -
 * which happens whenever a row last written by a device with a fast clock is
 * edited here. Falling back to the clock alone would let that edit lose.
 */
export function nextRev(previous: Rev | undefined, nowMs: number, deviceId: string): Rev {
  if (previous === undefined) return makeRev({ ms: nowMs, counter: 0, deviceId });

  const prev = parseRev(previous);
  if (nowMs > prev.ms) return makeRev({ ms: nowMs, counter: 0, deviceId });
  if (prev.counter < COUNTER_MAX) return makeRev({ ms: prev.ms, counter: prev.counter + 1, deviceId });
  // 65,536 writes to one row inside one millisecond: borrow the next one.
  return makeRev({ ms: prev.ms + 1, counter: 0, deviceId });
}

/**
 * A rev for a row that existed before revs did.
 *
 * Taken from the row's own `updatedAt` rather than from now: stamping every
 * pre-existing row with the moment of the upgrade would let a device's stale
 * copy beat an edit made elsewhere since, simply because the upgrade ran later.
 */
export function revFromIso(iso: string, deviceId: string): Rev {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new RangeError(`not an ISO instant: ${iso}`);
  return makeRev({ ms, counter: 0, deviceId });
}
