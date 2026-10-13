import os from 'node:os';
import path from 'node:path';

/** Where every image and report goes: outside the repo, beside the audit. */
export const OUT_ROOT =
  process.env['FIDELITY_OUT'] ?? path.join(os.homedir(), '.bookandry-private', 'design-audit', 'fidelity');

/** Pictures the user approved, for screens the concept does not draw. */
export const GOLDEN_DIR = path.join(path.dirname(OUT_ROOT), 'fidelity-goldens');

/** The approved concept, copied out of the main checkout (git-ignored there). */
export const CONCEPT_FILE =
  process.env['FIDELITY_CONCEPT'] ??
  path.join(
    os.homedir(),
    '.bookandry-private',
    'design-audit',
    'concept-source',
    'money-sheets-bold-v2.html',
  );

/** money-sheets-bold-v2.html as the user approved it on 2026-10-09. */
export const CONCEPT_SHA256 = 'bac24384aa015c1c2e02e82542166bece5c59aeb74ec022b7ce970c436687ac5';

/** The empty-account concept, drawn from the approved one (empty accounts have no approved picture otherwise). */
export const CONCEPT_EMPTY_FILE =
  process.env['FIDELITY_CONCEPT_EMPTY'] ??
  path.join(
    os.homedir(),
    '.bookandry-private',
    'design-audit',
    'concept-source',
    'money-sheets-bold-empty.html',
  );

/** money-sheets-bold-empty.html as drawn on 2026-10-10; the user approves it before screens are built to it. */
export const CONCEPT_EMPTY_SHA256 = '8449080c0746c5248b4aa4d41c5337eb041d364a5ca5dda0a4ba76a9fbfaeb3b';

/** Set once per `playwright test` in playwright.config.ts, so every worker writes to one folder. */
export const RUN_ID = process.env['FIDELITY_RUN'] ?? 'adhoc';

/** The concept's own morning: Friday 9 October 2026 in Israel. */
export const TODAY_INSTANT = '2026-10-09T09:00:00+03:00';

export const STATE = {
  household: path.join('artifacts', 'fidelity', 'concept-household.json'),
  /** The same household with English as its language, for the mirrored run. */
  householdEn: path.join('artifacts', 'fidelity', 'concept-household-en.json'),
  empty: path.join('artifacts', 'fidelity', 'empty-household.json'),
} as const;

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** desktop and phone are the concept's frames; board and vast are the spec's other container sizes. */
export type Size = 'desktop' | 'phone' | 'board' | 'vast';

export const VIEWPORT: Record<Size, { readonly width: number; readonly height: number }> = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
  board: { width: 1024, height: 768 },
  vast: { width: 1920, height: 1080 },
};

/** How tall the concept's frame is: counts and metrics are read inside it. */
export const FRAME_HEIGHT: Record<Size, number> = { desktop: 2097, phone: 844, board: 2400, vast: 2400 };

/** Downscale before the perceptual score: 1/8 on desktop, 1/4 on a phone. Calibrated (see the plan). */
export const SCALE: Record<'desktop' | 'phone', number> = { desktop: 8, phone: 4 };

export const THRESHOLDS = {
  /** Mean SSIM of OKLab lightness. */
  structure: 0.7,
  /** Histogram intersection of the token shares, "other" included. */
  palette: 0.9,
  /** How close a pixel must be to a token to count as it (OKLab distance). */
  deltaE: 0.06,
  /** A colour "is on screen" from this share of the frame. */
  colourShare: 0.0025,
  missingColours: 1,
  extraColours: 2,
  /** A screen the concept does not draw: at most this share off the concept's palette. */
  otherShare: 0.16,
  /** A screen the concept does not draw, against the picture the user approved. */
  golden: 0.9,
} as const;

/** What the concept is built from, and how each thing is found in the concept and in the app. */
export const KINDS = {
  sheet: { concept: '.sheet', app: '[data-sheet]' },
  numeral: {
    concept: '.mega',
    app: '[data-numeral]:not([data-numeral-size="account"]):not([data-numeral-size="day"])',
  },
  mark: { concept: '.mark', app: '[data-slot="mark"]' },
  hueBar: { concept: '.bars .bar i', app: '[data-slot="hue-bars"] i[data-hue]' },
  huePill: { concept: '.tx .sq', app: '[data-slot="hue-pill"]' },
  chip: { concept: '.chip', app: '[data-slot="chip"]' },
  pill: { concept: '.pill', app: '[data-variant="pill"], [data-variant="pill-solid"]' },
  round: { concept: '.round', app: '[data-variant="round"]' },
  dayHeading: { concept: '.day', app: '[data-slot="day-heading"]' },
  accountSheet: { concept: '.acct', app: '[data-slot="account-sheet"]' },
  cardSheet: { concept: '.cardsheet', app: '[data-card-sheet]' },
  navItem: { concept: '.nav-item', app: '[data-slot="nav-place"]' },
} as const;
export type Kind = keyof typeof KINDS;

export const TOLERANCE: Record<Kind, number> = {
  sheet: 1,
  numeral: 0,
  mark: 1,
  hueBar: 0,
  huePill: 1,
  chip: 2,
  pill: 1,
  round: 1,
  dayHeading: 1,
  accountSheet: 0,
  cardSheet: 0,
  navItem: 1,
};

/** The concept's tokens, by the bin name the harness reports them under. */
export const BINS: Record<string, string> = {
  paper: '--paper',
  sheet: '--sheet',
  ink: '--ink',
  box: '--box',
  night: '--night',
  sapphire: '--sapphire',
  'money-leumi': '--leumi',
  'money-hapoalim': '--hapoalim',
  'money-discount': '--discount',
  'money-mizrahi': '--mizrahi',
  'money-isracard': '--isracard',
  'money-cal': '--cal',
  'money-max': '--max',
  'money-amex': '--amex',
  'money-diners': '--diners',
  'money-cash': '--cash',
  'hue-indigo': '--k-rent',
  'hue-green': '--k-groceries',
  'hue-vermilion': '--k-dining',
  'hue-amber': '--k-kids',
  'hue-orange': '--k-transport',
  'hue-cyan': '--k-bills',
  'hue-violet': '--k-shopping',
  'hue-rose': '--k-health',
  'hue-magenta': '--k-subs',
  'hue-teal': '--k-fun',
  'hue-blue': '--k-edu',
  'hue-lime': '--k-gifts',
};
