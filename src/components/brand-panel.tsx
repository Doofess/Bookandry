import { cn } from 'cn';
import type { ReactNode } from 'react';

import { Engraving } from './engraving';

/**
 * The front door's outlined pill, for a ghost `Button` on the deep panel:
 * the theme and language switches there, and the month, profile and prime
 * pills on the feed's panel. 44px high on a phone, 36px from `sm`.
 *
 * The `white/*` alpha utilities are the front door's pill vocabulary, used on
 * the deep panel only; they are not a bypass of the colour tokens.
 *
 * The ghost variant's own hover and expanded fills are muted greys meant for
 * a white page; on the panel they are overridden in both themes, including
 * the `dark:hover:` one, which `cn` does not merge with a plain `hover:`.
 */
export const panelPill =
  'h-auto min-h-11 gap-2 rounded-full border-white/35 px-3.5 text-sm text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 aria-expanded:bg-white/15 aria-expanded:text-brand-deep-foreground focus-visible:border-white/60 focus-visible:ring-white/50 sm:min-h-9';

type BrandPanelProps = {
  readonly children: ReactNode;
  readonly className?: string;
  /** 'compact': a screen's panel. 'bands': the desktop rail. */
  readonly engraving?: 'compact' | 'bands';
};

/**
 * The front door's engraved banknote panel, carried into the app: the deep
 * sapphire block with the guilloche behind white text. The engraving is
 * mirrored for right-to-left, as on the front door.
 */
export function BrandPanel({ children, className, engraving = 'compact' }: BrandPanelProps) {
  return (
    <div
      data-slot="brand-panel"
      className={cn('relative isolate overflow-hidden bg-brand-deep text-brand-deep-foreground', className)}
    >
      <Engraving
        variant={engraving}
        className="absolute inset-0 -z-10 size-full text-brand-vivid/45 rtl:-scale-x-100"
      />
      {children}
    </div>
  );
}

/** The screen below a panel, rising over its foot as the sign-in form does. */
export function PanelSheet({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-slot="panel-sheet" className={cn('relative -mt-6 rounded-t-3xl bg-background', className)}>
      {children}
    </div>
  );
}
