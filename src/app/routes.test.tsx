import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { appRoutes } from './app-routes';
import { LINKED_ROUTES, NAV_ORDER, ROUTES, SETTINGS_ROUTES } from './routes';

/*
 * Account linking is a settings page, not a tab: four tabs, and every old
 * address of the household lands on the page that took its place.
 */
describe('the tabs', () => {
  it('are the feed, the chart, the cards and cash, and nothing else', () => {
    expect(NAV_ORDER).toEqual(['feed', 'chart', 'cards', 'cash']);
    expect(NAV_ORDER).not.toContain('household');
  });

  it('mounts Cash at its own address', () => {
    expect(ROUTES.cash).toBe('/cash');
    expect(appRoutes.find((r) => r.path === ROUTES.cash)?.element).toBeDefined();
  });
});

describe('account linking', () => {
  it('lives in Settings', () => {
    expect(SETTINGS_ROUTES.linking).toBe('/settings/linking');
  });

  /** The app's own route for `path`, as main.tsx mounts it. */
  const routeFor = (path: string): RouteObject => {
    const route = appRoutes.find((r) => r.path === path);
    if (route === undefined) throw new Error(`no route for ${path}`);
    return route;
  };

  it.each([ROUTES.household, LINKED_ROUTES.profiles])(
    '%s goes to it, replacing the old address',
    async (path) => {
      const router = createMemoryRouter(
        [
          { path, element: routeFor(path).element },
          { path: SETTINGS_ROUTES.linking, element: <p>linking</p> },
        ],
        { initialEntries: ['/', path], initialIndex: 1 },
      );
      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(SETTINGS_ROUTES.linking);
      });
      // Replaced, not pushed: Back leaves for where the person was, not into a loop.
      expect(router.state.historyAction).toBe('REPLACE');
    },
  );

  it('is mounted at its own address', () => {
    expect(routeFor(SETTINGS_ROUTES.linking).element).toBeDefined();
  });
});
