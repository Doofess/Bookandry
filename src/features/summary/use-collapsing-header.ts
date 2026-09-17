import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Collapse the summary header once it has scrolled away.
 *
 * Two summary cards, a month cursor, a profile row and a filter bar eat roughly
 * 40% of a 375x667 viewport before a single transaction is visible. Collapsing
 * gives that back without taking the balance away - the figure people open the
 * app for.
 *
 * Deliberately NOT sticky while expanded: a sticky element pins at its natural
 * height, so the full cards would follow the user down the page and cover the
 * rows they were scrolling to. It becomes sticky only once collapsed, and the
 * threshold is the header's own measured height, so the bar appears exactly as
 * the cards leave rather than jumping in early over content.
 *
 * The scroll source is the WINDOW, which is what the feed virtualizer measures
 * against too - a second scroll container here would put the two one frame out
 * of step at every boundary.
 */

/** Small enough to be one line, tall enough for a 44px tap target plus padding. */
export const COLLAPSED_HEIGHT = 48;

/**
 * Hysteresis, so a header sitting exactly on the threshold does not flap.
 *
 * Without it, the layout shift of collapsing can scroll the page back under the
 * threshold, which expands it, which shifts it again - a loop that reads as a
 * flicker and cannot be scrolled out of.
 */
const HYSTERESIS = 24;

export type CollapsingHeader = {
  readonly collapsed: boolean;
  /**
   * Attach to the expanded header, so its real height sets the threshold.
   *
   * A CALLBACK ref rather than a ref object: the React Compiler's lint treats
   * any object carrying a ref as a ref, so returning `{ collapsed, ref }` makes
   * reading `collapsed` during render an error. A function has no such
   * problem, and the ref object stays private to the hook.
   */
  readonly measure: (element: HTMLElement | null) => void;
};

export function useCollapsingHeader(): CollapsingHeader {
  const elementRef = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  /*
   * The current state, mirrored into a ref.
   *
   * The scroll listener needs to read it without being in the effect's deps:
   * re-subscribing on every toggle would tear down and rebuild the listener in
   * the middle of a scroll, which drops frames exactly when it is being used.
   */
  const collapsedRef = useRef(false);
  const heightRef = useRef(0);

  useEffect(() => {
    let frame: number | undefined;

    const onScroll = (): void => {
      if (frame !== undefined) return;

      frame = requestAnimationFrame(() => {
        frame = undefined;

        // Only measurable while expanded, and it genuinely changes: the profile
        // row appears with a second profile, filter chips wrap, and Hebrew
        // wraps at different widths than English.
        if (!collapsedRef.current) {
          heightRef.current = elementRef.current?.offsetHeight ?? heightRef.current;
        }

        const threshold = Math.max(heightRef.current, COLLAPSED_HEIGHT);
        const next = collapsedRef.current
          ? window.scrollY > threshold - HYSTERESIS
          : window.scrollY > threshold;

        if (next === collapsedRef.current) return;
        collapsedRef.current = next;
        setCollapsed(next);
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const measure = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  return { collapsed, measure };
}
