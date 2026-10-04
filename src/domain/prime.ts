import { isLocalDate } from '@/lib/dates';
import { addRates, normalizeAnnualRate } from '@/lib/money';
import type { IsoInstant, LocalDate } from '@/types/money';

/**
 * Israeli prime: the Bank of Israel's rate plus a fixed 1.5 points.
 *
 * The spread has been 1.5 since the banks agreed it in 2002; it is the Bank
 * of Israel's rate that moves, at its eight scheduled decisions a year (and
 * the odd unscheduled one). So the app keeps that rate, fetched, and derives
 * prime from it here - one rule, in one place.
 */
export const PRIME_SPREAD = '1.5';

/**
 * The Bank of Israel's rate as this build last knew it.
 *
 * Only for a device that has never managed to fetch the live one - a first
 * run offline - and always shown with its date, so it is never mistaken for
 * today's.
 */
export const BUILT_IN_BOI_RATE = { boiRate: '3.25', asOf: '2026-10-04' as LocalDate } as const;

/** What the relay answers, checked. */
export type BoiAnswer = { readonly boiRate: string; readonly nextDecision?: LocalDate };

/** As kept on this device. */
export type StoredPrime = BoiAnswer & { readonly checkedAt: IsoInstant };

export type PrimeView = {
  /** Prime itself: what a loan "at prime" is charged. */
  readonly primeRate: string;
  /** The Bank of Israel rate it is built on. */
  readonly boiRate: string;
  readonly nextDecision?: LocalDate;
  /** Live: fetched (when last checked). Built in: this build's own figure, from `asOf`. */
  readonly source:
    | { readonly kind: 'live'; readonly checkedAt: IsoInstant }
    | { readonly kind: 'built_in'; readonly asOf: LocalDate };
};

export function primeFrom(boiRate: string): string {
  return addRates(boiRate, PRIME_SPREAD);
}

/** The relay's answer, or undefined if it is not one this app believes. */
export function parseBoiAnswer(body: unknown): BoiAnswer | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { boiRate, nextDecision } = body as Record<string, unknown>;
  if (typeof boiRate !== 'string') return undefined;
  const rate = normalizeAnnualRate(boiRate);
  // A central bank rate of 50% is a broken feed, not a policy.
  if (rate === undefined || Number(rate) > 50) return undefined;
  return {
    boiRate: rate,
    ...(typeof nextDecision === 'string' && isLocalDate(nextDecision) ? { nextDecision } : {}),
  };
}

/** What every screen shows: the fetched rate when there is one, the built-in one otherwise. */
export function primeView(stored: StoredPrime | undefined): PrimeView {
  if (stored === undefined) {
    return {
      primeRate: primeFrom(BUILT_IN_BOI_RATE.boiRate),
      boiRate: BUILT_IN_BOI_RATE.boiRate,
      source: { kind: 'built_in', asOf: BUILT_IN_BOI_RATE.asOf },
    };
  }
  return {
    primeRate: primeFrom(stored.boiRate),
    boiRate: stored.boiRate,
    ...(stored.nextDecision === undefined ? {} : { nextDecision: stored.nextDecision }),
    source: { kind: 'live', checkedAt: stored.checkedAt },
  };
}

/** How long a fetched rate is trusted before it is asked for again. */
export const PRIME_RECHECK_MS = 60 * 60_000;

/**
 * Whether to ask again: never asked, asked over an hour ago, or a decision
 * has been due since - on decision day the old rate is the one thing that
 * must not linger.
 */
export function primeIsStale(stored: StoredPrime | undefined, nowMs: number, today: LocalDate): boolean {
  if (stored === undefined) return true;
  const checked = Date.parse(stored.checkedAt);
  if (!Number.isFinite(checked) || nowMs - checked >= PRIME_RECHECK_MS) return true;
  return (
    stored.nextDecision !== undefined &&
    stored.nextDecision <= today &&
    stored.checkedAt.slice(0, 10) < stored.nextDecision
  );
}
