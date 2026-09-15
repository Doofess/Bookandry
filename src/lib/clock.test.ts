import { describe, expect, it } from 'vitest';

import { fixedClock, systemClock } from './clock';

describe('fixedClock', () => {
  it('freezes both today and the instant', () => {
    const clock = fixedClock(new Date(2026, 8, 15, 12, 0, 0));
    expect(clock.today()).toBe('2026-09-15');
    expect(clock.today()).toBe('2026-09-15');
    expect(clock.nowIso()).toBe(clock.nowIso());
  });

  it('reads the LOCAL calendar date, not the UTC one', () => {
    // Local midnight-adjacent times are where toISOString() would report the
    // wrong day for most of the planet.
    expect(fixedClock(new Date(2026, 0, 1, 0, 5, 0)).today()).toBe('2026-01-01');
    expect(fixedClock(new Date(2026, 11, 31, 23, 55, 0)).today()).toBe('2026-12-31');
  });
});

describe('systemClock', () => {
  it('returns a valid calendar date and a full instant', () => {
    expect(systemClock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(systemClock.nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('msUntilNextDay', () => {
  it('is bounded by one day on the system clock', () => {
    const ms = systemClock.msUntilNextDay();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86_400_000);
  });

  it('is deterministic on a fixed clock', () => {
    const clock = fixedClock(new Date('2026-09-15T18:00:00.000Z'));
    expect(clock.msUntilNextDay()).toBe(21_600_000);
    // Same answer every call: a frozen clock that drifts is not frozen.
    expect(clock.msUntilNextDay()).toBe(21_600_000);
  });
});
