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
/** The last sweep ran on a stale prime, so froze nothing: the next fetch sweeps again to freeze. */
let freezeHeld = false;

/**
 * Re-price every long קרדיט that follows prime, at prime as it stands here.
 * A payment due is frozen only on a prime that is current (`primeIsStale`):
 * frozen is for good, and a device opened after weeks away holds a prime that
 * may have moved since. Until its fetch answers, plans are re-priced and wait.
 */
async function sweepAtPrime(): Promise<void> {
  try {
    const stored = await readStored();
    const fresh = !primeIsStale(stored, systemClock.nowMs(), systemClock.today());
    await sweepLongCredit(db, primeView(stored).primeRate, systemClock.today(), systemClock.nowIso(), {
      freeze: fresh,
    });
    freezeHeld = !fresh;
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
    // Prime moved, or a payment due waited for a current prime: long קרדיט plans are swept again.
    const moved = primeFrom(answer.boiRate) !== primeView(stored).primeRate;
    if (sweepAllowed && (moved || freezeHeld)) await sweepAtPrime();
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
