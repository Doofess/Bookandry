import { cn } from 'cn';
import { Landmark, type LucideIcon } from 'lucide-react';

import { brandLogo, type BrandKey } from '@/data/brands';
import { bankByCode } from '@/domain/banks';

/** The tile both marks share, so a row of brands and neutral options lines up. */
const TILE = 'inline-flex max-w-full shrink-0 items-center justify-center';

/** 'xs': in a line of 11px print - the bank under an amount on a feed row. */
const SIZES = {
  default: { tile: 'h-7 rounded-md px-1.5', img: 'h-5 max-w-20', icon: 'size-4', neutral: 'min-w-9' },
  xs: { tile: 'h-4 rounded-sm px-0.5', img: 'h-3 max-w-12', icon: 'size-3', neutral: 'min-w-4' },
} as const;

export type MarkSize = keyof typeof SIZES;

/**
 * A bank's, card company's or network's own logo, on a small white tile.
 *
 * White in both themes on purpose: the logos are drawn for white, the way a
 * card prints them, and a navy Visa or a black Max on the dark surface would
 * disappear. The hairline ring keeps the tile's edge on a white sheet.
 *
 * The image is decorative - the brand's name is always text beside it, or an
 * sr-only label where the mark stands alone - and it is an <img>, never inlined:
 * an SVG rendered that way can neither run script nor load anything.
 */
export function BrandMark({
  brand,
  className,
  size = 'default',
}: {
  readonly brand: BrandKey;
  readonly className?: string;
  readonly size?: MarkSize;
}) {
  const src = brandLogo(brand);
  if (src === undefined) return null;
  return (
    <span
      data-slot="brand-mark"
      className={cn(TILE, SIZES[size].tile, 'bg-white ring-1 ring-black/5 dark:ring-white/10', className)}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-brand={brand}
        className={cn(SIZES[size].img, 'w-auto min-w-0 object-contain')}
      />
    </span>
  );
}

/**
 * The same tile for an option that is no brand - "Not through a bank", "Not in
 * the list", "Other" - as a line icon on the sapphire tint, the category chip's
 * treatment.
 */
export function NeutralMark({
  icon: Icon,
  className,
  size = 'default',
}: {
  readonly icon: LucideIcon;
  readonly className?: string;
  readonly size?: MarkSize;
}) {
  return (
    <span
      data-slot="neutral-mark"
      className={cn(
        TILE,
        SIZES[size].tile,
        SIZES[size].neutral,
        'bg-accent text-accent-foreground',
        className,
      )}
    >
      <Icon className={SIZES[size].icon} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/**
 * A bank by its code: its logo where there is one, and otherwise a neutral
 * landmark. The code is normalised through the bank list first, so a code
 * written differently ("012") still finds its bank.
 */
export function BankMark({
  code,
  className,
  size = 'default',
}: {
  readonly code: string;
  readonly className?: string;
  readonly size?: MarkSize;
}) {
  const brand: BrandKey = `bank-${bankByCode(code)?.code ?? code}`;
  return brandLogo(brand) === undefined ? (
    <NeutralMark icon={Landmark} className={className} size={size} />
  ) : (
    <BrandMark brand={brand} className={className} size={size} />
  );
}
