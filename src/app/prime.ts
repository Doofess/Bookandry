import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { sweepLongCredit } from '@/db/long-credit-sweep';
import { primeFrom, primeIsStale, primeView, type PrimeView, type StoredPrime } from '@/domain/prime';
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

/** Whether this start's data is settled enough to re-price plans by (see allowLongCreditSweep). */
let sweepAllowed = false;

/** Re-price every long קרדיט that follows prime, at prime as it stands here. */
async function sweepAtPrime(): Promise<void> {
  try {
    await sweepLongCredit(db, primeView(await readStored()).primeRate, systemClock.today());
  } catch {
    // Kept as it was; the next start, or the next change in prime, tries again.
  }
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
    // Prime moved: long קרדיט plans that follow it are re-priced.
    if (sweepAllowed && primeFrom(answer.boiRate) !== primeView(stored).primeRate) await sweepAtPrime();
  } catch {
    // Kept as it was.
  }
}

/**
 * Start re-pricing long קרדיט plans with prime, and do it once now.
 *
 * Called when this device's data is settled at start: at once on a device
 * with no account, and after the first sync has pulled on one with an
 * account - so a device that was offline when a plan's reset payment fell due
 * takes the values another device froze, rather than freezing its own on a
 * later prime. Until then, a change in prime waits; this run picks it up.
 */
export async function allowLongCreditSweep(): Promise<void> {
  if (sweepAllowed) return;
  sweepAllowed = true;
  await sweepAtPrime();
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
