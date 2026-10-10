import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { appRoutes } from './app-routes';
import {
  LINKED_ROUTES,
  NAV_ORDER,
  navDirection,
  PHONE_PLACES,
  RAIL_PLACES,
  RAIL_SETUP,
  ROUTES,
  SETTINGS_ROUTES,
} from './routes';

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

describe('the rail (§4.2)', () => {
  it("lists the rail's places in the concept's order, and keeps the phone's four tabs as they are", () => {
    expect(RAIL_PLACES.map((place) => place.key)).toEqual(['feed', 'cards', 'bankAccounts', 'cash', 'chart']);
    expect(PHONE_PLACES.map((place) => place.key)).toEqual(NAV_ORDER);
    expect(RAIL_PLACES.find((p) => p.key === 'feed')?.railLabel).toBe('overview');
    expect(RAIL_PLACES.find((p) => p.key === 'cash')?.railLabel).toBe('cashBox');
    expect(RAIL_SETUP.map((place) => place.key)).toEqual(['categories', 'commitments', 'settings']);
  });

  it('tells forward from back by rail order, a settings page by its section', () => {
    expect(navDirection('/', '/chart')).toBe('forward');
    expect(navDirection('/chart', '/cards')).toBe('back');
    expect(navDirection('/cards', '/cash')).toBe('forward');
    expect(
      navDirection(
        '/chart',
        '/cards',
        PHONE_PLACES.map((p) => p.to),
      ),
    ).toBe('forward');
    expect(navDirection('/settings/account', '/categories')).toBe('back');
    // From a page that is not a place (an invitation link), every place is ahead.
    expect(navDirection('/link', '/chart')).toBe('forward');
  });
});
