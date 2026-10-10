import { useTranslation } from 'react-i18next';
import { Toaster as Sonner } from 'sonner';

import { toastPosition } from '@/lib/rtl';

/**
 * The toast host.
 *
 * Sonner installed directly rather than through `shadcn add sonner`, which
 * drags in `next-themes` for a theme system this app does not use.
 *
 * Two things here are not defaults:
 *
 *  - THE CORNER IS COMPUTED. Sonner's `position` is physical: `bottom-right`
 *    stays bottom-right under `dir="rtl"`, so in Hebrew the toast would appear
 *    on the side the eye leaves rather than the side it starts from.
 *  - THE OFFSET CLEARS THE FAB AND THE TAB BAR. §8 says to move the toast
 *    rather than the button: the FAB is the primary action and a toast that
 *    covers it blocks the thing people came to do. `--tab-bar-h` of tab bar, plus
 *    the Add pill's 3rem and its gap, plus the home-indicator inset.
 */
export function Toaster() {
  const { i18n } = useTranslation();
  const dir = i18n.dir();

  return (
    <Sonner
      dir={dir}
      position={toastPosition(dir)}
      mobileOffset={{ bottom: 'calc(var(--tab-bar-h) + 4.5rem + env(safe-area-inset-bottom, 0px))' }}
      offset={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      // The default 4s is short for a sentence plus a decision. Six matches the
      // undo window the plan specifies, and the row survives for 24 hours
      // regardless - the toast is a convenience, not the recovery story.
      duration={6000}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border border-border bg-popover text-popover-foreground shadow-lg',
          actionButton: 'rounded-lg bg-primary text-primary-foreground',
        },
      }}
    />
  );
}
