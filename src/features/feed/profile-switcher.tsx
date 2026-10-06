import { cn } from 'cn';
import { ChevronDown, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAccount } from '@/app/account';
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
}: {
  profiles: readonly Profile[];
  active: string;
  onSelect: (profileId: string) => void;
  className?: string;
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
            'flex h-9 items-center gap-2 rounded-full border border-border bg-card ps-1.5 pe-3 text-sm font-medium shadow-xs transition',
            'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          {current === undefined ? (
            <Stack people={ordered} />
          ) : (
            <PersonAvatar person={current} size="sm" className="size-6 text-[10px]" />
          )}
          <span className="max-w-40 truncate">
            {current === undefined ? t('profile.all') : nameOf(current)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
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
function Stack({ people }: { readonly people: readonly Profile[] }) {
  return (
    <span className="flex -space-x-2 rtl:space-x-reverse">
      {people.slice(0, 3).map((p) => (
        <PersonAvatar key={p.id} person={p} size="sm" className="size-6 text-[10px] ring-2 ring-card" />
      ))}
    </span>
  );
}
