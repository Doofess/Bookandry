import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { useAnchoredPopup } from './popup-parts';

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
});

describe('a pop-out anchored to a button it does not own', () => {
  function setUp() {
    const anchor = document.createElement('button');
    const elsewhere = document.createElement('input');
    const popup = document.createElement('div');
    popup.dataset.slot = 'dropdown-menu-content';
    const item = document.createElement('button');
    popup.append(item);
    document.body.append(anchor, elsewhere, popup);
    const hook = renderHook(
      ({ open }: { open: boolean }) => useAnchoredPopup(open ? { anchor } : undefined, () => undefined),
      { initialProps: { open: true } },
    );
    // Closed: the target is cleared before base-ui asks where focus goes.
    hook.rerender({ open: false });
    return { anchor, elsewhere, item, finalFocus: () => hook.result.current.finalFocus() };
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
