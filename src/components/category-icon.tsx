import { cn } from 'cn';
import { Circle } from 'lucide-react';

import { ICONS } from './category-icons';

/** A category's line icon. Thin and single-colour: the colour comes from the caller's text. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  // A custom category can name an icon this build does not ship, and an import
  // that resolves to undefined would throw inside the render of a feed row.
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * A category's round chip: a sapphire line icon on the soft sapphire tint,
 * for every kind. Direction is the amount's job (its colour and sign); a green
 * chip on income said it twice and made the feed colourful for no reason.
 */
export function CategoryChip({ icon, className }: { icon: string; className?: string }) {
  return (
    <span
      data-slot="category-chip"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground',
        className,
      )}
    >
      <CategoryIcon name={icon} className="size-4" />
    </span>
  );
}
