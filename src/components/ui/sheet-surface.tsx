import { cn } from 'cn';
import type * as React from 'react';

import type { MoneyKey } from '@/domain/money-key';

import { TitlePair } from './title-pair';

export type SheetKind = 'paper' | 'night' | 'sapphire' | 'money';

const RADIUS = {
  board: 'rounded-sheet', // 36 → 56: board sheets, phone sheets
  card: 'rounded-sheet-s', // 34 → 36: card sheets, the phone summary
  cash: 'rounded-sheet-cash', // 36 → 44: the cash sheet
  row: 'rounded-row', // 26: account sheets inside the balance sheet
} as const;
export type SheetRadius = keyof typeof RADIUS;

/**
 * A sheet of the concept (§9.1): one colour, a big radius, clipped, its text
 * in its own tint (index.css maps the kind and the key; §1.5, §1.6). Sheets
 * sit one `gap-sheet` apart so the paper shows between them. A screen never
 * paints a sheet itself: it says which kind, and which money.
 */
export function Sheet({
  kind,
  moneyKey,
  radius = 'board',
  bleed = false,
  as: Tag = 'section',
  className,
  ...props
}: {
  readonly kind: SheetKind;
  /** With kind "money": a key from src/domain/money-key.ts. */
  readonly moneyKey?: MoneyKey;
  readonly radius?: SheetRadius;
  /** A huge numeral runs off this sheet's foot, so there is no padding under it (§9.4). */
  readonly bleed?: boolean;
  readonly as?: 'section' | 'div' | 'article' | 'li';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      data-sheet={kind}
      data-money={kind === 'money' ? (moneyKey ?? 'neutral') : undefined}
      className={cn(
        'relative overflow-clip px-sheet-x pt-sheet-y',
        bleed ? 'pb-0' : 'pb-sheet-y',
        RADIUS[radius],
        className,
      )}
      {...props}
    />
  );
}

/** A sheet's title pair (600 over 300, read once), with its one action at the inline end. */
export function SheetHead({
  title,
  subtitle,
  size = 'sheet',
  as = 'h2',
  action,
  className,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly size?: 'hero' | 'sheet';
  readonly as?: 'h2' | 'h3';
  readonly action?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-slot="sheet-head" className={cn('flex items-start justify-between gap-4', className)}>
      <TitlePair as={as} size={size} title={title} subtitle={subtitle} className="min-w-0" />
      {action === undefined ? null : <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
