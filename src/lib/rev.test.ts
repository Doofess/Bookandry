import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compareRev, isRev, makeRev, maxRev, nextRev, parseRev, revFromIso, ZERO_REV, type Rev } from './rev';

const DEV_A = 'aaaaaaaa';
const DEV_B = 'bbbbbbbb';

describe('rev format', () => {
  it('round-trips its parts', () => {
    const rev = makeRev({ ms: 1_790_000_000_123, counter: 7, deviceId: DEV_A });
    expect(rev).toBe('0001790000000123.0007.aaaaaaaa');
    expect(parseRev(rev)).toEqual({ ms: 1_790_000_000_123, counter: 7, deviceId: DEV_A });
    expect(isRev(rev)).toBe(true);
  });

  it('sorts as plain strings exactly as it sorts by meaning', () => {
    // The whole point: Postgres COLLATE "C", IndexedDB and JS agree on `<`
    // only because the fields are fixed-width.
    fc.assert(
      fc.property(
        fc.record({ ms: fc.integer({ min: 0, max: 2 ** 45 }), counter: fc.integer({ min: 0, max: 0xffff }) }),
        fc.record({ ms: fc.integer({ min: 0, max: 2 ** 45 }), counter: fc.integer({ min: 0, max: 0xffff }) }),
        (a, b) => {
          const ra = makeRev({ ...a, deviceId: DEV_A });
          const rb = makeRev({ ...b, deviceId: DEV_A });
          const byMeaning = a.ms !== b.ms ? Math.sign(a.ms - b.ms) : Math.sign(a.counter - b.counter);
          expect(compareRev(ra, rb)).toBe(byMeaning);
        },
      ),
    );
  });

  it('breaks an exact tie by device, so two devices never share a rev', () => {
    const a = makeRev({ ms: 5, counter: 0, deviceId: DEV_A });
    const b = makeRev({ ms: 5, counter: 0, deviceId: DEV_B });
    expect(a).not.toBe(b);
    expect(compareRev(a, b)).toBe(-1);
    expect(maxRev(a, b)).toBe(b);
  });

  it('puts ZERO_REV below everything real', () => {
    expect(compareRev(ZERO_REV, makeRev({ ms: 0, counter: 0, deviceId: '00000001' }))).toBe(-1);
    expect(isRev(ZERO_REV)).toBe(true);
  });

  it.each([
    [{ ms: -1, counter: 0, deviceId: DEV_A }],
    [{ ms: 1.5, counter: 0, deviceId: DEV_A }],
    [{ ms: 1, counter: 0x10000, deviceId: DEV_A }],
    [{ ms: 1, counter: 0, deviceId: 'short' }],
    [{ ms: 1, counter: 0, deviceId: 'UPPERCAS' }],
  ])('refuses malformed parts %j', (parts) => {
    expect(() => makeRev(parts)).toThrow(RangeError);
  });

  it('refuses to parse what it did not write', () => {
    expect(isRev('1.2.3')).toBe(false);
    expect(() => parseRev('nope' as Rev)).toThrow(RangeError);
  });
});

describe('nextRev', () => {
  it('uses the wall clock when it is ahead', () => {
    const prev = makeRev({ ms: 100, counter: 3, deviceId: DEV_B });
    expect(parseRev(nextRev(prev, 200, DEV_A))).toEqual({ ms: 200, counter: 0, deviceId: DEV_A });
  });

  it('stays above a rev from a device whose clock is AHEAD of ours', () => {
    // The row was last written by a device five minutes fast. Our edit is
    // later in real time and must win, even though our clock says otherwise.
    const fast = makeRev({ ms: 1_000_000, counter: 0, deviceId: DEV_B });
    const ours = nextRev(fast, 700_000, DEV_A);
    expect(compareRev(ours, fast)).toBe(1);
    expect(parseRev(ours)).toEqual({ ms: 1_000_000, counter: 1, deviceId: DEV_A });
  });

  it('is strictly increasing for any sequence of writes to one row', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ now: fc.integer({ min: 0, max: 10_000 }), dev: fc.constantFrom(DEV_A, DEV_B) }),
          {
            minLength: 1,
            maxLength: 200,
          },
        ),
        (writes) => {
          let rev: Rev | undefined;
          for (const w of writes) {
            const next = nextRev(rev, w.now, w.dev);
            if (rev !== undefined) expect(compareRev(next, rev)).toBe(1);
            rev = next;
          }
        },
      ),
    );
  });

  it('borrows the next millisecond when the counter runs out', () => {
    const full = makeRev({ ms: 9, counter: 0xffff, deviceId: DEV_A });
    expect(parseRev(nextRev(full, 9, DEV_A))).toEqual({ ms: 10, counter: 0, deviceId: DEV_A });
  });

  it('starts from the clock for a row with no history', () => {
    expect(nextRev(undefined, 42, DEV_A)).toBe(makeRev({ ms: 42, counter: 0, deviceId: DEV_A }));
  });
});

describe('revFromIso', () => {
  it('dates a pre-existing row by its own updatedAt, not by the upgrade', () => {
    expect(parseRev(revFromIso('2026-09-27T10:00:00.000Z', DEV_A)).ms).toBe(
      Date.parse('2026-09-27T10:00:00.000Z'),
    );
  });

  it('refuses a string that is not an instant', () => {
    expect(() => revFromIso('yesterday', DEV_A)).toThrow(RangeError);
  });
});
