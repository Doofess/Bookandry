import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * A plain button's props: the FAB is also a menu trigger (`AddMenu`), and the
 * menu passes its handlers, ARIA state and ref straight through to it.
 */
export type FabProps = React.ComponentProps<'button'>;

/**
 * The add-transaction button.
 *
 * A round vivid-green disc with a BLACK plus, measured at 7.64:1 - comfortably
 * past AA, and much better than white-on-green, which is 2.40:1 and fails.
 *
 * The rim is not decoration: the disc alone is 2.40:1 against a white page, so
 * without it the button's boundary is not perceivable (SC 1.4.11). On a dark
 * page the disc is already 8.30:1 and the rim is purely cosmetic.
 *
 * Positioning follows §5.1 and §8.2: bottom-centre above the tab bar on mobile,
 * bottom-inline-end from `lg` where there is no tab bar. Both offsets add the
 * safe-area inset, which only resolves to a real value because index.html sets
 * `viewport-fit=cover`.
 */
export function Fab({ className, disabled = false, ...props }: FabProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={t('action.addTransaction')}
      data-testid="fab"
      {...props}
      className={cn(
        'fixed z-50 grid place-items-center rounded-full',
        'size-12 shadow-lg',
        'bg-fab text-fab-foreground ring-2 ring-fab-rim',
        // 44x44 is the WCAG 2.2 target-size floor; 48 clears it.
        'transition-transform duration-[90ms] ease-out',
        'hover:brightness-[1.06] active:scale-[0.94]',
        'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        // Mobile: centred horizontally, clearing the tab bar and the home indicator.
        // NB: no `w-max` here - it would override size-12's width and render an
        // oval. `start-0 end-0` plus `mx-auto` centres a fixed-width element.
        // NOT `inset-inline-0`: that is not a Tailwind utility, emits no CSS at
        // all, and left the button sitting at its static position - which looked
        // deliberate enough to survive a screenshot review.
        'start-0 end-0 mx-auto',
        'bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)]',
        // Desktop: inline-end, no tab bar to clear.
        'lg:start-auto lg:end-6 lg:bottom-6 lg:mx-0',
        className,
      )}
    >
      {/* Plus is non-directional: it must NOT carry rtl:rotate-180. */}
      <Plus className="size-6" strokeWidth={2.75} aria-hidden="true" />
    </button>
  );
}
