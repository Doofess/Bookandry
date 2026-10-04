import { describe, expect, it } from 'vitest';

import type { IsoInstant } from '@/types/money';

import {
  BUILT_IN_BOI_RATE,
  PRIME_RECHECK_MS,
  parseBoiAnswer,
  primeFrom,
  primeIsStale,
  primeView,
  type StoredPrime,
} from './prime';
import { d } from './test-factories';

const AT = '2026-10-04T08:00:00.000Z' as IsoInstant;
const AT_MS = Date.parse(AT);
const stored = (over: Partial<StoredPrime> = {}): StoredPrime => ({
  boiRate: '3.25',
  nextDecision: d('2026-10-21'),
  checkedAt: AT,
  ...over,
});

describe('prime', () => {
  it('is the Bank of Israel rate plus 1.5', () => {
    expect(primeFrom('3.25')).toBe('4.75');
    expect(primeFrom('0.1')).toBe('1.6');
  });

  it('believes only a rate that is one', () => {
    expect(parseBoiAnswer({ boiRate: '3.25', nextDecision: '2026-10-21', source: 'boi-api' })).toEqual({
      boiRate: '3.25',
      nextDecision: '2026-10-21',
    });
    // No next decision from the statistics fallback; an unreadable one is dropped.
    expect(parseBoiAnswer({ boiRate: '3.25' })).toEqual({ boiRate: '3.25' });
    expect(parseBoiAnswer({ boiRate: '3.25', nextDecision: 'soon' })).toEqual({ boiRate: '3.25' });
    for (const bad of [
      null,
      'x',
      {},
      { boiRate: 3.25 },
      { boiRate: '1e1' },
      { boiRate: '-1' },
      { boiRate: '51' },
    ]) {
      expect(parseBoiAnswer(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('shows the fetched rate, or this build’s own with its date', () => {
    expect(primeView(stored())).toEqual({
      primeRate: '4.75',
      boiRate: '3.25',
      nextDecision: '2026-10-21',
      source: { kind: 'live', checkedAt: AT },
    });
    expect(primeView(stored({ nextDecision: undefined }))).not.toHaveProperty('nextDecision');
    expect(primeView(undefined)).toEqual({
      primeRate: primeFrom(BUILT_IN_BOI_RATE.boiRate),
      boiRate: BUILT_IN_BOI_RATE.boiRate,
      source: { kind: 'built_in', asOf: BUILT_IN_BOI_RATE.asOf },
    });
  });

  it('asks again after an hour, never asked, or once a decision is due', () => {
    const today = d('2026-10-04');
    expect(primeIsStale(undefined, AT_MS, today)).toBe(true);
    expect(primeIsStale(stored(), AT_MS + 60_000, today)).toBe(false);
    expect(primeIsStale(stored(), AT_MS + PRIME_RECHECK_MS, today)).toBe(true);
    expect(primeIsStale(stored({ checkedAt: 'garbage' as IsoInstant }), AT_MS, today)).toBe(true);
    // Decision day: the rate checked the day before is the one that must not linger.
    const decided = stored({
      nextDecision: d('2026-10-04'),
      checkedAt: '2026-10-03T23:30:00.000Z' as IsoInstant,
    });
    expect(primeIsStale(decided, Date.parse(decided.checkedAt) + 60_000, d('2026-10-04'))).toBe(true);
    // Checked on the day itself, it waits out the hour like any other.
    expect(primeIsStale(stored({ nextDecision: d('2026-10-04') }), AT_MS + 60_000, d('2026-10-04'))).toBe(
      false,
    );
  });
});
