import { z } from 'zod';

import { addMonthsClamped, compareLocal, isLocalDate, makeLocalDate, startOfMonth } from '@/lib/dates';
import { ALL_PROFILES } from '@/types/domain';
import type { Kind, LocalDate } from '@/types/money';

import { PROJECTION_HORIZON_MONTHS } from './occurrences';

/**
 * Feed filter state, parsed from and written back to the URL.
 *
 * The spec put filters "in Zustand and reflected in the URL", which is two
 * sources of truth for one value: either the store writes the URL and the URL
 * writes the store (a render loop), or one of them wins and the other silently
 * drifts, which is how a shared link opens on someone else's filters. The URL
 * is the store. Nothing mirrors it.
 *
 * Pure so the parsing is testable without a router, and so a hand-mangled query
 * string can be proven to degrade one field at a time rather than throwing
 * inside a route component where there is nothing to render instead.
 */

export const KINDS = ['all', 'income', 'expense'] as const;
export type KindFilter = (typeof KINDS)[number];

export type FeedFilters = {
  readonly profileId: string;
  /** The month cursor, normalised to the first of the month. */
  readonly month: LocalDate;
  readonly kind: KindFilter;
  readonly categoryIds: readonly string[];
  readonly paymentMethodIds: readonly string[];
  readonly query: string;
};

export type FilterDefaults = {
  readonly profileId: string;
  readonly today: LocalDate;
};

/** Short keys: these end up in every shared link and every browser history entry. */
export const PARAM = {
  profile: 'p',
  month: 'm',
  kind: 'k',
  categories: 'c',
  methods: 'pm',
  query: 'q',
} as const;

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * `YYYY-MM` rather than a full date.
 *
 * A month cursor that carries a day is a lie the moment the month changes
 * length, and `?m=2026-02-30` would have to be either rejected or silently
 * moved - neither of which a user who typed a URL can see happening.
 */
const monthSchema = z.string().transform((value, ctx): LocalDate => {
  const match = MONTH_PATTERN.exec(value);
  if (!match) {
    ctx.addIssue({ code: 'custom', message: 'Expected YYYY-MM' });
    return z.NEVER;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1000 || year > 9998) {
    ctx.addIssue({ code: 'custom', message: 'Month out of range' });
    return z.NEVER;
  }
  return makeLocalDate(year, month, 1);
});

const idListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part.length <= 64),
  )
  // Order must not matter, or two links to the same view differ.
  .transform((ids) => [...new Set(ids)].sort());

const kindSchema = z.enum(KINDS);

/** Bounded, because it goes straight into a substring match over every row. */
const querySchema = z.string().trim().max(60);

/**
 * Parse, never throw.
 *
 * Every field falls back independently: `?k=purple&m=2026-09` keeps September
 * and drops only the bad kind. A schema that rejected the whole object would
 * throw away the half the user typed correctly.
 */
export function parseFeedFilters(params: URLSearchParams, defaults: FilterDefaults): FeedFilters {
  const raw = (key: string): string | undefined => params.get(key) ?? undefined;

  const profile = raw(PARAM.profile);
  const profileId =
    profile !== undefined && profile.length > 0 && profile.length <= 64 ? profile : defaults.profileId;

  return {
    profileId,
    month: clampMonthToHorizon(
      monthSchema.catch(startOfMonth(defaults.today)).parse(raw(PARAM.month) ?? ''),
      defaults.today,
    ),
    kind: kindSchema.catch('all').parse(raw(PARAM.kind) ?? ''),
    categoryIds: idListSchema.catch([]).parse(raw(PARAM.categories) ?? ''),
    paymentMethodIds: idListSchema.catch([]).parse(raw(PARAM.methods) ?? ''),
    query: querySchema.catch('').parse(raw(PARAM.query) ?? ''),
  };
}

export function monthParam(month: LocalDate): string {
  return month.slice(0, 7);
}

/**
 * Serialise, omitting everything at its default.
 *
 * A URL carrying `?p=all&k=all&c=&pm=&q=` for the untouched view is noise in
 * every share and every history entry, and makes "are these two views the same"
 * a string comparison that fails.
 */
export function feedFiltersToParams(filters: FeedFilters, defaults: FilterDefaults): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.profileId !== defaults.profileId) params.set(PARAM.profile, filters.profileId);
  if (filters.month !== startOfMonth(defaults.today)) params.set(PARAM.month, monthParam(filters.month));
  if (filters.kind !== 'all') params.set(PARAM.kind, filters.kind);
  if (filters.categoryIds.length > 0) params.set(PARAM.categories, [...filters.categoryIds].sort().join(','));
  if (filters.paymentMethodIds.length > 0) {
    params.set(PARAM.methods, [...filters.paymentMethodIds].sort().join(','));
  }
  if (filters.query.length > 0) params.set(PARAM.query, filters.query);

  return params;
}

export function defaultFilters(defaults: FilterDefaults): FeedFilters {
  return {
    profileId: defaults.profileId,
    month: startOfMonth(defaults.today),
    kind: 'all',
    categoryIds: [],
    paymentMethodIds: [],
    query: '',
  };
}

/** Anything the user can clear with one tap, ignoring profile and month. */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return (
    filters.kind !== 'all' ||
    filters.categoryIds.length > 0 ||
    filters.paymentMethodIds.length > 0 ||
    filters.query.length > 0
  );
}

/** Is this the merged, all-profiles view? */
export function isAllProfiles(profileId: string): boolean {
  return profileId === ALL_PROFILES;
}

/** Kind filter as the predicate the feed actually applies. */
export function matchesKind(filter: KindFilter, kind: Kind): boolean {
  return filter === 'all' || filter === kind;
}

/** Guard for a hand-typed `?m=`, used by the month cursor's arrows. */
export function isMonthStart(date: string): boolean {
  return isLocalDate(date) && date.endsWith('-01');
}

/**
 * The month cursor is bounded, in both directions and for different reasons.
 *
 * Forward: `PROJECTION_HORIZON_MONTHS`. Past it there is nothing to show -
 * projections stop - so a cursor that kept going would present an empty month
 * as if it were a real one.
 *
 * Backward: a programming-error guard, not a product limit. `expandOccurrences`
 * THROWS above a 1200-month window, so a hand-typed `?m=1000-01` would crash the
 * route rather than showing an empty feed.
 */
export const MONTHS_FORWARD = PROJECTION_HORIZON_MONTHS;
export const MONTHS_BACK = 1200;

export function clampMonthToHorizon(month: LocalDate, today: LocalDate): LocalDate {
  const earliest = startOfMonth(addMonthsClamped(startOfMonth(today), -MONTHS_BACK, 1));
  const latest = startOfMonth(addMonthsClamped(startOfMonth(today), MONTHS_FORWARD, 1));
  if (compareLocal(month, earliest) < 0) return earliest;
  if (compareLocal(month, latest) > 0) return latest;
  return month;
}

/** Whether a month sits at the forward edge, so the feed can say the future stops here. */
export function isAtHorizon(month: LocalDate, today: LocalDate): boolean {
  return compareLocal(month, startOfMonth(addMonthsClamped(startOfMonth(today), MONTHS_FORWARD, 1))) >= 0;
}
