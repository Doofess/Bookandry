import { cn } from 'cn';
import type * as React from 'react';

/**
 * The inverted figure box (§9.3): the figure that matters in a sentence or a
 * row, in its sheet's `--box` with the sheet's lifted hue (`--box-text`) as
 * text. On the ink sheet the box flips to paper with ink text, by the sheet's
 * own mapping. One or two per sheet: a sheet full of boxes has no figure that
 * matters. A wrapped box keeps its ends; a number inside stays an isolated run.
 */
export function Mark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="mark"
      className={cn(
        'rounded-mark bg-box box-decoration-clone px-[0.28em] pt-[0.04em] pb-[0.1em] font-semibold whitespace-nowrap text-box-text [unicode-bidi:isolate]',
        className,
      )}
      {...props}
    />
  );
}
