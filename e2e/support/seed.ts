import { expect, type Page } from '@playwright/test';

/**
 * Drive the first-run wizard, with demo data.
 *
 * Seeding through the REAL wizard rather than by writing to IndexedDB from
 * `page.evaluate`: the wizard is the only thing that creates a profile, and a
 * fixture that bypasses it would let the wizard break without a single spec
 * noticing. It is also the only seeding path that exists on a cold install,
 * which is what these specs are looking at.
 *
 * The demo generator is seeded and its rate table is frozen and committed, so
 * the rows are identical run to run - which is what makes a screenshot matrix
 * reviewable rather than a diff of noise.
 */

const COPY = {
  en: { next: 'Continue', finish: 'Start tracking', demo: 'Load demo data' },
  he: { next: 'המשך', finish: 'אפשר להתחיל', demo: 'טעינת נתוני הדגמה' },
} as const;

export type SeedLanguage = keyof typeof COPY;

/**
 * Set the boot mirror BEFORE navigation, so the first paint is already correct.
 *
 * Exported for the specs that test the mirror itself. Every other caller gets
 * it from `completeFirstRun`, which sets it as part of seeding - the wizard
 * falls back to the BROWSER's language when no mirror exists, so a helper that
 * typed English copy into a `he-IL` browser project would sit there waiting for
 * a "Continue" button that says המשך.
 */
export async function bootAs(page: Page, lang: SeedLanguage, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(
    ([language, mode]) => {
      localStorage.setItem('gb.boot', JSON.stringify({ lang: language, theme: mode }));
    },
    [lang, theme] as const,
  );
}

export async function completeFirstRun(
  page: Page,
  lang: SeedLanguage,
  options: { demo?: boolean; theme?: 'light' | 'dark'; origin?: string } = {},
): Promise<void> {
  const copy = COPY[lang];
  /*
   * `origin` exists for the offline spec, which owns its own preview server so
   * that it can kill it. Everything else seeds against the suite's baseURL and
   * should never pass this.
   */
  const { demo = true, theme = 'light', origin = '' } = options;

  // Pinned here rather than left to the caller: the language the wizard renders
  // in decides which button labels below exist at all.
  await bootAs(page, lang, theme);
  await page.goto(`${origin}/`);

  // Welcome, then language + currency: both pre-filled from the mirror.
  await page.getByRole('button', { name: copy.next }).click();
  await page.getByRole('button', { name: copy.next }).click();

  // People: one profile, named. The field is required, so this is not optional.
  await page.getByRole('textbox').first().fill('Dana');
  await page.getByRole('button', { name: copy.next }).click();

  if (demo) {
    const toggle = page.getByRole('switch', { name: copy.demo });
    await toggle.click();
    // Confirmed, not assumed. A click that lands before the step has settled
    // leaves the switch off, the wizard writes one empty profile, and the
    // failure surfaces three assertions later as "the chart is empty" - which
    // reads as a chart bug and is not one.
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }

  await page.getByRole('button', { name: copy.finish }).click();

  /*
   * Wait for the SHELL, by the one landmark the wizard does not have.
   *
   * The wizard is not a route. BootGate swaps it for the shell when the profile
   * count goes above zero, and the URL is "/" throughout - so the two waits
   * that used to sit here, for the URL to leave "/welcome" and for a <main>,
   * both passed at once: the URL was never "/welcome", and the wizard has a
   * <main> of its own. With demo data the rows below covered for it. Without,
   * this returned while the wizard was still writing, and on a loaded machine
   * the caller's next step landed on the wizard: a Tab went into the wizard and
   * was lost when the shell replaced it, and a goto() reloaded before the write
   * committed and came back to the wizard, with no navigation to be found.
   *
   * The primary nav is rendered only once a profile EXISTS - the gate reads the
   * count from the committed database - so seeing it means the wizard is gone
   * and its write is durable.
   */
  await expect(page.getByRole('navigation', { name: /^(Primary|ניווט ראשי)$/ })).toBeVisible();

  // The seeded rows are what every caller is actually waiting for: the shell
  // appears as soon as the transaction commits, and the first live query lands
  // a frame or two later.
  if (demo) await expect(page.locator('[data-value]').first()).toBeAttached();
}
