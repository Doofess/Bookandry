import { cn } from 'cn';
import { ChevronDown, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAccount } from '@/app/account';
import { panelPill } from '@/components/brand-panel';
import { PersonAvatar } from '@/components/person-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALL_PROFILES, type Profile } from '@/types/domain';

/**
 * Whose money a screen shows: everyone's, this account's own, or one other
 * person's - a small dropdown, not a row of chips, so it takes one line
 * however many people the household has.
 *
 * Hidden entirely with one person: a choice of one is not a choice.
 */
export function ProfileSwitcher({
  profiles,
  active,
  onSelect,
  className,
  tone = 'card',
}: {
  profiles: readonly Profile[];
  active: string;
  onSelect: (profileId: string) => void;
  className?: string;
  /** 'panel': an outlined pill on the feed's sapphire panel. */
  tone?: 'card' | 'panel';
}) {
  const { t } = useTranslation();
  const view = useAccount();
  const me = view.status === 'signed_in' ? view.user.id : undefined;
  if (profiles.length < 2) return null;

  // This account's own person first, as "Mine"; then everyone else by name.
  const ordered = [...profiles.filter((p) => p.id === me), ...profiles.filter((p) => p.id !== me)];
  const nameOf = (p: Profile): string => (p.id === me ? t('profile.mine') : p.name);
  const current = profiles.find((p) => p.id === active);

  return (
    <div className={cn('flex', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${t('profile.switcher')}: ${current === undefined ? t('profile.all') : nameOf(current)}`}
          className={cn(
            'flex items-center gap-2 rounded-full border text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none',
            tone === 'panel'
              ? cn(panelPill, 'ps-1.5 pe-3')
              : 'h-9 border-border bg-card ps-1.5 pe-3 shadow-xs hover:bg-muted focus-visible:ring-ring',
          )}
        >
          {current === undefined ? (
            <Stack people={ordered} tone={tone} />
          ) : (
            <PersonAvatar person={current} size="sm" className="size-6 text-[10px]" />
          )}
          {/* On a phone's panel only the faces show, so it shares a line with the
              month; the name is still the trigger's accessible name. */}
          <span className={cn('max-w-40 truncate', tone === 'panel' ? 'max-sm:sr-only' : undefined)}>
            {current === undefined ? t('profile.all') : nameOf(current)}
          </span>
          <ChevronDown
            className={cn(
              'size-4',
              tone === 'panel' ? 'text-brand-deep-foreground/80' : 'text-muted-foreground',
            )}
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-56 p-1">
          <DropdownMenuRadioGroup
            value={current === undefined ? ALL_PROFILES : current.id}
            onValueChange={(value: string) => {
              onSelect(value);
            }}
          >
            <DropdownMenuRadioItem value={ALL_PROFILES} className="gap-2.5 py-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                <Users className="size-3.5" aria-hidden="true" />
              </span>
              {t('profile.all')}
            </DropdownMenuRadioItem>
            {ordered.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className="gap-2.5 py-2">
                <PersonAvatar person={p} size="sm" className="size-6 text-[10px]" />
                <span className="truncate">{nameOf(p)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Everyone, as overlapping pictures: up to three, the way a shared account looks. */
function Stack({ people, tone }: { readonly people: readonly Profile[]; readonly tone: 'card' | 'panel' }) {
  return (
    <span className="flex -space-x-2 rtl:space-x-reverse">
      {people.slice(0, 3).map((p) => (
        <PersonAvatar
          key={p.id}
          person={p}
          size="sm"
          className={cn('size-6 text-[10px] ring-2', tone === 'panel' ? 'ring-brand-deep' : 'ring-card')}
        />
      ))}
    </span>
  );
}
