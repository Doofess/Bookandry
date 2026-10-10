/**
 * The front door's outlined pill, for a ghost `Button` on a dark surface: the
 * theme and language switches on the front door's engraved panel, and the
 * month, profile and prime pills on the feed's and Cash's ink hero sheet
 * (`HeroSheet`, src/app/screen-head.tsx). 44px high on a phone, 36px from `sm`.
 *
 * The `white/*` alpha utilities are that dark surface's pill vocabulary; they
 * are not a bypass of the colour tokens. The ghost variant's own hover and
 * expanded fills are for a light page, so they are overridden in both themes,
 * including the `dark:hover:` one, which `cn` does not merge with `hover:`.
 */
export const panelPill =
  'h-auto min-h-11 gap-2 rounded-full border-white/35 px-3.5 text-sm text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 aria-expanded:bg-white/15 aria-expanded:text-brand-deep-foreground focus-visible:border-white/60 focus-visible:ring-white/50 sm:min-h-9';

/**
 * `panelPill`'s round sibling, for a ghost icon `Button` on the same surfaces:
 * the month pill's ‹ and › arrows. 44px on a phone, 36px from `sm`.
 */
export const panelIconButton =
  'size-11 rounded-full text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 focus-visible:border-white/60 focus-visible:ring-white/50 sm:size-9';
