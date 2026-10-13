import { cn } from 'cn';

import type { HueToken } from '@/domain/category-hue';

/**
 * A row's category as a 14×40 pill of its hue (§5.1), where the old rows had
 * an icon disc. A mark, never text (decision 10): hidden from screen readers,
 * the category's name is in the row. A row with no category hue gets the
 * concept's outline instead of a fill.
 */
export function HuePill({
  hue,
  className,
}: {
  readonly hue: HueToken | undefined;
  readonly className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      data-slot="hue-pill"
      data-hue={hue ?? 'neutral'}
      className={cn(
        'block h-10 w-3.5 shrink-0 rounded-full bg-hue',
        hue === undefined && 'bg-transparent shadow-[inset_0_0_0_2px_var(--border)]',
        className,
      )}
    />
  );
}
