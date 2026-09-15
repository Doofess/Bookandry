import { describe, expect, it } from 'vitest';

/**
 * Canary for the `unit` project, and the determinism guard the plan calls for.
 *
 * `process.env.TZ` is not reliably honoured on Windows. If it silently fails,
 * every date-boundary test in later phases becomes non-reproducible in a way
 * that is very hard to attribute. Fail here instead, on day one.
 */
describe('test environment', () => {
  it('runs with the timezone pinned to UTC', () => {
    // Node's ICU canonicalises 'Etc/UTC' to 'UTC', so accept either. What must
    // NOT appear here is the host zone (e.g. Asia/Jerusalem) - that would mean
    // TZ was silently ignored, which is the documented Windows failure mode.
    expect(['UTC', 'Etc/UTC']).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('has a working Intl with currency data', () => {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'ILS',
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(1);
    expect(parts.some((p) => p.type === 'currency')).toBe(true);
  });
});
