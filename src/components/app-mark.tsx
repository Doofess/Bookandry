import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

/**
 * The in-app mark (§3, decision 37): a 46px circle with a 2px outline in the
 * text colour and a Karantina "B" (28px, the display face's floor), beside
 * "Bookandry" in Plex 600. It replaces the sapphire disc in the rail, the
 * screen head and the front door; the installed icon and the favicon keep the
 * disc (`logo.tsx`).
 */
export function AppMark({
  withName = true,
  className,
}: {
  readonly withName?: boolean;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span data-slot="app-mark" className={cn('inline-flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className="grid size-11.5 shrink-0 place-items-center rounded-full border-2 border-current font-display text-[1.75rem] leading-none"
      >
        B
      </span>
      <span className={withName ? 'text-[1.1875rem] font-semibold' : 'sr-only'}>{t('app.name')}</span>
    </span>
  );
}
