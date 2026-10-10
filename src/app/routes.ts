export const ROUTES = {
  feed: '/',
  chart: '/chart',
  cards: '/cards',
  cash: '/cash',
  /** The old Household tab, now Settings > Account linking: kept so its links still land. */
  household: '/household',
  settings: '/settings',
} as const;

export type RouteKey = keyof typeof ROUTES;

/** The routes that are tabs. */
export type NavKey = Extract<RouteKey, 'feed' | 'chart' | 'cards' | 'cash'>;

/**
 * Order is the tab-bar / rail order, and the primary tab order.
 *
 * Four: the places the money is - the feed, the chart, the cards it moves
 * through, which decide WHEN it leaves the account, and the cash in the
 * wallet, which is the one part of the balance no bank shows. Cash earned its
 * slot the way the others did: it is a place you check, not an action you
 * take. Settings left the tabs for the account menu at the top of every
 * screen; account linking followed it, as a page in Settings - set up once,
 * not visited daily. Every screen the app grows does not earn a tab: a bar
 * that scrolls is a bar nobody reads.
 */
export const NAV_ORDER: readonly NavKey[] = ['feed', 'chart', 'cards', 'cash'];

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

/** A place in the desktop rail; `phone` marks the four that are the phone's tabs. */
export type RailPlace = {
  readonly key:
    'feed' | 'chart' | 'cards' | 'bankAccounts' | 'cash' | 'categories' | 'commitments' | 'settings';
  readonly to: string;
  readonly phone: boolean;
};

/**
 * The rail's places (§4.2): the phone's tabs in their order, with Bank
 * accounts after Cards. The rail lists places only; Add is a button at its
 * top (decision 28), because a nav that mixes links and actions is harder to
 * use with a screen reader.
 */
export const RAIL_PLACES: readonly RailPlace[] = [
  { key: 'feed', to: ROUTES.feed, phone: true },
  { key: 'chart', to: ROUTES.chart, phone: true },
  { key: 'cards', to: ROUTES.cards, phone: true },
  { key: 'bankAccounts', to: LINKED_ROUTES.bankAccounts, phone: false },
  { key: 'cash', to: ROUTES.cash, phone: true },
];

/** The set-up places, below a line: on the desktop rail only (decision 27). */
export const RAIL_SETUP: readonly RailPlace[] = [
  { key: 'categories', to: LINKED_ROUTES.categories, phone: false },
  { key: 'commitments', to: LINKED_ROUTES.commitments, phone: false },
  { key: 'settings', to: ROUTES.settings, phone: false },
];

/**
 * Which way a move between two places goes, in rail order, for the route
 * transition's slide (§8.2). A settings page counts as Settings; a page that
 * is no place at all counts as before the first.
 */
export function navDirection(from: string, to: string): 'forward' | 'back' {
  const order = [...RAIL_PLACES, ...RAIL_SETUP].map((place) => place.to);
  const index = (path: string) =>
    order.findIndex((place) => place === path || (place !== ROUTES.feed && path.startsWith(`${place}/`)));
  return index(to) < index(from) ? 'back' : 'forward';
}
