import { cn } from 'cn';
import * as React from 'react';

/**
 * What every pop-out shares: the rounded surface with its soft blue shadow,
 * the small arrow, the two ways it closes on its own, the plumbing of a
 * pop-out anchored to a button it does not own, and the icon-label-hint
 * layout of its items.
 */

/** The surface: rounded-2xl, a soft sapphire-tinted shadow, and the hairline ring. */
export const POPUP_SURFACE = 'rounded-2xl shadow-lg shadow-brand-deep/15 ring-1 ring-foreground/10';

export type PopupActions = { readonly close: () => void; readonly unmount: () => void };

/** The root's imperative handle, handed to the content so it can close itself on scroll. */
export const PopupActionsContext = React.createContext<React.RefObject<PopupActions | null> | null>(null);

/** Where an open pop-out's content is, so a scroll can tell whether someone is typing in one. */
const POPUP_CONTENT = '[data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

/** Someone is typing in an open pop-out: its search box, say. */
function typingInPopup(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const editable =
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    active.isContentEditable;
  return editable && active.closest(POPUP_CONTENT) !== null;
}

/**
 * Close the open pop-out once the page scrolls. A pop-out pinned to a row
 * that has moved away points at nothing. 4px of slack ignores the sub-pixel
 * jitter of a focus change.
 *
 * Not while someone is typing in it: iOS scrolls the page to keep a focused
 * input above the keyboard, and closing then would take the search box away
 * the moment it was tapped.
 *
 * Only the PAGE's scroll counts. A menu taller than the room it has scrolls
 * its own list, and that is someone reaching for an item, not moving on.
 */
export function useCloseOnScroll(actions: React.RefObject<PopupActions | null> | null): void {
  React.useEffect(() => {
    if (actions === null) return;
    const startY = window.scrollY;
    const onScroll = (event: Event): void => {
      if (event.target instanceof Element) return;
      if (Math.abs(window.scrollY - startY) > 4 && !typingInPopup()) actions.current?.close();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [actions]);
}

/** Mounted inside the popup, so it listens only while the pop-out is open. */
export function CloseOnScroll() {
  useCloseOnScroll(React.use(PopupActionsContext));
  return null;
}

/**
 * Close a pop-out whose anchor has left the document.
 *
 * The feed is virtualised: a row scrolled out of the rendered range is
 * unmounted, and a menu still anchored to its ⋯ would float at the page's
 * top-left pointing at nothing, and act on a row nobody can see.
 */
export function useCloseWhenDetached(anchor: Element | null | undefined, close: () => void): void {
  const closeRef = React.useRef(close);
  React.useEffect(() => {
    closeRef.current = close;
  }, [close]);

  React.useEffect(() => {
    if (anchor === null || anchor === undefined) return;
    const observer = new MutationObserver(() => {
      if (!anchor.isConnected) closeRef.current();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [anchor]);
}

/**
 * A value as it was while the pop-out was open, kept while it fades out.
 *
 * A pop-out stays on screen for its exit animation after it has closed, but
 * what it shows is usually worked out from the thing that closing cleared.
 * Read live, its items would drop out mid-fade and the box would shrink as it
 * fades. Adjusted while rendering rather than in an effect, so there is no
 * frame with the old value missing.
 */
export function useHeldWhileClosing<T>(value: T, open: boolean): T {
  const [held, setHeld] = React.useState(value);
  if (open && value !== held) setHeld(value);
  return open ? value : held;
}

/**
 * A pop-out opened from a button it does not own: ONE instance at screen
 * level, pointed at whichever button opened it through base-ui's `anchor`.
 *
 * - `shown` is the open target, and while the pop-out fades out after closing,
 *   the one it was open for, so its content does not empty mid-animation.
 * - `anchor` is that target's button, for the Positioner.
 * - `popupRef` goes on the popup, so `finalFocus` knows which one is its own.
 * - `finalFocus` gives focus back to the button it came from, if that button
 *   is still on the page. The target is already cleared by then, so it reads
 *   the last one. Only while focus is still in THIS popup, or nowhere: an item
 *   that opens a sheet, or another pop-out, hands focus to it, and base-ui
 *   returns focus only once the exit animation ends, by which time pulling it
 *   back to the row would leave a keyboard user outside what they just opened.
 * - It closes when that button leaves the page (`useCloseWhenDetached`).
 */
export function useAnchoredPopup<T extends { readonly anchor: HTMLElement }>(
  target: T | undefined,
  onClose: () => void,
): {
  readonly shown: T | undefined;
  readonly anchor: HTMLElement | undefined;
  readonly popupRef: React.RefObject<HTMLDivElement | null>;
  readonly finalFocus: () => HTMLElement | false;
} {
  useCloseWhenDetached(target?.anchor, onClose);

  const shown = useHeldWhileClosing(target, target !== undefined);
  const popupRef = React.useRef<HTMLDivElement | null>(null);

  const lastAnchor = shown?.anchor;
  const finalFocus = React.useCallback((): HTMLElement | false => {
    if (lastAnchor?.isConnected !== true) return false;
    const active = document.activeElement;
    const stillHere =
      active === null || active === document.body || popupRef.current?.contains(active) === true;
    return stillHere ? lastAnchor : false;
  }, [lastAnchor]);

  return { shown, anchor: lastAnchor, popupRef, finalFocus };
}

/**
 * The click that ends a press on the backdrop is not the user's: swallow it.
 *
 * The press closes the pop-out on pointerdown, and the backdrop fades out with
 * it, so the click that follows on lift can land on whatever was underneath:
 * another row's body, which would open its editor, or a tab, which would
 * navigate. Exactly one click is swallowed. A new press, a press that became
 * a scroll (pointercancel), or a key press (a keyboard or assistive-technology
 * click) ends the watch, so no later click is lost.
 */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const stop = (): void => {
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', stop, true);
    window.removeEventListener('pointercancel', stop, true);
    window.removeEventListener('keydown', stop, true);
  };
  window.addEventListener('click', swallow, true);
  window.addEventListener('pointerdown', stop, true);
  window.addEventListener('pointercancel', stop, true);
  window.addEventListener('keydown', stop, true);
}

/**
 * A transparent layer over the page, under a pop-out that points at
 * something. A tap on it closes the pop-out and does nothing else.
 *
 * base-ui gives a modal pop-out a backdrop of its own, but a modal one locks
 * the page's scroll, and these close ON scroll. So these are not modal, and
 * without this a tap outside would close the pop-out and press what was
 * under the finger too.
 *
 * It does not stop the page scrolling: no `touch-action: none`, no wheel
 * handler. A drag or a wheel over it scrolls the page, and the scroll closes
 * the pop-out.
 */
export function PopupBackdrop() {
  const actions = React.use(PopupActionsContext);
  return (
    <div
      data-slot="popup-backdrop"
      aria-hidden="true"
      className="fixed inset-0 z-50"
      onPointerDown={() => {
        swallowNextClick();
        actions?.current?.close();
      }}
    />
  );
}

/**
 * One item's content: an icon, a label, and an optional hint under it. The
 * item itself (a menu item, a button) is the caller's.
 */
export function PopupItemContent({
  icon: Icon,
  label,
  hint,
  flip = false,
}: {
  readonly icon: React.ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  readonly label: string;
  readonly hint?: string | undefined;
  /** True only for icons on §7's directional allowlist. */
  readonly flip?: boolean;
}) {
  return (
    <>
      <Icon className={cn('size-4', flip && 'cn-rtl-flip rtl:rotate-180')} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0">
        <span data-slot="popup-item-label" className="block text-sm font-medium">
          {label}
        </span>
        {hint === undefined ? null : (
          <span data-slot="popup-item-hint" className="block text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * The arrow's classes. Drawn above or below only: every pop-out in the app
 * opens on one of those two sides, and left/right offsets are physical.
 */
export const ARROW_CLASS = 'data-[side=bottom]:-top-2 data-[side=top]:-bottom-2 data-[side=top]:rotate-180';

/** base-ui's own arrow shape: the popover's fill, with its hairline edge. */
export function ArrowSvg() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden="true">
      <path
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
        className="fill-popover"
      />
      <path
        d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66436 2.60207L4.77734 7L2.13171 7.00001C2.87284 7.00001 3.58774 6.72568 4.13861 6.22989L8.99542 1.85876Z"
        className="fill-foreground/10"
      />
    </svg>
  );
}
