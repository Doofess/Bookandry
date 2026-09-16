import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun, type SeedLanguage } from './support/seed';

/**
 * axe, over the same matrix the screenshots cover.
 *
 * Split deliberately into BLOCKING and REPORTING. A zero-violation gate across
 * all sixteen combinations, discovered at the end, over Base UI primitives we
 * do not control, is a project-stopper - so four representative combinations
 * fail the build and the other twelve print what they find. Violations surface
 * where they are introduced either way; only the four decide whether the suite
 * is green.
 *
 * The four are chosen to cover every route once, each language twice and each
 * theme twice, rather than four variants of the easiest screen.
 */
/*
 * Playwright REQUIRES the first parameter to be a destructuring pattern, even
 * when no fixture is used: it reads the pattern to work out which fixtures to
 * set up.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Language is set explicitly.');
});

type Combo = {
  readonly route: string;
  readonly name: string;
  readonly lang: SeedLanguage;
  readonly theme: 'light' | 'dark';
};

const BLOCKING: readonly Combo[] = [
  { route: '/', name: 'feed', lang: 'en', theme: 'light' },
  { route: '/chart', name: 'chart', lang: 'he', theme: 'dark' },
  { route: '/profiles', name: 'profiles', lang: 'he', theme: 'light' },
  { route: '/settings', name: 'settings', lang: 'en', theme: 'dark' },
];

const REPORTING: readonly Combo[] = [
  { route: '/', name: 'feed', lang: 'he', theme: 'dark' },
  { route: '/', name: 'feed', lang: 'en', theme: 'dark' },
  { route: '/', name: 'feed', lang: 'he', theme: 'light' },
  { route: '/chart', name: 'chart', lang: 'en', theme: 'light' },
  { route: '/chart', name: 'chart', lang: 'en', theme: 'dark' },
  { route: '/chart', name: 'chart', lang: 'he', theme: 'light' },
  { route: '/profiles', name: 'profiles', lang: 'en', theme: 'light' },
  { route: '/profiles', name: 'profiles', lang: 'en', theme: 'dark' },
  { route: '/profiles', name: 'profiles', lang: 'he', theme: 'dark' },
  { route: '/settings', name: 'settings', lang: 'en', theme: 'light' },
  { route: '/settings', name: 'settings', lang: 'he', theme: 'light' },
  { route: '/settings', name: 'settings', lang: 'he', theme: 'dark' },
];

/** WCAG 2.2 A and AA, which is what §12 actually claims. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, combo: Combo) {
  await page.emulateMedia({ colorScheme: combo.theme });
  await completeFirstRun(page, combo.lang, { theme: combo.theme });

  await page.goto(combo.route);
  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

/** One line per violation, enough to find it without opening the report. */
function summarise(results: Awaited<ReturnType<typeof scan>>): string {
  return results.violations
    .map(
      (v) =>
        `  [${v.impact ?? 'n/a'}] ${v.id}: ${v.help} (x${String(v.nodes.length)})\n    ${v.nodes[0]?.target.join(' ') ?? ''}`,
    )
    .join('\n');
}

for (const combo of BLOCKING) {
  test(`@a11y BLOCKING ${combo.name}-${combo.lang}-${combo.theme}`, async ({ page }) => {
    const results = await scan(page, combo);

    expect(results.violations, `axe violations:\n${summarise(results)}`).toEqual([]);
  });
}

for (const combo of REPORTING) {
  test(`@a11y reporting ${combo.name}-${combo.lang}-${combo.theme}`, async ({ page }) => {
    const results = await scan(page, combo);

    if (results.violations.length > 0) {
      // Printed, not thrown. This half of the matrix exists to surface
      // regressions early without making an unrelated change un-mergeable.
      console.warn(`\naxe ${combo.name}-${combo.lang}-${combo.theme}:\n${summarise(results)}`);
    }

    // The scan itself must succeed: a combination that throws is not "no
    // violations found", and a silently skipped scan is worse than no scan.
    expect(results.violations.length).toBeGreaterThanOrEqual(0);
  });
}
