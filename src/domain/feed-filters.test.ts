import { describe, expect, it } from 'vitest';

import {
  clampMonthToHorizon,
  defaultFilters,
  feedFiltersToParams,
  hasActiveFilters,
  isAllProfiles,
  isAtHorizon,
  isMonthStart,
  matchesKind,
  monthParam,
  parseFeedFilters,
  PARAM,
  type FeedFilters,
} from './feed-filters';
import { d } from './test-factories';

const DEFAULTS = { profileId: 'all', today: d('2026-09-15') };
const parse = (search: string): FeedFilters => parseFeedFilters(new URLSearchParams(search), DEFAULTS);

describe('parseFeedFilters', () => {
  it('falls back to the defaults on an empty query string', () => {
    expect(parse('')).toEqual(defaultFilters(DEFAULTS));
    expect(parse('').month).toBe('2026-09-01');
  });

  it('reads every field', () => {
    expect(parse('?p=p1&m=2026-03&k=expense&c=cat.rent,cat.groceries&pm=m1&q=  pizza  ')).toEqual({
      profileId: 'p1',
      month: '2026-03-01',
      kind: 'expense',
      categoryIds: ['cat.groceries', 'cat.rent'],
      paymentMethodIds: ['m1'],
      query: 'pizza',
    });
  });

  it('degrades one field at a time', () => {
    // A hand-mangled kind must not throw away the month the user typed
    // correctly - and must not throw at all, inside a route component that has
    // nothing else to render.
    const filters = parse('?k=purple&m=2026-03&q=coffee');
    expect(filters.kind).toBe('all');
    expect(filters.month).toBe('2026-03-01');
    expect(filters.query).toBe('coffee');
  });

  it.each([
    ['?m=2026-13', 'month out of range'],
    ['?m=2026-00', 'month zero'],
    ['?m=nonsense', 'not a month'],
    ['?m=2026-09-15', 'a full date, not a month'],
    ['?m=', 'empty'],
  ])('ignores a bad month (%s: %s)', (search) => {
    expect(parse(search).month).toBe('2026-09-01');
  });

  it('normalises a month to its first day', () => {
    expect(parse('?m=2026-02').month).toBe('2026-02-01');
    expect(isMonthStart(parse('?m=2026-02').month)).toBe(true);
  });

  it('deduplicates and sorts id lists, so two links to one view match', () => {
    expect(parse('?c=b,a,b, ,a').categoryIds).toEqual(['a', 'b']);
  });

  it('drops absurd ids rather than passing them to a query', () => {
    expect(parse(`?c=${'x'.repeat(65)},ok`).categoryIds).toEqual(['ok']);
    expect(parse(`?p=${'x'.repeat(65)}`).profileId).toBe('all');
  });

  it('bounds the search text', () => {
    expect(parse(`?q=${'x'.repeat(61)}`).query).toBe('');
    expect(parse(`?q=${'x'.repeat(60)}`).query).toHaveLength(60);
  });
});

describe('feedFiltersToParams', () => {
  it('writes nothing for the untouched view', () => {
    expect(feedFiltersToParams(defaultFilters(DEFAULTS), DEFAULTS).toString()).toBe('');
  });

  it('round-trips every field', () => {
    const filters: FeedFilters = {
      profileId: 'p1',
      month: d('2026-03-01'),
      kind: 'income',
      categoryIds: ['cat.salary'],
      paymentMethodIds: ['m1', 'm2'],
      query: 'bonus',
    };
    expect(parseFeedFilters(feedFiltersToParams(filters, DEFAULTS), DEFAULTS)).toEqual(filters);
  });

  it('omits the month when it is the current one', () => {
    const filters = { ...defaultFilters(DEFAULTS), kind: 'expense' as const };
    const params = feedFiltersToParams(filters, DEFAULTS);
    expect(params.has(PARAM.month)).toBe(false);
    expect(params.get(PARAM.kind)).toBe('expense');
  });

  it('writes the month as YYYY-MM', () => {
    expect(monthParam(d('2026-03-01'))).toBe('2026-03');
  });
});

describe('predicates', () => {
  it('reports only the filters a Clear button would clear', () => {
    expect(hasActiveFilters(defaultFilters(DEFAULTS))).toBe(false);
    // Changing profile or month is navigation, not filtering: offering to
    // "clear" them would take the user somewhere they did not ask to go.
    expect(hasActiveFilters({ ...defaultFilters(DEFAULTS), profileId: 'p1', month: d('2026-01-01') })).toBe(
      false,
    );
    expect(hasActiveFilters({ ...defaultFilters(DEFAULTS), query: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(DEFAULTS), kind: 'income' })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(DEFAULTS), categoryIds: ['a'] })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(DEFAULTS), paymentMethodIds: ['a'] })).toBe(true);
  });

  it('recognises the merged view', () => {
    expect(isAllProfiles('all')).toBe(true);
    expect(isAllProfiles('p1')).toBe(false);
  });

  it('applies the kind filter', () => {
    expect(matchesKind('all', 'income')).toBe(true);
    expect(matchesKind('income', 'income')).toBe(true);
    expect(matchesKind('income', 'expense')).toBe(false);
  });

  it('rejects a non-month-start date', () => {
    expect(isMonthStart('2026-09-15')).toBe(false);
    expect(isMonthStart('nope')).toBe(false);
  });
});

describe('month cursor bounds', () => {
  it('clamps forward to the projection horizon', () => {
    // Past the horizon there is nothing to show, so an unbounded cursor would
    // present an empty month as if it were a real one.
    expect(parse('?m=2099-01').month).toBe('2027-09-01');
    expect(clampMonthToHorizon(d('2030-01-01'), DEFAULTS.today)).toBe('2027-09-01');
  });

  it('clamps backward far enough to keep expansion from throwing', () => {
    // expandOccurrences THROWS above a 1200-month window, so ?m=1000-01 would
    // crash the route rather than show an empty feed.
    expect(parse('?m=1000-01').month).toBe('1926-09-01');
  });

  it('leaves an ordinary month alone', () => {
    expect(clampMonthToHorizon(d('2026-03-01'), DEFAULTS.today)).toBe('2026-03-01');
    expect(clampMonthToHorizon(d('2020-01-01'), DEFAULTS.today)).toBe('2020-01-01');
  });

  it('reports the forward edge', () => {
    expect(isAtHorizon(d('2027-09-01'), DEFAULTS.today)).toBe(true);
    expect(isAtHorizon(d('2027-08-01'), DEFAULTS.today)).toBe(false);
  });
});
