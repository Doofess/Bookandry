import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { activeHeaderIndex, headerIndices, type FeedRow } from '@/domain/feed';
import { formatLocalDate } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { DayHeader, TransactionRow, type RowContext } from './feed-rows';

/** Estimates only; every element is measured once it renders. */
const DAY_HEADER_HEIGHT = 36;
const ROW_HEIGHT = 64;
const HORIZON_HEIGHT = 44;

/**
 * The virtualised feed.
 *
 * The plan calls this the riskiest part of the build, and the reason is that
 * there is NO official example of a window virtualizer with sticky headers -
 * TanStack's sticky demo uses the element virtualizer, where `scrollMargin`
 * does not exist. Combining them means two things that are easy to get subtly
 * wrong:
 *
 *  1. `scrollMargin` must be SUBTRACTED from `virtualRow.start` for absolutely
 *     positioned rows, because the window virtualizer measures from the top of
 *     the document and the container starts part way down it.
 *  2. The sticky header must NOT apply that transform at all. It is positioned
 *     by `position: sticky` relative to the viewport, so giving it a transform
 *     both double-counts the offset AND creates a containing block that breaks
 *     the stickiness it was supposed to have.
 *
 * Accepted limitations, decided rather than discovered:
 *  - Sticky headers SNAP; they do not push each other up. Only one item can be
 *    pinned at a time, because only one item is taken out of the absolute flow.
 *  - No `scale` in any row animation: `getBoundingClientRect()` returns the
 *    SCALED box, so a scaling row reports a wrong height and the virtualizer
 *    re-measures the rest of the list against it.
 */
export function VirtualFeed({
  rows,
  context,
  onOpen,
  onMenu,
}: {
  rows: readonly FeedRow[];
  context: RowContext;
  onOpen?: (occurrence: Occurrence) => void;
  onMenu?: (occurrence: Occurrence) => void;
}) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const fontsReady = useFontsReady();

  useLayoutEffect(() => {
    // The distance from the top of the document to the list. Re-read on resize
    // because the summary header above it changes height when it wraps.
    const measure = (): void => {
      setScrollMargin(containerRef.current?.offsetTop ?? 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [rows.length]);

  const headers = useMemo(() => headerIndices(rows), [rows]);

  /**
   * aria-posinset for each row, precomputed.
   *
   * A virtualised list renders a handful of elements out of hundreds, so
   * without setsize/posinset a screen reader announces "item 3 of 8" for a row
   * that is actually the 214th of 600. Counting rows before each index at
   * render time would be O(n) per row and O(n squared) across a scroll.
   */
  const { positions, rowCount } = useMemo(() => {
    const result: number[] = new Array<number>(rows.length).fill(0);
    let seen = 0;
    rows.forEach((row, index) => {
      if (row.kind === 'row') {
        seen += 1;
        result[index] = seen;
      }
    });
    return { positions: result, rowCount: seen };
  }, [rows]);
  const rangeExtractor = useCallback(
    (range: Range) => {
      // The active header must stay MOUNTED even when scrolled past, or the
      // pinned element unmounts mid-scroll and the heading vanishes.
      const active = activeHeaderIndex(headers, range.startIndex);
      const indexes = new Set(defaultRangeExtractor(range));
      if (active !== undefined) indexes.add(active);
      return [...indexes].sort((a, b) => a - b);
    },
    [headers],
  );

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.kind === 'day') return DAY_HEADER_HEIGHT;
      if (row?.kind === 'horizon') return HORIZON_HEIGHT;
      return ROW_HEIGHT;
    },
    overscan: 8,
    scrollMargin,
    // Keyed by the occurrence, so a row keeps its measurement across a re-sort.
    getItemKey: (index) => rows[index]?.key ?? index,
    rangeExtractor,
  });

  if (!fontsReady) {
    // Every row would re-measure on the Inter/Heebo swap otherwise, which
    // reflows the entire list one frame after it first paints.
    return (
      <div className="space-y-2 py-2" aria-busy="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  /*
   * Derived from the rendered range, not stashed in a ref by the extractor.
   *
   * A ref written inside the extractor and read during render is a render-phase
   * ref access: React can re-render without re-running the extractor, and the
   * pinned header would then be one scroll position out of date. Because the
   * extractor PREPENDS the active header, `items[0]` is that header whenever
   * one is pinned - so the same answer falls out of the range itself.
   */
  const stickyIndex = activeHeaderIndex(headers, items[0]?.index ?? 0);

  return (
    <div ref={containerRef} className="relative" style={{ height: virtualizer.getTotalSize() }} role="list">
      {items.map((item) => {
        const row = rows[item.index];
        if (row === undefined) return null;

        const isSticky = stickyIndex === item.index && row.kind === 'day';

        return (
          <div
            key={item.key}
            // measureElement resolves elements by this ATTRIBUTE, not by the
            // React key - the two are independent, and omitting it silently
            // disables dynamic measurement.
            data-index={item.index}
            ref={virtualizer.measureElement}
            className={isSticky ? 'z-10' : undefined}
            style={
              isSticky
                ? // No transform: `sticky` positions this against the viewport,
                  // and a transform would both double-count scrollMargin and
                  // create a containing block that cancels the stickiness.
                  { position: 'sticky', top: 'var(--feed-sticky-top, 0px)', insetInline: 0 }
                : {
                    position: 'absolute',
                    top: 0,
                    insetInline: 0,
                    transform: `translateY(${String(item.start - scrollMargin)}px)`,
                  }
            }
          >
            {renderRow(row, {
              context,
              onOpen,
              onMenu,
              position: positions[item.index] ?? 1,
              setSize: rowCount,
              horizonLabel: (date) =>
                t('feed.horizon', {
                  date: formatLocalDate(date, i18n.language, { month: 'long', year: 'numeric' }),
                }),
            })}
          </div>
        );
      })}
    </div>
  );
}

type RenderOptions = {
  readonly context: RowContext;
  readonly onOpen?: (occurrence: Occurrence) => void;
  readonly onMenu?: (occurrence: Occurrence) => void;
  readonly position: number;
  readonly setSize: number;
  readonly horizonLabel: (date: LocalDate) => string;
};

function renderRow(row: FeedRow, options: RenderOptions) {
  if (row.kind === 'day') {
    return (
      <DayHeader
        date={row.date}
        netMinor={row.netMinor}
        isToday={row.isToday}
        currency={options.context.currency}
      />
    );
  }

  if (row.kind === 'horizon') {
    return (
      <p className="px-3 py-3 text-center text-xs text-muted-foreground">
        {options.horizonLabel(row.through)}
      </p>
    );
  }

  return (
    <TransactionRow
      occurrence={row.occurrence}
      context={options.context}
      position={options.position}
      setSize={options.setSize}
      onOpen={options.onOpen}
      onMenu={options.onMenu}
    />
  );
}

/**
 * Gate the first render on the webfonts.
 *
 * Inter and Heebo swap in after first paint, and every row changes height when
 * they do. Without this the virtualizer measures the fallback font, paints, then
 * re-measures the entire list one frame later - visible as a jump, and on a long
 * list as a jump that moves the row under the user's finger.
 */
function useFontsReady(): boolean {
  // jsdom has no FontFaceSet, and neither does a browser with the API
  // disabled; both start ready rather than waiting forever. Decided in the
  // INITIALISER, not in an effect: setting it there would paint a skeleton for
  // one frame on every platform that has no font API at all.
  const [ready, setReady] = useState(() => !hasFontsApi() || document.fonts.status === 'loaded');

  useEffect(() => {
    if (!hasFontsApi()) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}

function hasFontsApi(): boolean {
  // The lib types declare `document.fonts` as always present, but jsdom and
  // older Safari disagree at runtime - hence `in`, which asks the object rather
  // than the type.
  return typeof document !== 'undefined' && 'fonts' in document;
}
