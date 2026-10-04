import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { primeIsStale, primeView, type PrimeView, type StoredPrime } from '@/domain/prime';
import { systemClock } from '@/lib/clock';
import { fetchBoiRate } from '@/services/prime/prime-rate';

/** This device's copy of the last rate fetched (`meta`: device-local, never synced or exported). */
const PRIME_KEY = 'primeRate';

function isStoredPrime(value: unknown): value is StoredPrime {
  if (typeof value !== 'object' || value === null) return false;
  const { boiRate, checkedAt } = value as Record<string, unknown>;
  return typeof boiRate === 'string' && typeof checkedAt === 'string';
}

async function readStored(): Promise<StoredPrime | undefined> {
  const value = (await db.meta.get(PRIME_KEY))?.value;
  return isStoredPrime(value) ? value : undefined;
}

/**
 * Ask for the rate again if the copy here is stale (`primeIsStale`).
 *
 * Quiet on failure: offline, the relay down, a build without one - the last
 * rate fetched stays on screen with the time it was fetched, which is the
 * honest thing to show.
 */
export async function refreshPrime(): Promise<void> {
  try {
    const stored = await readStored();
    if (!primeIsStale(stored, systemClock.nowMs(), systemClock.today())) return;
    const answer = await fetchBoiRate(AbortSignal.timeout(10_000));
    await db.meta.put({ key: PRIME_KEY, value: { ...answer, checkedAt: systemClock.nowIso() } });
  } catch {
    // Kept as it was.
  }
}

/**
 * Keep the rate current while the app is open: now, whenever the app comes
 * back into view or back online, and hourly. The relay caches for fifteen
 * minutes, so a Bank of Israel decision reaches an open app within the hour
 * and a reopened one at once.
 */
export function startPrimeWatcher(): () => void {
  const check = (): void => {
    void refreshPrime();
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') check();
  };
  check();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', check);
  const timer = setInterval(check, 60 * 60_000);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', check);
    clearInterval(timer);
  };
}

/** Prime as every screen shows it: the fetched rate, or this build's own until there is one. */
export function usePrime(): PrimeView {
  const stored = useLiveQuery(readStored, []);
  return primeView(stored);
}
