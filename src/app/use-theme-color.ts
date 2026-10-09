import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { setThemeColor } from '@/i18n/boot';
import { cssColorToHex } from '@/lib/color';

/**
 * The colour at the top of the screen right now: the first element up from
 * the top centre with a background of its own, else the page.
 */
export function topColor(): string | undefined {
  const start =
    typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(window.innerWidth / 2, 1)
      : null;
  for (let el: Element | null = start; el !== null; el = el.parentElement) {
    const color = cssColorToHex(getComputedStyle(el).backgroundColor);
    if (color !== undefined) return color;
  }
  return cssColorToHex(getComputedStyle(document.body).backgroundColor);
}

/**
 * The phone's status bar follows the top of the current screen (§3): the
 * paper, or the sheet at the top if one reaches it. Re-read after every route
 * change and every theme change (the `dark` class on <html>), a frame later,
 * once the new screen has painted. applyTheme() and the boot script set the
 * paper first, so the bar is never wrong for long.
 */
export function useThemeColor(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const apply = () => {
      const color = topColor();
      if (color !== undefined) setThemeColor(color);
    };
    const frame = requestAnimationFrame(apply);
    const observer = new MutationObserver(() => {
      requestAnimationFrame(apply);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);
}
