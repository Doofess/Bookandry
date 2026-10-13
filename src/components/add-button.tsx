import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** A plain button's props: the pill is also the Add menu's trigger, which passes its handlers, ARIA state and ref straight through. */
export type AddButtonProps = React.ComponentProps<'button'>;

/**
 * The Add pill: a sapphire pill with a plus and the word, which says what the
 * button does where a bare plus only hinted. White on the deep sapphire is
 * 10.5:1. In dark mode a 1px vivid border draws its edge on the near-black
 * page, where the deep pill alone would sink in.
 *
 * Bottom-centre above the tab bar on a phone, with the safe-area inset. From
 * `lg` the rail's Add is on every screen, so this pill is not drawn (Cash's
 * own moves are on its board there).
 */
export function AddButton({ className, disabled = false, ...props }: AddButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      disabled={disabled}
      data-testid="add-button"
      {...props}
      className={cn(
        'fixed z-50 inline-flex items-center gap-2 rounded-full',
        'h-12 px-5 text-base font-semibold shadow-lg shadow-ink/20',
        // The solid sapphire pill (§9.6): the app's own action, filled with ink on a fine pointer's hover.
        'border-2 border-primary bg-primary text-primary-foreground',
        'transition-[background-color,border-color,color,scale] duration-(--dur-press) ease-fill',
        'motion-safe:active:scale-[0.96] hover-fine:border-ink hover-fine:bg-ink hover-fine:text-paper',
        'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        // Phone: centred. `start-0 end-0` with `mx-auto` and a max-content
        // width centres a fixed element of any label length.
        'start-0 end-0 mx-auto w-max',
        'bottom-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px)+1rem)]',
        // Desktop: the rail's Add is there; no second one floats over the board.
        'lg:hidden',
        className,
      )}
    >
      {/* Plus is non-directional: it must NOT carry rtl:rotate-180. */}
      <Plus className="size-5" strokeWidth={2.25} aria-hidden="true" />
      {t('addMenu.add')}
    </button>
  );
}
