import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatars/avatar';
import { ALL_PROFILES, type Profile } from '@/types/domain';

/**
 * The profile switcher.
 *
 * Hidden entirely when there is one profile. A segmented control with a single
 * segment is not a choice; it is a control that teaches the user nothing and
 * takes a row of vertical space on a 375px screen to do it. The "All" chip goes
 * with it, because merging one profile is the same view under a second name.
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
  if (profiles.length < 2) return null;

  const options = [
    { id: ALL_PROFILES, name: t('profile.all'), profile: undefined },
    ...profiles.map((p) => ({ id: p.id, name: p.name, profile: p })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t('profile.switcher')}
      className={cn('-mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)}
    >
      {options.map((option) => {
        const selected = option.id === active;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onSelect(option.id);
            }}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              selected
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {option.profile === undefined ? null : (
              <Avatar
                avatar={option.profile.avatar}
                color={option.profile.color}
                size="sm"
                className="size-5"
              />
            )}
            <span className="max-w-32 truncate">{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}
