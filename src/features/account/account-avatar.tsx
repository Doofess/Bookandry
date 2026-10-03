import { cn } from 'cn';
import { UserRound } from 'lucide-react';

import { useAccountAvatar } from '@/app/account-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * The account's round picture: its own, else Google's, else its initials -
 * and with no account at all (a build without accounts), a plain figure.
 * Always decorative: whatever holds it carries the name.
 */
export function AccountAvatar({ size, className }: { readonly size: number; readonly className?: string }) {
  const { src, initials } = useAccountAvatar();
  return (
    <Avatar
      className={cn('after:border-transparent', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src === undefined ? null : <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback
        className="bg-primary font-semibold text-primary-foreground"
        style={{ fontSize: Math.round(size * 0.4) }}
      >
        {initials === '' ? <UserRound className="size-[55%]" aria-hidden="true" /> : initials}
      </AvatarFallback>
    </Avatar>
  );
}
