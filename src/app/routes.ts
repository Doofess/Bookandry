export const ROUTES = {
  feed: '/',
  chart: '/chart',
  cards: '/cards',
  /** The old Household tab, now Settings > Account linking: kept so its links still land. */
  household: '/household',
  settings: '/settings',
} as const;

export type RouteKey = keyof typeof ROUTES;

/** The routes that are tabs. */
export type NavKey = Extract<RouteKey, 'feed' | 'chart' | 'cards'>;

/**
 * Order is the tab-bar / rail order, and the primary tab order.
 *
 * Three: the places the money is - and the cards it moves through, which
 * decide WHEN it leaves the account. Settings left the tabs for the account menu
 * at the top of every screen (the person's picture), where an account's and
 * an app's settings are looked for; account linking followed it there, as a
 * page in Settings - it is set up once, not visited daily. Every screen the app
 * grows does not earn a tab: a bar that scrolls is a bar nobody reads.
 */
export const NAV_ORDER: readonly NavKey[] = ['feed', 'chart', 'cards'];

/**
 * Routes reachable by link rather than by tab: from the account menu, and
 * from the Settings page that lists the same places.
 *
 * Recurring commitments is also linked from the expense breakdown - which is
 * where the question "what am I actually paying for" gets asked.
 */
export const LINKED_ROUTES = {
  commitments: '/commitments',
  categories: '/categories',
  /** The old payment-method list, now the Cards screen's: kept so its links still land. */
  paymentMethods: '/payment-methods',
  bankAccounts: '/bank-accounts',
  /** The old people screen, now Settings > Account linking: kept so its links still land. */
  profiles: '/profiles',
  /** Where an emailed invitation to link accounts lands. */
  link: '/link',
  /** Where an emailed request to delete every linked account's data lands. */
  wipe: '/wipe',
} as const;

/** Settings, one page per subject. `/settings` itself lists them. */
export const SETTINGS_ROUTES = {
  account: '/settings/account',
  /** The accounts linked with this one, and inviting more: needs an account. */
  linking: '/settings/linking',
  security: '/settings/security',
  preferences: '/settings/preferences',
  data: '/settings/data',
} as const;
