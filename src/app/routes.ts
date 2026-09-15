export const ROUTES = {
  feed: '/',
  chart: '/chart',
  profiles: '/profiles',
  settings: '/settings',
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Order is the tab-bar / rail order, and the primary tab order. */
export const NAV_ORDER: readonly RouteKey[] = ['feed', 'chart', 'profiles', 'settings'];
