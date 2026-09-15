export const ROUTES = {
  feed: '/',
  chart: '/chart',
  profiles: '/profiles',
  settings: '/settings',
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Order is the tab-bar / rail order, and the primary tab order.
 *
 * Four, and it stays four. Every screen the app grows does not earn a tab: a
 * fifth costs the other four a share of a 375px bar, and a bar that scrolls is
 * a bar nobody reads.
 */
export const NAV_ORDER: readonly RouteKey[] = ['feed', 'chart', 'profiles', 'settings'];

/**
 * Routes reachable by link rather than by tab.
 *
 * Recurring commitments is a monthly visit, reached from Settings and from the
 * expense breakdown - which is where the question "what am I actually paying
 * for" gets asked.
 */
export const LINKED_ROUTES = {
  commitments: '/commitments',
} as const;
