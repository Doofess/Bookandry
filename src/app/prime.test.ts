import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';

const relay = vi.hoisted(() => ({
  fetchBoiRate: vi.fn<() => Promise<{ boiRate: string; nextDecision?: string }>>(),
}));
vi.mock('@/services/prime/prime-rate', () => relay);

const { refreshPrime, startPrimeWatcher, usePrime } = await import('./prime');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-04T08:00:00.000Z'));
  relay.fetchBoiRate.mockReset().mockResolvedValue({ boiRate: '3.25', nextDecision: '2026-10-21' });
  await db.open();
  await db.meta.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('keeping prime current', () => {
  it('fetches the Bank of Israel rate and keeps it on this device', async () => {
    await refreshPrime();
    expect((await db.meta.get('primeRate'))?.value).toEqual({
      boiRate: '3.25',
      nextDecision: '2026-10-21',
      checkedAt: '2026-10-04T08:00:00.000Z',
    });
  });

  it('does not ask again within the hour, and does after it', async () => {
    await refreshPrime();
    vi.setSystemTime(new Date('2026-10-04T08:30:00.000Z'));
    await refreshPrime();
    expect(relay.fetchBoiRate).toHaveBeenCalledTimes(1);

    relay.fetchBoiRate.mockResolvedValue({ boiRate: '3', nextDecision: '2026-11-25' });
    vi.setSystemTime(new Date('2026-10-04T09:00:00.000Z'));
    await refreshPrime();
    expect((await db.meta.get('primeRate'))?.value).toMatchObject({ boiRate: '3' });
  });

  it('keeps the last rate when the relay cannot be reached', async () => {
    await refreshPrime();
    relay.fetchBoiRate.mockRejectedValue(new Error('offline'));
    vi.setSystemTime(new Date('2026-10-04T10:00:00.000Z'));
    await refreshPrime();
    expect((await db.meta.get('primeRate'))?.value).toMatchObject({ boiRate: '3.25' });
  });

  it('shows the built-in figure until there is a fetched one, then that', async () => {
    // Dexie's live queries run on the real clock.
    vi.useRealTimers();
    const before = renderHook(() => usePrime());
    await waitFor(() => {
      expect(before.result.current.source.kind).toBe('built_in');
    });
    before.unmount();

    await refreshPrime();
    const after = renderHook(() => usePrime());
    await waitFor(() => {
      expect(after.result.current).toMatchObject({ primeRate: '4.75', source: { kind: 'live' } });
    });
  });

  it('checks on start, on coming back into view and back online, and hourly', async () => {
    const stop = startPrimeWatcher();
    await vi.waitFor(() => {
      expect(relay.fetchBoiRate).toHaveBeenCalledTimes(1);
    });

    vi.setSystemTime(new Date('2026-10-04T09:30:00.000Z'));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(relay.fetchBoiRate).toHaveBeenCalledTimes(2);
    });

    vi.setSystemTime(new Date('2026-10-04T11:00:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => {
      expect(relay.fetchBoiRate).toHaveBeenCalledTimes(3);
    });

    vi.setSystemTime(new Date('2026-10-04T12:30:00.000Z'));
    vi.advanceTimersByTime(60 * 60_000);
    await vi.waitFor(() => {
      expect(relay.fetchBoiRate).toHaveBeenCalledTimes(4);
    });

    stop();
    vi.setSystemTime(new Date('2026-10-04T15:00:00.000Z'));
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(60 * 60_000);
    await Promise.resolve();
    expect(relay.fetchBoiRate).toHaveBeenCalledTimes(4);
  });
});
