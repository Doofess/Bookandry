import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSettings, useToday } from '@/app/app-context';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import {
  defaultFilters,
  feedFiltersToParams,
  parseFeedFilters,
  type FeedFilters,
  type FilterDefaults,
} from '@/domain/feed-filters';
import { systemClock } from '@/lib/clock';
import { addMonthsClamped, startOfMonth } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * Filter state, read from and written to the URL.
 *
 * The URL is the ONLY store. The spec had filters "in Zustand and reflected in
 * the URL", which is two sources of truth for one value: either each writes the
 * other (a render loop) or one wins silently, and a link someone shares opens
 * on the wrong view.
 *
 * `replace: true` throughout. Every tap on a filter chip or a month arrow would
 * otherwise push a history entry, and on Android the hardware back button then
 * walks backwards through twenty filter states instead of leaving the screen.
 */
export type FeedFilterApi = {
  readonly filters: FeedFilters;
  readonly defaults: FilterDefaults;
  readonly set: (patch: Partial<FeedFilters>) => void;
  readonly setMonth: (month: LocalDate) => void;
  readonly stepMonth: (delta: number) => void;
  readonly setProfile: (profileId: string) => void;
  readonly clear: () => void;
};

export function useFeedFilters(): FeedFilterApi {
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const today = useToday();

  // `activeProfileId` is a one-directional mirror INTO the url: the stored
  // value seeds the default, and the url overrides it from there.
  const defaults = useMemo<FilterDefaults>(
    () => ({ profileId: settings.activeProfileId, today }),
    [settings.activeProfileId, today],
  );

  const filters = useMemo(() => parseFeedFilters(params, defaults), [params, defaults]);

  const write = useCallback(
    (nextFilters: FeedFilters) => {
      setParams(feedFiltersToParams(nextFilters, defaults), { replace: true });
    },
    [setParams, defaults],
  );

  const set = useCallback(
    (patch: Partial<FeedFilters>) => {
      write({ ...filters, ...patch });
    },
    [filters, write],
  );

  const setMonth = useCallback(
    (month: LocalDate) => {
      write({ ...filters, month: startOfMonth(month) });
    },
    [filters, write],
  );

  const stepMonth = useCallback(
    (delta: number) => {
      // Anchored on day 1, so stepping never lands on a clamped day and
      // "31 January + 1 month" cannot quietly become February 28.
      write({ ...filters, month: addMonthsClamped(filters.month, delta, 1) });
    },
    [filters, write],
  );

  const setProfile = useCallback(
    (profileId: string) => {
      write({ ...filters, profileId });
      // Persisted too, so the choice survives a reload that has no query string.
      void writeSettings(db, { activeProfileId: profileId }, systemClock.nowIso());
    },
    [filters, write],
  );

  const clear = useCallback(() => {
    // Profile and month are navigation, not filtering: clearing them would take
    // the user somewhere they did not ask to go.
    write({ ...defaultFilters(defaults), profileId: filters.profileId, month: filters.month });
  }, [defaults, filters.profileId, filters.month, write]);

  return { filters, defaults, set, setMonth, stepMonth, setProfile, clear };
}
