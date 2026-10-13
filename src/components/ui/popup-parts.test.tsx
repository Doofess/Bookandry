import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { bottomInsetFrom, useAnchoredPopup, useCollisionPadding, useHeldWhileClosing } from './popup-parts';

function scrollTo(y: number): void {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
  });
}

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('pop-outs', () => {
  it('draw an arrow when asked, on the rounded blue-shadowed surface', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent arrow data-testid="pop">
          body
        </PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    const pop = await screen.findByTestId('pop');

    expect(pop).toHaveClass('rounded-2xl', 'shadow-brand-deep/15');
    expect(pop.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();
  });

  it('draw no arrow unless asked', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="pop">body</PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    const pop = await screen.findByTestId('pop');

    expect(pop).toHaveClass('rounded-2xl');
    expect(pop.querySelector('[data-slot="popup-arrow"]')).toBeNull();
  });

  it('close on a scroll when they point at something (an arrow means close-on-scroll)', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent arrow data-testid="pop">
          body
        </PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');

    scrollTo(200);
    await expect.poll(() => screen.queryByTestId('pop')).toBeNull();
  });

  it('ignore a scroll of 4px or less', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent closeOnScroll data-testid="pop">
          body
        </PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');

    scrollTo(4);
    expect(screen.getByTestId('pop')).toBeInTheDocument();
  });

  it('stay open on a scroll when not opted in, as a search popover must', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="pop">body</PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');

    scrollTo(200);
    expect(screen.getByTestId('pop')).toBeInTheDocument();
  });

  it('stay open on a scroll while someone types in them: iOS scrolls the page as the keyboard opens', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent closeOnScroll data-testid="pop">
          <input aria-label="search" />
        </PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');
    await user.click(screen.getByRole('textbox', { name: 'search' }));

    scrollTo(200);
    expect(screen.getByTestId('pop')).toBeInTheDocument();
  });

  it('close a menu on a scroll too', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent arrow data-testid="menu">
          <DropdownMenuItem>one</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'menu' }));
    await screen.findByTestId('menu');

    scrollTo(200);
    await expect.poll(() => screen.queryByTestId('menu')).toBeNull();
  });

  it('keep a menu open while it scrolls inside, when it is taller than the room it has', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent arrow data-testid="menu">
          <DropdownMenuItem>one</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'menu' }));
    const menu = await screen.findByTestId('menu');
    // The arrow sits outside the popup's box, so the popup itself cannot clip;
    // the items scroll in a box of their own.
    const list = menu.querySelector<HTMLElement>('[data-slot="popup-scroll"]');
    expect(list).toHaveClass('overflow-y-auto', 'overscroll-contain');

    act(() => {
      if (list === null) return;
      list.scrollTop = 40;
      // Even with the page's offset reading as moved, a scroll that comes
      // from inside the popup is not the page's.
      Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(screen.getByTestId('menu')).toBeInTheDocument();
  });

  it('give menu items a 44px target on a phone', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>one</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'menu' }));

    expect(await screen.findByRole('menuitem', { name: 'one' })).toHaveClass('min-h-11', 'sm:min-h-8');
  });

  it('give radio items the same targets as the rest', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">a</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'menu' }));

    expect(await screen.findByRole('menuitemradio', { name: 'a' })).toHaveClass('min-h-11', 'sm:min-h-8');
  });
});

describe('a tap outside a pop-out that points at something', () => {
  function setUp() {
    const onRow = vi.fn();
    render(
      <>
        <button type="button" onClick={onRow}>
          row
        </button>
        <Popover>
          <PopoverTrigger>open</PopoverTrigger>
          <PopoverContent arrow data-testid="pop">
            body
          </PopoverContent>
        </Popover>
      </>,
    );
    return { onRow };
  }

  const backdrop = () => document.querySelector<HTMLElement>('[data-slot="popup-backdrop"]');

  it('closes it, and does not also press what is underneath', async () => {
    const { onRow } = setUp();
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');
    const under = backdrop();
    expect(under).not.toBeNull();

    // The press lands on the backdrop. By the time the finger lifts the
    // backdrop may have faded out, and the click lands on the row beneath.
    if (under !== null) fireEvent.pointerDown(under);
    fireEvent.click(screen.getByRole('button', { name: 'row' }));

    await expect.poll(() => screen.queryByTestId('pop')).toBeNull();
    expect(onRow).not.toHaveBeenCalled();
  });

  it('swallows that one click only: the next tap is the user’s', async () => {
    const { onRow } = setUp();
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');
    const under = backdrop();
    if (under !== null) fireEvent.pointerDown(under);
    fireEvent.click(document.body);
    await expect.poll(() => screen.queryByTestId('pop')).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'row' }));
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it('stops watching at a key press: a keyboard click after a press with no click is the user’s', async () => {
    const { onRow } = setUp();
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');
    const under = backdrop();
    if (under !== null) fireEvent.pointerDown(under);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'row' }));

    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it('does not stop the page scrolling under it', async () => {
    setUp();
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');
    const under = backdrop();

    expect(under?.className).not.toMatch(/touch-none|touch-pan|overflow-hidden/);
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    under?.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('is not there for a plain pop-out, which closes as it always has', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="pop">body</PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');

    expect(backdrop()).toBeNull();
  });
});

describe('a pop-out anchored to a button it does not own', () => {
  function setUp() {
    const anchor = document.createElement('button');
    const elsewhere = document.createElement('input');
    const popup = document.createElement('div');
    popup.dataset.slot = 'dropdown-menu-content';
    const item = document.createElement('button');
    popup.append(item);
    // Another pop-out, which a later item might open and hand focus to.
    const other = document.createElement('div');
    other.dataset.slot = 'popover-content';
    const otherInput = document.createElement('input');
    other.append(otherInput);
    document.body.append(anchor, elsewhere, popup, other);
    const hook = renderHook(
      ({ open }: { open: boolean }) => useAnchoredPopup(open ? { anchor } : undefined, () => undefined),
      { initialProps: { open: true } },
    );
    hook.result.current.popupRef.current = popup;
    // Closed: the target is cleared before base-ui asks where focus goes.
    hook.rerender({ open: false });
    return { anchor, elsewhere, item, otherInput, finalFocus: () => hook.result.current.finalFocus() };
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('gives focus back to its button when closed from inside it, as Escape does', () => {
    const { anchor, item, finalFocus } = setUp();
    item.focus();
    expect(finalFocus()).toBe(anchor);
  });

  it('leaves focus alone when something else has taken it, as the sheet an item opens does', () => {
    const { elsewhere, finalFocus } = setUp();
    elsewhere.focus();
    expect(finalFocus()).toBe(false);
  });

  it('leaves focus in a different pop-out that took it', () => {
    const { otherInput, finalFocus } = setUp();
    otherInput.focus();
    expect(finalFocus()).toBe(false);
  });

  it('gives focus to nothing once its button has left the page', () => {
    const { anchor, item, finalFocus } = setUp();
    item.focus();
    anchor.remove();
    expect(finalFocus()).toBe(false);
  });

  it('keeps showing what it was open for while it fades out', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const target = { anchor };
    const hook = renderHook(
      ({ open }: { open: boolean }) => useAnchoredPopup(open ? target : undefined, () => undefined),
      { initialProps: { open: true } },
    );
    hook.rerender({ open: false });

    expect(hook.result.current.shown).toBe(target);
    expect(hook.result.current.anchor).toBe(anchor);
  });
});

describe('useHeldWhileClosing', () => {
  it('follows the value while open, and keeps the last one while closing', () => {
    const initialProps: { value: string | undefined; open: boolean } = { value: 'offer', open: true };
    const hook = renderHook(({ value, open }) => useHeldWhileClosing(value, open), { initialProps });
    hook.rerender({ value: 'needs_billing_day', open: true });
    expect(hook.result.current).toBe('needs_billing_day');

    hook.rerender({ value: undefined, open: false });
    expect(hook.result.current).toBe('needs_billing_day');
  });
});

describe('bottomInsetFrom', () => {
  it('is nothing with nothing docked', () => {
    expect(bottomInsetFrom([], 800)).toBe(0);
  });
  it('is the height from the highest box in the lower half to the bottom edge', () => {
    expect(
      bottomInsetFrom(
        [
          { top: 640, bottom: 704 },
          { top: 580, bottom: 630 },
        ],
        800,
      ),
    ).toBe(228);
  });
  it('ignores a box in the upper half: a toast stack at the top is no bottom edge', () => {
    expect(bottomInsetFrom([{ top: 16, bottom: 80 }], 800)).toBe(0);
  });
});

describe('useCollisionPadding and the Undo toast', () => {
  const realHeight = window.innerHeight;
  const toaster = (): HTMLOListElement => {
    const ol = document.createElement('ol');
    ol.setAttribute('data-sonner-toaster', '');
    // The toaster is fixed: its bottom does not move while a toast slides in.
    ol.getBoundingClientRect = () => ({ top: 636, bottom: 700, height: 64 }) as DOMRect;
    const li = document.createElement('li');
    li.setAttribute('data-sonner-toast', '');
    li.setAttribute('data-visible', 'true');
    // A toast still entering is translated down; only its layout height counts.
    li.getBoundingClientRect = () => ({ top: 700, bottom: 764, height: 64 }) as DOMRect;
    Object.defineProperty(li, 'offsetHeight', { value: 64, configurable: true });
    ol.append(li);
    return ol;
  };

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: realHeight, configurable: true });
    document.body.replaceChildren();
  });

  it('keeps clear of a toast that mounts after the pop-out opened, and returns when it is removed', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const hook = renderHook(() => useCollisionPadding(true));
    expect(hook.result.current.bottom).toBe(5);

    const ol = toaster();
    act(() => {
      document.body.append(ol);
    });
    await waitFor(() => {
      expect(hook.result.current.bottom).toBe(5 + 172);
    });

    act(() => {
      ol.firstElementChild?.setAttribute('data-removed', 'true');
    });
    await waitFor(() => {
      expect(hook.result.current.bottom).toBe(5);
    });

    act(() => {
      ol.firstElementChild?.removeAttribute('data-removed');
    });
    await waitFor(() => {
      expect(hook.result.current.bottom).toBe(5 + 172);
    });

    act(() => {
      ol.remove();
    });
    await waitFor(() => {
      expect(hook.result.current.bottom).toBe(5);
    });
  });

  it('counts the toast when the pop-out opens with one already showing', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    document.body.append(toaster());
    const hook = renderHook(() => useCollisionPadding(true));
    expect(hook.result.current.bottom).toBe(5 + 172);
  });

  it('counts the taller of the tab bar and the toast', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const bar = document.createElement('nav');
    bar.setAttribute('data-slot', 'tab-bar');
    bar.getBoundingClientRect = () => ({ top: 720, bottom: 800, height: 80 }) as DOMRect;
    document.body.append(bar, toaster());
    const hook = renderHook(() => useCollisionPadding(true));
    expect(hook.result.current.bottom).toBe(5 + 172);
  });
});
