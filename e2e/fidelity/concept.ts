import type { Browser, BrowserContext, Page } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BINS,
  CONCEPT_EMPTY_FILE,
  CONCEPT_EMPTY_SHA256,
  CONCEPT_FILE,
  CONCEPT_SHA256,
  FRAME_HEIGHT,
  type Theme,
} from './config';
import type { Origin } from './probe';

const FONTSOURCE = path.resolve('node_modules', '@fontsource');
const FONT_ORIGIN = 'https://fidelity-fonts.invalid';
const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const SUBSETS = [
  ['latin', LATIN],
  ['hebrew', HEBREW],
] as const;

const FACES = [
  ...SUBSETS.map(([subset, range]) => ({
    family: 'Karantina',
    weight: 700,
    file: `karantina/files/karantina-${subset}-700-normal.woff2`,
    range,
  })),
  ...[300, 400, 500, 600].flatMap((weight) =>
    SUBSETS.map(([subset, range]) => ({
      family: 'IBM Plex Sans Hebrew',
      weight,
      file: `ibm-plex-sans-hebrew/files/ibm-plex-sans-hebrew-${subset}-${String(weight)}-normal.woff2`,
      range,
    })),
  ),
];

/** The concept asks Google Fonts; the harness answers with the app's own files, so both draw alike, offline. */
async function routeFonts(context: BrowserContext): Promise<void> {
  const css = FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${String(f.weight)};font-display:block;` +
      `src:url(${FONT_ORIGIN}/${f.file}) format('woff2');unicode-range:${f.range}}`,
  ).join('\n');
  const cors = { 'access-control-allow-origin': '*' };
  await context.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', headers: cors, body: css }),
  );
  await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await context.route(`${FONT_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      headers: cors,
      path: path.join(FONTSOURCE, new URL(route.request().url()).pathname),
    }),
  );
}

export type ConceptSource = 'full' | 'empty';

const SOURCES = {
  full: { file: CONCEPT_FILE, sha256: CONCEPT_SHA256 },
  empty: { file: CONCEPT_EMPTY_FILE, sha256: CONCEPT_EMPTY_SHA256 },
} as const;

export function assertConcept(which: ConceptSource = 'full'): void {
  const { file, sha256 } = SOURCES[which];
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash !== sha256) {
    throw new Error(`${file} is not the approved concept (sha256 ${hash}). Ask the user.`);
  }
}

export type ConceptPage = { readonly context: BrowserContext; readonly page: Page };

/** 1504px wide, so the page's 1440 frames draw at scale 1 (its own fit script). */
export async function openConcept(
  browser: Browser,
  theme: Theme,
  which: ConceptSource = 'full',
): Promise<ConceptPage> {
  assertConcept(which);
  const context = await browser.newContext({
    viewport: { width: 1504, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await routeFonts(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(SOURCES[which].file).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(300);
  return { context, page };
}

export type ConceptFrame = (
  | { readonly kind: 'desk' }
  | { readonly kind: 'phone'; readonly index: 0 | 1 }
  | { readonly kind: 'element'; readonly selector: string }
  | { readonly kind: 'dialog' }
) & { readonly source?: 'empty' };

export type FrameBox = {
  /** Coordinates are measured from here (page coordinates). */
  readonly origin: Origin;
  /** What the counts are read inside. */
  readonly scope: string;
  readonly scopeIndex: number;
  /** How far down the counts reach, from the origin. */
  readonly height: number;
  /** The picture: page coordinates, for `screenshot({ fullPage: true, clip })`. */
  readonly clip: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
};

export async function frameBox(page: Page, frame: ConceptFrame): Promise<FrameBox> {
  const rect = async (selector: string, index = 0) =>
    page.evaluate(
      ([s, i]) => {
        const el = document.querySelectorAll(s)[i];
        if (el === undefined) throw new Error(`concept: no ${s}`);
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      },
      [selector, index] as const,
    );
  const desk = await rect('.desk');
  switch (frame.kind) {
    case 'desk':
      return {
        origin: desk,
        scope: '.desk',
        scopeIndex: 0,
        height: Math.min(desk.height, FRAME_HEIGHT.desktop),
        clip: { x: desk.x, y: desk.y, width: 1440, height: 900 },
      };
    case 'phone': {
      const phone = await rect('.phone', frame.index);
      // Inside the 8px bezel; the picture stops above the tab bar's foot (390×792).
      const inner = { x: phone.x + 8, y: phone.y + 8 };
      return {
        origin: inner,
        scope: '.phone',
        scopeIndex: frame.index,
        height: FRAME_HEIGHT.phone,
        clip: { ...inner, width: 390, height: 792 },
      };
    }
    case 'element': {
      const el = await rect(frame.selector);
      return { origin: desk, scope: frame.selector, scopeIndex: 0, height: FRAME_HEIGHT.desktop, clip: el };
    }
    case 'dialog': {
      const modal = await rect('.deskmodal');
      return {
        origin: modal,
        scope: '.deskmodal .dialog',
        scopeIndex: 0,
        height: 900,
        clip: { x: modal.x, y: modal.y, width: 1440, height: 900 },
      };
    }
  }
}

/** The concept's token values in the current theme, by bin name. */
export async function readTokens(page: Page): Promise<Record<string, string>> {
  return page.evaluate((bins) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(bins).map(([bin, name]) => [bin, style.getPropertyValue(name).trim()]),
    );
  }, BINS);
}
