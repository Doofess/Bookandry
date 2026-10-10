import { cn } from 'cn';
import type { ReactNode } from 'react';

import type { MoneyKey } from '@/domain/money-key';

/**
 * A card, bank or cash in a row's meta line (§9.2): a pill in the money colour
 * with its tint, at least 24px, 13px in 500, its name always written on it.
 * Not a sheet (no grain, no 2px border): its forced-colours edge is a
 * transparent outline. Inside the month sheet its parent sets `--chip-ring`
 * (the sheet's tint at 55%) and it draws that ring.
 */
export function Chip({
  moneyKey,
  children,
  className,
}: {
  readonly moneyKey: MoneyKey;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      data-slot="chip"
      data-money={moneyKey}
      className={cn(
        'inline-flex min-h-6 items-center rounded-full bg-fill px-2.5 text-[0.8125rem] leading-none font-medium whitespace-nowrap text-on-fill',
        'shadow-[0_0_0_1.5px_var(--chip-ring,transparent)] outline-2 -outline-offset-2 outline-transparent',
        className,
      )}
    >
      {children}
    </span>
  );
}
