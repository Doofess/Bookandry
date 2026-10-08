import { cn } from 'cn';
import { Landmark, type LucideIcon } from 'lucide-react';

import { brandLogo, type BrandKey } from '@/data/brands';
import { bankByCode } from '@/domain/banks';

/** The tile both marks share, so a row of brands and neutral options lines up. */
const TILE = 'inline-flex h-7 max-w-full shrink-0 items-center justify-center rounded-md px-1.5';

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
export function BrandMark({ brand, className }: { readonly brand: BrandKey; readonly className?: string }) {
  const src = brandLogo(brand);
  if (src === undefined) return null;
  return (
    <span
      data-slot="brand-mark"
      className={cn(TILE, 'bg-white ring-1 ring-black/5 dark:ring-white/10', className)}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-brand={brand}
        className="h-5 w-auto max-w-20 min-w-0 object-contain"
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
}: {
  readonly icon: LucideIcon;
  readonly className?: string;
}) {
  return (
    <span
      data-slot="neutral-mark"
      className={cn(TILE, 'min-w-9 bg-accent text-accent-foreground', className)}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/**
 * A bank by its code: its logo where there is one, and otherwise a neutral
 * landmark. The code is normalised through the bank list first, so a code
 * written differently ("012") still finds its bank.
 */
export function BankMark({ code, className }: { readonly code: string; readonly className?: string }) {
  const brand: BrandKey = `bank-${bankByCode(code)?.code ?? code}`;
  return brandLogo(brand) === undefined ? (
    <NeutralMark icon={Landmark} className={className} />
  ) : (
    <BrandMark brand={brand} className={className} />
  );
}
