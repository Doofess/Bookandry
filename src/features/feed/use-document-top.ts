import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How far down the DOCUMENT an element starts, kept current.
 *
 * Not `offsetTop`: that counts from the nearest positioned ancestor, and the
 * feed's list sits inside the panel's sheet, which is `relative` so it can rise
 * over the panel's foot - `offsetTop` would say 60px for a list 450px down.
 *
 * Re-measured whenever the page changes size, not only on a window resize:
 * the panel above the list grows after the first measurement, when the
 * balance's skeleton resolves and when a narrower viewport wraps its pills.
 * Anything above the list that changes height changes the body's height, so
 * one observer on the body covers all of it. `key` re-runs it when the element
 * itself appears (the list is a skeleton until the webfonts load).
 */
export function useDocumentTop(ref: RefObject<HTMLElement | null>, key?: unknown): number {
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const measure = (): void => {
      const el = ref.current;
      // Same value, same state: React skips the re-render.
      if (el !== null) setTop(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();

    // A browser without it: fall back to the window's own resizes.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      observer.disconnect();
    };
  }, [ref, key]);

  return top;
}
