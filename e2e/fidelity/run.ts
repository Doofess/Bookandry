import type { Browser, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

import { frameBox, openConcept, readTokens, type FrameBox } from './concept';
import {
  FRAME_HEIGHT,
  GOLDEN_DIR,
  KINDS,
  OUT_ROOT,
  RUN_ID,
  SCALE,
  STATE,
  THRESHOLDS,
  TODAY_INSTANT,
  TOLERANCE,
  VIEWPORT,
  type Kind,
  type Theme,
} from './config';
import { countKinds, readProbe, type Origin } from './probe';
import { composeInBrowser, scoreInBrowser, toBins, type ScoreOutput } from './score';
import type { ScreenSpec } from './screens';

export type Check = {
  readonly name: string;
  readonly app: number | null;
  readonly want: string;
  readonly pass: boolean;
};

export type Report = {
  readonly screen: string;
  readonly theme: Theme;
  readonly dir: string;
  readonly inventory: Check[];
  readonly metrics: Check[];
  perceptual?: {
    structure?: number;
    palette?: number;
    other?: number;
    golden?: number;
    coloursConcept?: string[];
    coloursApp: string[];
  };
  readonly failures: string[];
};

const ZERO: Origin = { x: 0, y: 0 };
const kindsFor = (side: 'concept' | 'app') =>
  Object.fromEntries(Object.entries(KINDS).map(([kind, s]) => [kind, s[side]]));
const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

async function openApp(browser: Browser, screen: ScreenSpec, theme: Theme) {
  const lang = screen.lang ?? 'he';
  const phone = screen.size === 'phone';
  const view = VIEWPORT[screen.size];
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState:
      screen.state === 'empty' ? STATE.empty : lang === 'en' ? STATE.householdEn : STATE.household,
    locale: lang === 'he' ? 'he-IL' : 'en-US',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: theme,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    // As tall as the concept's frame for the counts, so the list renders what the concept draws.
    viewport: { width: view.width, height: Math.max(view.height, FRAME_HEIGHT[screen.size]) },
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(TODAY_INSTANT));
  await page.addInitScript(
    ([l, t]) => {
      localStorage.setItem('gb.boot', JSON.stringify({ lang: l, theme: t }));
    },
    [lang, theme] as const,
  );
  await page.goto(screen.route);
  await page.getByRole('main').waitFor();
  await screen.setup?.(page);
  await settle(page);
  return { context, page };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(400);
}

function check(name: string, app: number | null, want: number | null, tol: number, relative = false): Check {
  if (app === null || want === null)
    return { name, app, want: want === null ? 'missing in concept' : String(want), pass: false };
  const allowed = relative ? tol * want : tol;
  return {
    name,
    app,
    want: `${want.toFixed(2)} ±${allowed.toFixed(2)}`,
    pass: Math.abs(app - want) <= allowed + 1e-6,
  };
}

export async function runScreen(browser: Browser, screen: ScreenSpec, theme: Theme): Promise<Report> {
  const dir = path.join(OUT_ROOT, RUN_ID, `${screen.id}-${theme}`);
  await fs.mkdir(dir, { recursive: true });
  const report: Report = { screen: screen.id, theme, dir, inventory: [], metrics: [], failures: [] };
  const fail = (line: string) => {
    report.failures.push(line);
  };

  const concept = await openConcept(browser, theme, screen.concept?.source ?? 'full');
  const app = await openApp(browser, screen, theme);
  try {
    const bins = toBins(await readTokens(concept.page));
    const frame: FrameBox | undefined =
      screen.concept === undefined ? undefined : await frameBox(concept.page, screen.concept);
    const appScope = screen.appScope ?? 'body';

    // 1. Counts.
    const appCounts = await app.page.evaluate(countKinds, {
      kinds: kindsFor('app'),
      scope: appScope,
      scopeIndex: 0,
      origin: ZERO,
      height: frame === undefined ? 10_000_000 : frame.height,
    });
    if (frame !== undefined && screen.compare !== 'metrics') {
      const conceptCounts = await concept.page.evaluate(countKinds, {
        kinds: kindsFor('concept'),
        scope: frame.scope,
        scopeIndex: frame.scopeIndex,
        origin: frame.origin,
        height: frame.height,
      });
      for (const kind of Object.keys(KINDS) as Kind[]) {
        // A count the screen states itself replaces the comparison with the concept (the rail has 7 places, not 9).
        if (screen.expect?.[kind] !== undefined) continue;
        const c = conceptCounts[kind] ?? 0;
        const a = appCounts[kind] ?? 0;
        const result = check(kind, a, c, TOLERANCE[kind]);
        report.inventory.push(result);
        if (!result.pass)
          fail(`count ${kind}: app ${String(a)}, concept ${String(c)} ±${String(TOLERANCE[kind])}`);
      }
    }
    for (const [kind, expectation] of Object.entries(screen.expect ?? {})) {
      const a = appCounts[kind] ?? 0;
      const pass = typeof expectation === 'number' ? a === expectation : a >= expectation.atLeast;
      const want = typeof expectation === 'number' ? String(expectation) : `≥ ${String(expectation.atLeast)}`;
      report.inventory.push({ name: kind, app: a, want, pass });
      if (!pass) fail(`count ${kind}: app ${String(a)}, want ${want}`);
    }

    // 2. Metrics.
    for (const metric of screen.metrics) {
      const a = await app.page.evaluate(readProbe, { probe: metric.app, origin: ZERO });
      let result: Check;
      if ('concept' in metric) {
        let c =
          frame === undefined
            ? null
            : await concept.page.evaluate(readProbe, { probe: metric.concept, origin: frame.origin });
        if (c !== null && frame !== undefined && screen.mirror === true && metric.concept.prop === 'x') {
          const width = await concept.page.evaluate(readProbe, {
            probe: { ...metric.concept, prop: 'width' as const },
            origin: frame.origin,
          });
          c = width === null ? null : VIEWPORT.desktop.width - c - width;
        }
        result = check(metric.name, a, c, metric.tol, metric.relative);
      } else if ('expect' in metric) {
        result = check(metric.name, a, metric.expect, metric.tol, metric.relative);
      } else {
        result = {
          name: metric.name,
          app: a,
          want: `≥ ${String(metric.atLeast)}`,
          pass: a !== null && a >= metric.atLeast,
        };
      }
      report.metrics.push(result);
      if (!result.pass) fail(`metric ${result.name}: app ${String(result.app)}, want ${result.want}`);
    }

    const overflow = await app.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) fail(`sideways scroll: ${String(overflow)}px`);

    // 3. Perceptual.
    const perceptual = screen.compare !== 'metrics' && (screen.size === 'desktop' || screen.size === 'phone');
    if (perceptual) {
      const view = VIEWPORT[screen.size];
      await app.page.setViewportSize(view);
      await app.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await settle(app.page);
      const scorer = await concept.context.newPage();
      const scale = SCALE[screen.size === 'phone' ? 'phone' : 'desktop'];

      if (frame !== undefined) {
        let conceptClip = frame.clip;
        let appClip = { x: 0, y: 0, width: view.width, height: screen.size === 'phone' ? 792 : view.height };
        if (screen.concept?.kind === 'element') {
          // A missing scope is a failure to record (the shipped app has none of the sheets yet), not a hang.
          const scoped = app.page.locator(appScope).first();
          const box = (await scoped.count()) === 0 ? null : await scoped.boundingBox({ timeout: 5000 });
          const scrollY = await app.page.evaluate(() => window.scrollY);
          if (box === null) {
            fail(`app: no ${appScope}`);
            const height = Math.min(view.height, frame.clip.height);
            appClip = { x: 0, y: 0, width: view.width, height };
            conceptClip = { ...frame.clip, height };
          } else {
            const height = Math.min(box.height, frame.clip.height);
            appClip = { x: box.x, y: box.y + scrollY, width: box.width, height };
            conceptClip = { ...frame.clip, height };
          }
        }
        const conceptPng = await concept.page.screenshot({ fullPage: true, clip: conceptClip });
        // The fold, taken from the viewport at the top of the page: fullPage plus clip after the resize above
        // came out shifted (content about 570px right, its edge cut off), so a scoped element keeps page
        // coordinates and the fold is a plain viewport clip.
        const appPng =
          screen.concept?.kind === 'element'
            ? await app.page.screenshot({ fullPage: true, clip: appClip })
            : await app.page.screenshot({ clip: appClip });
        await fs.writeFile(path.join(dir, 'concept.png'), conceptPng);
        await fs.writeFile(path.join(dir, 'app.png'), appPng);
        const score: ScoreOutput = await scorer.evaluate(scoreInBrowser, {
          a: dataUrl(conceptPng),
          b: dataUrl(appPng),
          w: Math.max(8, Math.round(conceptClip.width / scale)),
          h: Math.max(8, Math.round(conceptClip.height / scale)),
          tokens: bins,
          deltaE: THRESHOLDS.deltaE,
          minShare: THRESHOLDS.colourShare,
        });
        const missing = score.coloursA.filter((c) => !score.coloursB.includes(c));
        const extra = score.coloursB.filter((c) => !score.coloursA.includes(c));
        report.perceptual = {
          structure: score.structure,
          palette: score.palette,
          coloursConcept: score.coloursA,
          coloursApp: score.coloursB,
        };
        if (score.structure < THRESHOLDS.structure)
          fail(`structure ${score.structure.toFixed(3)} < ${String(THRESHOLDS.structure)}`);
        if (score.palette < THRESHOLDS.palette)
          fail(`palette ${score.palette.toFixed(3)} < ${String(THRESHOLDS.palette)}`);
        if (missing.length > THRESHOLDS.missingColours) fail(`colours missing: ${missing.join(', ')}`);
        if (extra.length > THRESHOLDS.extraColours)
          fail(`colours the concept does not show: ${extra.join(', ')}`);
        const composed = await scorer.evaluate(composeInBrowser, {
          a: dataUrl(conceptPng),
          b: dataUrl(appPng),
          map: score.map,
          mapW: score.mapW,
          mapH: score.mapH,
          labelA: 'CONCEPT (approved v2)',
          labelB: `APP ${screen.id} ${theme}`,
        });
        await fs.writeFile(path.join(dir, 'side-by-side.png'), Buffer.from(composed, 'base64'));
      } else {
        // A screen the concept does not draw: the whole page (or the panel it scopes to) against the
        // palette, and the fold (or that panel) against the picture the user approved.
        let target = screen.appScope === undefined ? undefined : app.page.locator(screen.appScope).first();
        if (target !== undefined && (await target.count()) === 0) {
          fail(`app: no ${String(screen.appScope)}`);
          target = undefined;
        }
        const fold = target === undefined ? await app.page.screenshot() : await target.screenshot();
        const page = target === undefined ? await app.page.screenshot({ fullPage: true }) : fold;
        await fs.writeFile(path.join(dir, 'app.png'), fold);
        await fs.writeFile(path.join(dir, 'app-full.png'), page);
        const box = target === undefined ? undefined : await target.boundingBox();
        const fullWidth = box?.width ?? view.width;
        const fullHeight =
          box?.height ?? (await app.page.evaluate(() => document.documentElement.scrollHeight));
        const own: ScoreOutput = await scorer.evaluate(scoreInBrowser, {
          a: dataUrl(page),
          b: dataUrl(page),
          w: Math.max(8, Math.round(fullWidth / scale)),
          h: Math.max(8, Math.round(fullHeight / scale)),
          tokens: bins,
          deltaE: THRESHOLDS.deltaE,
          minShare: THRESHOLDS.colourShare,
        });
        const other = own.sharesA['other'] ?? 0;
        report.perceptual = { other, coloursApp: own.coloursA };
        if (other > THRESHOLDS.otherShare)
          fail(`off the palette: ${other.toFixed(3)} > ${String(THRESHOLDS.otherShare)}`);
        const absent = (screen.mustShow ?? []).filter((bin) => !own.coloursA.includes(bin));
        if (absent.length > 0) fail(`colours missing: ${absent.join(', ')}`);
        const golden = path.join(GOLDEN_DIR, `${screen.id}-${theme}.png`);
        if (process.env['FIDELITY_APPROVE'] === '1') {
          await fs.mkdir(GOLDEN_DIR, { recursive: true });
          await fs.writeFile(golden, fold);
        } else {
          const approved = await fs.readFile(golden).catch(() => undefined);
          if (approved !== undefined) {
            const score: ScoreOutput = await scorer.evaluate(scoreInBrowser, {
              a: dataUrl(approved),
              b: dataUrl(fold),
              w: Math.max(8, Math.round(fullWidth / scale)),
              h: Math.max(8, Math.round((box?.height ?? view.height) / scale)),
              tokens: bins,
              deltaE: THRESHOLDS.deltaE,
              minShare: THRESHOLDS.colourShare,
            });
            report.perceptual.golden = score.structure;
            if (score.structure < THRESHOLDS.golden)
              fail(
                `against the approved picture ${score.structure.toFixed(3)} < ${String(THRESHOLDS.golden)}`,
              );
            const composed = await scorer.evaluate(composeInBrowser, {
              a: dataUrl(approved),
              b: dataUrl(fold),
              map: score.map,
              mapW: score.mapW,
              mapH: score.mapH,
              labelA: 'APPROVED',
              labelB: `APP ${screen.id} ${theme}`,
            });
            await fs.writeFile(path.join(dir, 'side-by-side.png'), Buffer.from(composed, 'base64'));
          }
        }
      }
      await scorer.close();
    }
  } finally {
    await app.context.close();
    await concept.context.close();
  }

  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  const p = report.perceptual;
  await fs.appendFile(
    path.join(OUT_ROOT, RUN_ID, 'summary.tsv'),
    [
      screen.id,
      theme,
      report.failures.length === 0 ? 'PASS' : 'FAIL',
      String(report.failures.length),
      p?.structure?.toFixed(3) ?? '',
      p?.palette?.toFixed(3) ?? '',
      p?.golden?.toFixed(3) ?? '',
    ].join('\t') + '\n',
  );
  return report;
}
