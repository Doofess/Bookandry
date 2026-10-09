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
 * Bottom-centre above the tab bar on a phone, bottom-inline-end from `lg`
 * where there is no tab bar. Both offsets add the safe-area inset.
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
        'h-12 px-5 text-base font-semibold shadow-lg shadow-brand-deep/30',
        'bg-brand-deep text-brand-deep-foreground dark:border dark:border-brand-vivid',
        'transition-transform duration-[90ms] ease-out hover:bg-brand-deep/90 active:scale-[0.96]',
        'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        // Phone: centred. `start-0 end-0` with `mx-auto` and a max-content
        // width centres a fixed element of any label length.
        'start-0 end-0 mx-auto w-max',
        'bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)]',
        // Desktop: inline-end, no tab bar to clear.
        'lg:start-auto lg:end-6 lg:bottom-6 lg:mx-0',
        className,
      )}
    >
      {/* Plus is non-directional: it must NOT carry rtl:rotate-180. */}
      <Plus className="size-5" strokeWidth={2.25} aria-hidden="true" />
      {t('addMenu.add')}
    </button>
  );
}
