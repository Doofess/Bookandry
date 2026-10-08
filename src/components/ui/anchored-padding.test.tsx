import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as MenuModule from '@base-ui/react/menu';
import type * as PopoverModule from '@base-ui/react/popover';

import type { CollisionPadding } from './popup-parts';

/** What each positioner was given as its collision padding, newest last. */
const seen = vi.hoisted(() => ({ menu: [] as unknown[], popover: [] as unknown[] }));

vi.mock('@base-ui/react/menu', async (original) => {
  const mod = await original<typeof MenuModule>();
  const Real = mod.Menu.Positioner;
  const Positioner = (props: Parameters<typeof Real>[0]) => {
    seen.menu.push(props.collisionPadding);
    return createElement(Real, props);
  };
  return { ...mod, Menu: { ...mod.Menu, Positioner } };
});
vi.mock('@base-ui/react/popover', async (original) => {
  const mod = await original<typeof PopoverModule>();
  const Real = mod.Popover.Positioner;
  const Positioner = (props: Parameters<typeof Real>[0]) => {
    seen.popover.push(props.collisionPadding);
    return createElement(Real, props);
  };
  return { ...mod, Popover: { ...mod.Popover, Positioner } };
});

const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } =
  await import('./dropdown-menu');
const { Popover, PopoverContent } = await import('./popover');

const TAB_BAR = '[data-slot="tab-bar"]';
const nodes: HTMLElement[] = [];

/** The phone's tab bar, from `top` to the foot of the screen, or the desktop rail when `top` is 0. */
function tabBar(top: number): HTMLElement {
  const bar = document.createElement('nav');
  bar.dataset['slot'] = 'tab-bar';
  bar.getBoundingClientRect = () => new DOMRect(0, top, window.innerWidth, window.innerHeight - top);
  document.body.append(bar);
  nodes.push(bar);
  return bar;
}

function anchorButton(): HTMLElement {
  const button = document.createElement('button');
  document.body.append(button);
  nodes.push(button);
  return button;
}

const last = (list: readonly unknown[]) => list.at(-1) as CollisionPadding | undefined;

afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
  seen.menu.length = 0;
  seen.popover.length = 0;
  vi.restoreAllMocks();
});

const anchoredMenu = (anchor: HTMLElement, open = true) => (
  <DropdownMenu open={open} modal={false}>
    <DropdownMenuContent anchor={anchor}>
      <DropdownMenuItem>One</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

describe('an anchored pop-out and the phone’s tab bar', () => {
  it('keeps clear of the bar: its height becomes room at the bottom', async () => {
    tabBar(window.innerHeight - 60);
    render(anchoredMenu(anchorButton()));
    await screen.findByRole('menu');

    await vi.waitFor(() => {
      expect(last(seen.menu)).toEqual({ top: 5, right: 5, bottom: 65, left: 5 });
    });
  });

  it('applies to anchored pop-outs only: a menu its own trigger places keeps base-ui’s default', async () => {
    tabBar(window.innerHeight - 60);
    const query = vi.spyOn(document, 'querySelector');
    render(
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await screen.findByRole('menu');

    expect(seen.menu.length).toBeGreaterThan(0);
    expect(seen.menu.every((padding) => padding === undefined)).toBe(true);
    expect(query.mock.calls.filter(([selector]) => selector === TAB_BAR)).toEqual([]);
  });

  it('measures nothing while closed', () => {
    tabBar(window.innerHeight - 60);
    const query = vi.spyOn(document, 'querySelector');
    render(anchoredMenu(anchorButton(), false));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(query.mock.calls.filter(([selector]) => selector === TAB_BAR)).toEqual([]);
  });

  it('follows the bar when the window changes size', async () => {
    const bar = tabBar(window.innerHeight - 60);
    render(anchoredMenu(anchorButton()));
    await vi.waitFor(() => {
      expect(last(seen.menu)?.bottom).toBe(65);
    });

    bar.getBoundingClientRect = () => new DOMRect(0, window.innerHeight - 90, window.innerWidth, 90);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await vi.waitFor(() => {
      expect(last(seen.menu)?.bottom).toBe(95);
    });
  });

  it('counts nothing for the desktop rail, or with no bar at all', async () => {
    tabBar(0);
    const { unmount } = render(anchoredMenu(anchorButton()));
    await screen.findByRole('menu');
    expect(last(seen.menu)?.bottom).toBe(5);
    unmount();

    for (const node of nodes.splice(0)) node.remove();
    render(anchoredMenu(anchorButton()));
    await screen.findByRole('menu');
    expect(last(seen.menu)?.bottom).toBe(5);
  });

  it('does the same for an anchored popover', async () => {
    tabBar(window.innerHeight - 60);
    render(
      <Popover open modal={false}>
        <PopoverContent anchor={anchorButton()}>Inside</PopoverContent>
      </Popover>,
    );
    await screen.findByText('Inside');

    await vi.waitFor(() => {
      expect(last(seen.popover)?.bottom).toBe(65);
    });
  });
});
