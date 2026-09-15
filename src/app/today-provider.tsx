import { useEffect, useState, type ReactNode } from 'react';

import { type Clock, systemClock } from '@/lib/clock';
import type { LocalDate } from '@/types/money';

import { TodayContext } from './app-context';

/**
 * Today, as a value that expires.
 *
 * `todayLocal()` is only true for the instant it was called, and a PWA is left
 * open overnight. A stale `today` is not cosmetic: `isProjected` is
 * `date > today`, so at 00:00 tomorrow's salary becomes real money that must
 * start counting toward the balance. Left stale, the balance is a day behind
 * and the "Today" header sits above yesterday's rows.
 *
 * Two triggers, because neither alone is enough: a timer set to the next local
 * midnight, and `visibilitychange` - background tabs have their timers throttled
 * or frozen outright, so a phone that was asleep wakes with a timer that never
 * fired.
 */
export function TodayProvider({ clock = systemClock, children }: { clock?: Clock; children: ReactNode }) {
  const [today, setToday] = useState<LocalDate>(() => clock.today());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = (): void => {
      setToday((previous) => {
        // Same string means same render: a new value every check would
        // re-render the entire tree for nothing.
        const next = clock.today();
        return next === previous ? previous : next;
      });
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(sync, clock.msUntilNextDay());
    };

    sync();

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clock]);

  return <TodayContext value={today}>{children}</TodayContext>;
}
