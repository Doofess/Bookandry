import { cn } from 'cn';
import { useCallback, useRef, type KeyboardEvent } from 'react';

/**
 * A segmented single-choice control.
 *
 * Built by hand rather than on Base UI's ToggleGroup, which models a MULTI
 * selection - its value is an array and single-select is expressed by passing a
 * one-element array with `toggleMultiple={false}`. That is a toggle group
 * pretending to be a radio group, and screen readers hear the pretence: it
 * announces "pressed"/"not pressed" rather than "1 of 3".
 *
 * Three things this gets right that a `<div role="radiogroup">` of buttons
 * usually does not:
 *
 *  - ROVING TABINDEX. In a radio group the whole group is ONE tab stop and the
 *    arrow keys move within it. Leaving every option tabbable makes a
 *    four-option repeat control four tab stops on the way to the Save button.
 *  - ARROW KEYS SELECT. In a radio group, moving focus IS choosing - that is
 *    what distinguishes it from a toolbar, and keyboard users rely on it.
 *  - LOGICAL ARROWS. ArrowRight moves to the NEXT option in reading order,
 *    which in Hebrew is to the left. Hard-coding right = forward inverts the
 *    control for the second locale.
 */
export type SegmentedOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  /** Rendered under the label; also joined into the option's accessible name. */
  readonly hint?: string;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  labelledBy,
  className,
  size = 'default',
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly SegmentedOption<T>[];
  /** Id of the visible label. A radiogroup with no name announces as "group". */
  readonly labelledBy: string;
  readonly className?: string;
  readonly size?: 'default' | 'sm';
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = useCallback(
    (delta: number, index: number) => {
      const next = (index + delta + options.length) % options.length;
      const option = options[next];
      if (option === undefined) return;
      onChange(option.value);
      // Focus follows selection: in a radio group they are the same act.
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[next]?.focus();
    },
    [onChange, options],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    /*
     * Reading direction, read off the element rather than off the language.
     *
     * `dir` can be set per-subtree - the chart's plot area is an LTR island
     * inside an RTL page - so asking the DOM is the only answer that stays
     * right when a control is moved.
     */
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';

    if (event.key === forward || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1, index);
    } else if (event.key === backward || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1, index);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(-index, index);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(options.length - 1 - index, index);
    }
  };

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn('flex flex-wrap gap-1 rounded-xl bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // One tab stop for the group, per the ARIA radio pattern.
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className={cn(
              'flex-1 rounded-lg px-3 text-center transition',
              // 44px is the WCAG 2.2 target-size floor.
              size === 'sm' ? 'min-h-9 py-1.5 text-xs' : 'min-h-11 py-2 text-sm',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
              selected
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="block whitespace-nowrap">{option.label}</span>
            {option.hint === undefined ? null : (
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
