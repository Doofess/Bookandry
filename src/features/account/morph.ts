import { flushSync } from 'react-dom';

/**
 * Changes the sign-in form from one step to another as one form changing
 * shape, not a page swapped for another: the browser's view transitions
 * carry each part the two steps share (named with `view-transition-name`,
 * see account-sheet.tsx) from where it was to where it lands, and fade what
 * only one of them has. Timing lives in index.css.
 *
 * `flushSync`, because the browser photographs the page before and after
 * the callback: React must have rendered the new step by the time it returns.
 *
 * An instant change where the browser has no view transitions, or the person
 * asked for less motion.
 */
export function morph(update: () => void): void {
  if (!('startViewTransition' in document) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  document.startViewTransition(() => {
    flushSync(update);
  });
}
