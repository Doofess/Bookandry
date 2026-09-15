import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatars/avatar';
import { ALL_AVATARS } from '@/domain/avatars';
import { PROFILE_PALETTE } from '@/domain/palette';
import type { AvatarKey } from '@/types/domain';

/**
 * Colour and avatar pickers.
 *
 * In `components/` rather than beside the wizard: first run and the profile
 * editor ask exactly the same two questions, and a second copy is how the two
 * screens end up with different keyboard behaviour.
 *
 * Taken swatches use `aria-disabled`, NEVER `disabled`. A `disabled` button is
 * removed from the tab order entirely, so a keyboard user tabbing through the
 * palette silently skips the colours someone else has - and has no way to find
 * out why the one they wanted is missing. `aria-disabled` keeps it focusable
 * and announced, and the click handler declines.
 *
 * Each swatch carries its colour NAME, not its hex, and the selected one gets a
 * check mark: hue alone fails SC 1.4.1, and a hex code is not a name.
 */
export function ColorPicker({
  value,
  taken,
  onChange,
  labelledBy,
}: {
  value: string;
  taken: readonly string[];
  onChange: (hex: string) => void;
  labelledBy?: string;
}) {
  const { t } = useTranslation(['common', 'profiles']);
  const others = new Set(taken.filter((hex) => hex !== value));

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {PROFILE_PALETTE.map(({ hex, nameKey }) => {
        const selected = hex === value;
        const unavailable = others.has(hex);
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={unavailable || undefined}
            aria-label={t(nameKey)}
            onClick={() => {
              if (!unavailable) onChange(hex);
            }}
            className={cn(
              'relative flex size-9 items-center justify-center rounded-full transition',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
              selected && 'ring-2 ring-foreground ring-offset-2',
              unavailable && 'opacity-35',
            )}
            style={{ backgroundColor: hex }}
          >
            {selected ? <Check className="size-4 text-white" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function AvatarPicker({
  value,
  color,
  onChange,
  labelledBy,
}: {
  value: AvatarKey;
  color: string;
  onChange: (avatar: AvatarKey) => void;
  labelledBy?: string;
}) {
  const { t } = useTranslation(['common', 'profiles']);

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {ALL_AVATARS.map((avatar) => {
        const selected = avatar === value;
        return (
          <button
            key={avatar}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`profiles:avatar.${avatar}`)}
            onClick={() => {
              onChange(avatar);
            }}
            className={cn(
              'rounded-full transition',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
              selected ? 'ring-2 ring-foreground ring-offset-2' : 'opacity-70 hover:opacity-100',
            )}
          >
            <Avatar avatar={avatar} color={color} size="sm" />
          </button>
        );
      })}
    </div>
  );
}
