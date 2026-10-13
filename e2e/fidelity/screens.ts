import type { Page } from '@playwright/test';

import type { ConceptFrame } from './concept';
import type { Kind, Size } from './config';
import type { Probe, ProbeProp } from './probe';

export type Metric =
  | {
      readonly name: string;
      readonly concept: Probe;
      readonly app: Probe;
      readonly tol: number;
      readonly relative?: boolean;
    }
  | {
      readonly name: string;
      readonly app: Probe;
      readonly expect: number;
      readonly tol: number;
      readonly relative?: boolean;
    }
  | { readonly name: string; readonly app: Probe; readonly atLeast: number };

export type Expectation = number | { readonly atLeast: number };

export type ScreenSpec = {
  readonly id: string;
  readonly size: Size;
  readonly route: string;
  readonly lang?: 'he' | 'en';
  readonly state?: 'household' | 'empty';
  /** Puts the screen in the state compared, after `main` is up. */
  readonly setup?: (page: Page) => Promise<void>;
  /** What it is compared with; absent for a screen the concept does not draw. */
  readonly concept?: ConceptFrame;
  /** The app's element compared with an element frame; for a screen with no frame, the element whose
   *  colours are judged (a panel, over its scrim). It is also the counts' scope. */
  readonly appScope?: string;
  /** 'all' (default) or 'metrics': a frame used for its measurements only. */
  readonly compare?: 'all' | 'metrics';
  /** Counts for a screen the concept does not draw. */
  readonly expect?: Partial<Record<Kind, Expectation>>;
  readonly metrics: readonly Metric[];
  /** Bins a screen the concept does not draw must show (see BINS). */
  readonly mustShow?: readonly string[];
  /** English: the concept's x becomes 1440 − x − width. */
  readonly mirror?: boolean;
  /** Not on this branch yet: why the test is skipped. */
  readonly reserved?: string;
};

const probe = (selector: string, prop: ProbeProp, index?: number): Probe =>
  index === undefined ? { selector, prop } : { selector, prop, index };

const pair = (
  name: string,
  concept: string,
  app: string,
  prop: ProbeProp,
  tol: number,
  extra: { readonly index?: number; readonly relative?: boolean } = {},
): Metric => ({
  name,
  concept: probe(concept, prop, extra.index),
  app: probe(app, prop, extra.index),
  tol,
  ...(extra.relative === true ? { relative: true } : {}),
});

const want = (
  name: string,
  app: string,
  prop: ProbeProp,
  expect: number,
  tol: number,
  extra: { readonly index?: number; readonly relative?: boolean } = {},
): Metric => ({
  name,
  app: probe(app, prop, extra.index),
  expect,
  tol,
  ...(extra.relative === true ? { relative: true } : {}),
});

const atLeast = (name: string, app: string, prop: ProbeProp, n: number): Metric => ({
  name,
  app: probe(app, prop),
  atLeast: n,
});

const REL = { relative: true } as const;

/** The app's side of the contract. */
const S = {
  board: '[data-slot="board"]',
  balance: '[data-slot="balance-sheet"]',
  account: '[data-slot="account-sheet"]',
  accounts: '[data-slot="account-sheets"]',
  month: '[data-slot="month-sheet"]',
  left: '[data-slot="month-left"] [data-numeral]',
  categories: '[data-slot="categories-sheet"]',
  bar: '[data-slot="hue-bars"] i[data-hue]',
  transactions: '[data-slot="transactions-sheet"]',
  wallet: '[data-slot="wallet"]',
  card: '[data-card-sheet]',
  cash: '[data-slot="cash-sheet"]',
  head: '[data-slot="screen-head"] h1',
} as const;

const SHELL: readonly Metric[] = [
  pair('rail width', '.desk .rail', 'nav[data-slot="tab-bar"]', 'width', 1),
  pair('nav item height', '.desk .nav-item', '[data-slot="nav-place"]', 'height', 1, { index: 1 }),
  pair('title size', '.desk .topbar h1', S.head, 'fontSize', 0.5),
  pair('search pill height', '.desk .search', '[data-slot="search-pill"]', 'height', 1),
  atLeast('search pill width', '[data-slot="search-pill"]', 'width', 280),
  pair(
    'month arrows',
    '.desk .month-pick .round',
    '[data-slot="month-picker"] [data-variant="round"]',
    'width',
    1,
  ),
];

const BOARD: readonly Metric[] = [
  pair('board x', '.desk .board', S.board, 'x', 2),
  pair('board width', '.desk .board', S.board, 'width', 2),
  pair('board columns', '.desk .board', S.board, 'columns', 0),
  pair('board gap', '.desk .board', S.board, 'columnGap', 1),
];

const BALANCE: readonly Metric[] = [
  pair('balance width', '.desk .bal', S.balance, 'width', 2),
  pair('balance y', '.desk .bal', S.balance, 'y', 6),
  pair('balance height', '.desk .bal', S.balance, 'height', 12),
  pair('balance radius', '.desk .bal', S.balance, 'radius', 1),
  pair('balance padding block', '.desk .bal', S.balance, 'paddingBlockStart', 1),
  pair('balance padding inline', '.desk .bal', S.balance, 'paddingInlineStart', 1),
  pair('balance gap below', '.desk .bal', S.balance, 'gapBelow', 1),
  pair('balance title size', '.desk .bal h2', `${S.balance} h2`, 'fontSize', 0.5),
  pair('balance numeral size', '.desk .bal .mega', `${S.balance} > * [data-numeral]`, 'fontSize', 0.02, REL),
  pair('balance numeral bleed', '.desk .bal .mega', `${S.balance} > * [data-numeral]`, 'overflowBottom', 1.5),
  pair('balance numeral x', '.desk .bal .mega', `${S.balance} > * [data-numeral]`, 'x', 8),
  pair('first account tilt', '.desk .acct', S.account, 'rotate', 0.05, { index: 0 }),
  pair('second account tilt', '.desk .acct', S.account, 'rotate', 0.05, { index: 1 }),
  pair('first account x', '.desk .acct', S.account, 'x', 4, { index: 0 }),
  pair('second account x', '.desk .acct', S.account, 'x', 4, { index: 1 }),
  pair('account width', '.desk .acct', S.account, 'width', 4),
  pair('account radius', '.desk .acct', S.account, 'radius', 1),
];

const MONTH: readonly Metric[] = [
  pair('month x', '.desk .month', S.month, 'x', 2),
  pair('month width', '.desk .month', S.month, 'width', 2),
  pair('month radius', '.desk .month', S.month, 'radius', 1),
  pair('month title size', '.desk .month h2', `${S.month} h2`, 'fontSize', 0.5),
  pair('left numeral size', '.desk .month .mega', S.left, 'fontSize', 0.02, REL),
  pair('left numeral bleed', '.desk .month .mega', S.left, 'overflowBottom', 1.5),
];

const CATEGORIES: readonly Metric[] = [
  pair('categories x', '.desk .cats', S.categories, 'x', 2),
  pair('categories width', '.desk .cats', S.categories, 'width', 2),
  pair('categories radius', '.desk .cats', S.categories, 'radius', 1),
  pair('categories title size', '.desk .cats h2', `${S.categories} h2`, 'fontSize', 0.5),
  pair('hue bar height', '.desk .bars .bar i', S.bar, 'height', 1),
  pair('largest bar width', '.desk .bars .bar i', S.bar, 'width', 4, { index: 0 }),
  pair('second bar width', '.desk .bars .bar i', S.bar, 'width', 4, { index: 1 }),
];

const TRANSACTIONS: readonly Metric[] = [
  pair('transactions x', '.desk .tx-sheet', S.transactions, 'x', 2),
  pair('transactions width', '.desk .tx-sheet', S.transactions, 'width', 2),
  pair('transactions radius', '.desk .tx-sheet', S.transactions, 'radius', 1),
  pair('hue pill width', '.desk .tx .sq', '[data-slot="hue-pill"]', 'width', 1),
  pair('hue pill height', '.desk .tx .sq', '[data-slot="hue-pill"]', 'height', 1),
  pair('row height', '.desk .tx', `${S.transactions} [role="listitem"]`, 'height', 4),
  pair('merchant size', '.desk .tx .merchant', `${S.transactions} [data-slot="row-title"]`, 'fontSize', 0.5),
  pair('chip height', '.desk .tx .chip', `${S.transactions} [data-slot="chip"]`, 'height', 1),
  pair('chip text', '.desk .tx .chip', `${S.transactions} [data-slot="chip"]`, 'fontSize', 0.5),
  pair('day heading size', '.desk .day', '[data-slot="day-heading"]', 'fontSize', 0.5),
];

const WALLET: readonly Metric[] = [
  pair('wallet x', '.desk .wallet', S.wallet, 'x', 2),
  pair('wallet width', '.desk .wallet', S.wallet, 'width', 2),
  pair('wallet title size', '.desk .wallet h2', `${S.wallet} h2`, 'fontSize', 0.5),
  pair('card sheet radius', '.desk .cardsheet', S.card, 'radius', 1),
  pair('card sheet height', '.desk .cardsheet', S.card, 'height', 4),
  pair('card gap', '.desk .cardsheet', S.card, 'gapBelow', 1),
  pair('card numeral size', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'fontSize', 0.02, REL),
  pair('card numeral bleed', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'overflowBottom', 1.5),
  pair('first card figure x', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'x', 8, { index: 0 }),
  pair('second card figure x', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'x', 8, { index: 1 }),
  pair('cash radius', '.desk .cashsheet', S.cash, 'radius', 1),
  pair('cash numeral size', '.desk .cashsheet .mega', `${S.cash} [data-numeral]`, 'fontSize', 0.02, REL),
  pair('cash numeral bleed', '.desk .cashsheet .mega', `${S.cash} [data-numeral]`, 'overflowBottom', 1.5),
];

const MIRRORED = [...BOARD, ...BALANCE, ...MONTH, ...CATEGORIES, ...TRANSACTIONS, ...WALLET].filter(
  (m) => 'concept' in m && (m.app.prop === 'x' || m.app.prop === 'width'),
);

const waitFor = (selector: string) => async (page: Page) => {
  // Absence is a finding, not a hang: the metrics and inventory report what is missing.
  await page
    .locator(selector)
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
};

const ISSUERS = ['money-isracard', 'money-max', 'money-cal', 'money-diners', 'money-amex'];
const BANKS = ['money-leumi', 'money-discount', 'money-mizrahi', 'money-hapoalim'];
const TEN_HUES = [
  'hue-indigo',
  'hue-green',
  'hue-vermilion',
  'hue-amber',
  'hue-orange',
  'hue-cyan',
  'hue-violet',
  'hue-rose',
  'hue-magenta',
  'hue-teal',
];

export const SCREENS: readonly ScreenSpec[] = [
  // ---- The feed, against the concept's desktop home ----
  {
    id: 'shell-desktop',
    size: 'desktop',
    route: '/',
    concept: { kind: 'desk' },
    compare: 'metrics',
    metrics: SHELL,
  },
  {
    id: 'feed-desktop',
    size: 'desktop',
    route: '/',
    concept: { kind: 'desk' },
    expect: { navItem: 7 },
    metrics: [...SHELL, ...BOARD, ...BALANCE, ...MONTH, ...CATEGORIES, ...TRANSACTIONS, ...WALLET],
  },
  {
    id: 'feed-balance',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .bal' },
    appScope: S.balance,
    metrics: BALANCE,
  },
  {
    id: 'feed-month',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .month' },
    appScope: S.month,
    metrics: MONTH,
  },
  {
    id: 'feed-categories',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .cats' },
    appScope: S.categories,
    metrics: CATEGORIES,
  },
  {
    id: 'feed-transactions',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .tx-sheet' },
    appScope: S.transactions,
    metrics: TRANSACTIONS,
  },
  {
    id: 'feed-wallet',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .wallet' },
    appScope: S.wallet,
    metrics: WALLET,
  },
  {
    id: 'feed-desktop-en',
    size: 'desktop',
    route: '/',
    lang: 'en',
    concept: { kind: 'desk' },
    compare: 'metrics',
    mirror: true,
    metrics: MIRRORED,
  },
  {
    id: 'feed-phone',
    size: 'phone',
    route: '/',
    expect: {
      sheet: 15,
      numeral: 8,
      mark: 8,
      hueBar: 8,
      cardSheet: 5,
      accountSheet: 5,
      huePill: 8,
      dayHeading: 3,
      round: 3,
    },
    metrics: [
      want('screen name', S.head, 'fontSize', 76, 0.5),
      want('gutter', S.balance, 'x', 12, 1),
      want('sheet radius', S.balance, 'radius', 36, 1),
      want('sheet gap', S.balance, 'gapBelow', 8, 1),
      want('balance numeral', `${S.balance} > * [data-numeral]`, 'fontSize', 118, 0.02, REL),
      want('balance bleed', `${S.balance} > * [data-numeral]`, 'overflowBottom', 4.52, 1.5),
      want('left numeral', S.left, 'fontSize', 96, 0.02, REL),
      want('card sheet height', S.card, 'height', 124, 2),
      want('card sheet radius', S.card, 'radius', 34, 1),
      want('card numeral', `${S.card} [data-numeral]`, 'fontSize', 92, 0.02, REL),
      want('cash numeral', `${S.cash} [data-numeral]`, 'fontSize', 96, 0.02, REL),
    ],
    mustShow: ['sapphire', 'money-cash', ...ISSUERS, ...BANKS, 'hue-indigo'],
  },
  {
    id: 'feed-empty-desktop',
    size: 'desktop',
    route: '/',
    state: 'empty',
    concept: { kind: 'desk', source: 'empty' },
    metrics: [...SHELL, ...BOARD],
  },
  {
    id: 'feed-empty-phone',
    size: 'phone',
    route: '/',
    state: 'empty',
    concept: { kind: 'phone', index: 0, source: 'empty' },
    metrics: [
      want('screen name', S.head, 'fontSize', 76, 0.5),
      want('sheet radius', S.balance, 'radius', 36, 1),
    ],
  },
  {
    id: 'cards-empty-phone',
    size: 'phone',
    route: '/cards',
    state: 'empty',
    concept: { kind: 'phone', index: 1, source: 'empty' },
    metrics: [
      pair(
        'summary numeral',
        '.ph-sum .mega',
        '[data-slot="cards-summary"] [data-numeral]',
        'fontSize',
        0.02,
        REL,
      ),
    ],
  },
  ...(['cash', 'categories', 'chart', 'commitments', 'bank-accounts'] as const).map((name) => ({
    id: `${name}-empty`,
    size: 'desktop' as const,
    route: `/${name}`,
    state: 'empty' as const,
    concept: { kind: 'element' as const, selector: `[data-empty="${name}"]`, source: 'empty' as const },
    appScope: `[data-empty="${name}"]`,
    metrics: [],
  })),
  {
    id: 'feed-board',
    size: 'board',
    route: '/',
    metrics: [
      want('board columns', S.board, 'columns', 12, 0),
      want('balance in one column', S.balance, 'columns', 1, 0),
      want('month span 5', S.month, 'width', 290.7, 2),
      want('categories span 7', S.categories, 'width', 413.3, 2),
    ],
  },
  {
    id: 'feed-vast',
    size: 'vast',
    route: '/',
    metrics: [
      atLeast('content box', '[data-slot="content-box"]', 'width', 1600),
      want('board columns', S.board, 'columns', 12, 0),
      want('accounts column', S.accounts, 'width', 520, 4),
      want('balance numeral', `${S.balance} > * [data-numeral]`, 'fontSize', 252, 0.02, REL),
    ],
  },

  // ---- Cards ----
  {
    id: 'cards-phone',
    size: 'phone',
    route: '/cards',
    concept: { kind: 'phone', index: 0 },
    metrics: [
      pair('screen name', '.ph-head h1', S.head, 'fontSize', 0.5),
      pair(
        'add pill height',
        '.ph-head .pill',
        '[data-slot="screen-head"] [data-variant="pill-solid"]',
        'height',
        1,
      ),
      pair('summary x', '.ph-sum', '[data-slot="cards-summary"]', 'x', 2),
      pair('summary width', '.ph-sum', '[data-slot="cards-summary"]', 'width', 2),
      pair('summary radius', '.ph-sum', '[data-slot="cards-summary"]', 'radius', 1),
      pair('summary gap below', '.ph-sum', '[data-slot="cards-summary"]', 'gapBelow', 1),
      pair(
        'summary numeral',
        '.ph-sum .mega',
        '[data-slot="cards-summary"] [data-numeral]',
        'fontSize',
        0.02,
        REL,
      ),
      pair(
        'summary bleed',
        '.ph-sum .mega',
        '[data-slot="cards-summary"] [data-numeral]',
        'overflowBottom',
        1.5,
      ),
      pair('card sheet radius', '.ph-cards .cardsheet', S.card, 'radius', 1),
      pair('card sheet height', '.ph-cards .cardsheet', S.card, 'height', 2),
      pair('card numeral', '.ph-cards .cardsheet .mega', `${S.card} [data-numeral]`, 'fontSize', 0.02, REL),
      pair('card bleed', '.ph-cards .cardsheet .mega', `${S.card} [data-numeral]`, 'overflowBottom', 1.5),
    ],
  },
  {
    id: 'cards-desktop',
    size: 'desktop',
    route: '/cards',
    expect: { cardSheet: 5, numeral: 6, mark: { atLeast: 6 }, sheet: { atLeast: 7 } },
    metrics: [
      want('summary width', '[data-slot="cards-summary"]', 'width', 1136, 2),
      want('summary radius', '[data-slot="cards-summary"]', 'radius', 56, 1),
      want('summary numeral', '[data-slot="cards-summary"] [data-numeral]', 'fontSize', 252, 0.02, REL),
      want('card sheets column', '[data-slot="card-sheets"]', 'width', 656, 2),
      want('details column', '[data-slot="card-details"]', 'width', 464, 2),
      want('card sheet radius', S.card, 'radius', 36, 1),
      want('card gap', S.card, 'gapBelow', 8, 1),
      want('card numeral', `${S.card} [data-numeral]`, 'fontSize', 104, 0.02, REL),
    ],
    mustShow: ISSUERS,
  },
  {
    id: 'card-page-desktop',
    size: 'desktop',
    route: '/cards?card=concept.card.max',
    setup: waitFor('[data-slot="card-details"] [data-slot="card-face"]'),
    appScope: '[data-slot="card-details"]',
    metrics: [
      want('face radius', '[data-slot="card-details"] [data-slot="card-face"]', 'radius', 22, 1),
      atLeast('face width', '[data-slot="card-details"] [data-slot="card-face"]', 'width', 300),
    ],
    mustShow: ['money-max'],
  },
  {
    id: 'card-page-phone',
    size: 'phone',
    route: '/cards?card=concept.card.max',
    setup: waitFor('[data-slot="editor-panel"] [data-slot="card-face"]'),
    appScope: '[data-slot="editor-panel"]',
    metrics: [want('face radius', '[data-slot="editor-panel"] [data-slot="card-face"]', 'radius', 22, 1)],
    mustShow: ['money-max'],
  },

  // ---- Cash ----
  {
    id: 'cash-desktop',
    size: 'desktop',
    route: '/cash',
    expect: { numeral: 1, sheet: { atLeast: 4 } },
    metrics: [
      want('pot width', S.cash, 'width', 1136, 2),
      want('pot radius', S.cash, 'radius', 44, 1),
      want('pot numeral', `${S.cash} [data-numeral]`, 'fontSize', 150, 0.02, REL),
      want('person sheet width', '[data-slot="cash-person"]', 'width', 368, 2),
      want('person pill', '[data-slot="cash-person"] [data-variant="pill"]', 'height', 48, 1),
    ],
    mustShow: ['money-cash'],
  },
  {
    id: 'cash-phone',
    size: 'phone',
    route: '/cash',
    expect: { numeral: 1 },
    metrics: [
      want('pot radius', S.cash, 'radius', 36, 1),
      want('pot numeral', `${S.cash} [data-numeral]`, 'fontSize', 96, 0.02, REL),
    ],
    mustShow: ['money-cash'],
  },

  // ---- Categories, Chart, Commitments, Bank accounts, Settings ----
  {
    id: 'categories-desktop',
    size: 'desktop',
    route: '/categories',
    expect: { hueBar: 12, huePill: { atLeast: 24 } },
    metrics: [
      want('expense column', '[data-slot="categories-expense"]', 'width', 560, 2),
      want('row hue pill', '[data-slot="category-row"] [data-slot="hue-pill"]', 'height', 40, 1),
    ],
    mustShow: TEN_HUES,
  },
  {
    id: 'categories-phone',
    size: 'phone',
    route: '/categories',
    expect: { huePill: { atLeast: 24 } },
    metrics: [want('row hue pill', '[data-slot="category-row"] [data-slot="hue-pill"]', 'height', 40, 1)],
    mustShow: TEN_HUES,
  },
  {
    id: 'chart-desktop',
    size: 'desktop',
    route: '/chart',
    expect: { hueBar: 5, mark: 3 },
    metrics: [
      want('plot width', '[data-slot="chart-sheet"]', 'width', 752, 2),
      want('stats width', '[data-slot="chart-stats"]', 'width', 368, 2),
    ],
    mustShow: ['hue-indigo', 'hue-green'],
  },
  {
    id: 'chart-phone',
    size: 'phone',
    route: '/chart',
    expect: { hueBar: 5, mark: 3 },
    metrics: [want('sheet radius', '[data-slot="chart-sheet"]', 'radius', 36, 1)],
    mustShow: ['hue-indigo', 'hue-green'],
  },
  {
    id: 'commitments-desktop',
    size: 'desktop',
    route: '/commitments',
    expect: { sheet: { atLeast: 2 } },
    metrics: [
      want('list width', '[data-slot="commitments-list"]', 'width', 752, 2),
      want('totals width', '[data-slot="commitments-totals"]', 'width', 368, 2),
    ],
  },
  {
    id: 'commitments-phone',
    size: 'phone',
    route: '/commitments',
    expect: { sheet: { atLeast: 2 } },
    metrics: [want('list radius', '[data-slot="commitments-list"]', 'radius', 36, 1)],
  },
  {
    id: 'bank-accounts-desktop',
    size: 'desktop',
    route: '/bank-accounts',
    expect: { sheet: { atLeast: 4 }, mark: { atLeast: 4 } },
    metrics: [
      want('account sheet width', '[data-slot="bank-account-sheet"]', 'width', 368, 2),
      want('account sheet radius', '[data-slot="bank-account-sheet"]', 'radius', 56, 1),
    ],
    mustShow: BANKS,
  },
  {
    id: 'bank-accounts-phone',
    size: 'phone',
    route: '/bank-accounts',
    expect: { sheet: { atLeast: 4 } },
    metrics: [want('account sheet radius', '[data-slot="bank-account-sheet"]', 'radius', 36, 1)],
    mustShow: BANKS,
  },
  {
    id: 'settings-desktop',
    size: 'desktop',
    route: '/settings',
    setup: waitFor('[data-slot="settings-subject"]'),
    metrics: [
      want('subjects width', '[data-slot="settings-subjects"]', 'width', 368, 2),
      want('subject width', '[data-slot="settings-subject"]', 'width', 752, 2),
      want('subject pill', '[data-slot="settings-subjects"] a', 'height', 48, 1),
    ],
  },
  {
    id: 'settings-phone',
    size: 'phone',
    route: '/settings',
    // On a phone the subjects keep their one-line hints, so a row is at least a pill's height.
    metrics: [atLeast('subject row', '[data-slot="settings-subjects"] a', 'height', 48)],
  },

  // ---- Panels and pop-outs ----
  {
    id: 'panel-add-desktop',
    size: 'desktop',
    route: '/?add=expense',
    setup: waitFor('[data-slot="editor-panel"]'),
    appScope: '[data-slot="editor-panel"]',
    metrics: [
      want('panel width', '[data-slot="editor-panel"]', 'width', 480, 1),
      want('panel radius', '[data-slot="editor-panel"]', 'radius', 56, 1),
      want('header padding', '[data-slot="editor-panel-header"]', 'paddingInlineStart', 28, 0),
      want('body padding', '[data-slot="editor-panel-body"]', 'paddingInlineStart', 28, 0),
      want('cancel height', '[data-slot="editor-actions"] [data-variant="pill"]', 'height', 48, 1),
      want('save height', '[data-slot="editor-actions"] [data-variant="pill-solid"]', 'height', 48, 1),
      atLeast('save width', '[data-slot="editor-actions"] [data-variant="pill-solid"]', 'width', 150),
    ],
    mustShow: ['sapphire'],
  },
  {
    id: 'panel-add-phone',
    size: 'phone',
    route: '/?add=expense',
    setup: waitFor('[data-slot="editor-panel"]'),
    appScope: '[data-slot="editor-panel"]',
    metrics: [
      want('header padding', '[data-slot="editor-panel-header"]', 'paddingInlineStart', 20, 0),
      want('body padding', '[data-slot="editor-panel-body"]', 'paddingInlineStart', 20, 0),
      want('save height', '[data-slot="editor-actions"] [data-variant="pill-solid"]', 'height', 48, 1),
    ],
    mustShow: ['sapphire'],
  },
  {
    id: 'popout-import-desktop',
    size: 'desktop',
    route: '/?import=1',
    setup: waitFor('[data-slot="popout"]'),
    concept: { kind: 'dialog' },
    compare: 'metrics',
    metrics: [
      pair('dialog width', '.deskmodal .dialog', '[data-slot="popout"]', 'width', 2),
      pair('dialog height', '.deskmodal .dialog', '[data-slot="popout"]', 'height', 2),
      pair('dialog radius', '.deskmodal .dialog', '[data-slot="popout"]', 'radius', 1),
      pair('panes', '.deskmodal .dialog', '[data-slot="popout-layout"]', 'columns', 0),
      pair('steps width', '.deskmodal .steps', '[data-slot="popout-steps"]', 'width', 2),
      pair('preview width', '.deskmodal .preview', '[data-slot="popout-preview"]', 'width', 2),
      pair('preview radius', '.deskmodal .preview', '[data-slot="popout-preview"]', 'radius', 1),
      pair('question size', '.deskmodal .wz-q h2', '[data-slot="popout-body"] h2', 'fontSize', 0.5),
      pair(
        'footer pill height',
        '.deskmodal .wz-foot .pill',
        '[data-slot="popout-actions"] [data-variant]',
        'height',
        1,
      ),
    ],
  },
  {
    id: 'popout-add-card-desktop',
    size: 'desktop',
    route: '/cards?add=card',
    concept: { kind: 'dialog' },
    metrics: [],
    reserved: 'The add-card flow lands from branch add-card-flow (plan Task 21).',
  },
  {
    id: 'add-card-phone',
    size: 'phone',
    route: '/cards?add=card',
    concept: { kind: 'phone', index: 1 },
    metrics: [],
    reserved: 'The add-card flow lands from branch add-card-flow (plan Task 21).',
  },
];
