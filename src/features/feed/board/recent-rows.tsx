import { useMemo } from 'react';

import type { FeedRow } from '@/domain/feed';
import type { Occurrence } from '@/types/domain';

import { DayHeader, TransactionRow, type RowContext } from '../feed-rows';
import { BOARD_ROWS, recentRows } from './list-mode';

/**
 * The board's newest rows under their days, laid out as the concept draws them
 * (no net totals, no avatars), not virtualised (eight of them). The round arrow
 * on the sheet opens the whole month.
 */
export function RecentRows({
  rows,
  context,
  total,
  onOpen,
  onMenu,
  onCategory,
  onProjected,
}: {
  readonly rows: readonly FeedRow[];
  readonly context: RowContext;
  /** Every row in the month, for each row's position (aria-setsize). */
  readonly total: number;
  readonly onOpen?: (occurrence: Occurrence) => void;
  readonly onMenu?: (occurrence: Occurrence, anchor: HTMLElement) => void;
  readonly onCategory?: (occurrence: Occurrence, anchor: HTMLElement) => void;
  readonly onProjected?: (occurrence: Occurrence, anchor: HTMLElement) => void;
}) {
  const shown = useMemo(() => recentRows(rows, BOARD_ROWS), [rows]);
  const flat = useMemo(() => ({ ...context, showProfile: false }), [context]);
  const positions = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of shown) if (row.kind === 'row') out.set(row.key, out.size + 1);
    return out;
  }, [shown]);
  return (
    <div role="list" className="grid gap-1 [&>[role=listitem]:last-child]:border-be-0">
      {shown.map((row) => {
        if (row.kind === 'day') {
          return (
            <DayHeader
              key={row.key}
              date={row.date}
              netMinor={row.netMinor}
              isToday={row.isToday}
              currency={context.currency}
              bare
            />
          );
        }
        if (row.kind !== 'row') return null;
        return (
          <TransactionRow
            key={row.key}
            occurrence={row.occurrence}
            context={flat}
            position={positions.get(row.key) ?? 0}
            setSize={total}
            onOpen={onOpen}
            onMenu={onMenu}
            onCategory={onCategory}
            onProjected={onProjected}
          />
        );
      })}
    </div>
  );
}
