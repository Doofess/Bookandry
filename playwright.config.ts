import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

// One folder per run for the fidelity harness's pictures and reports (e2e/fidelity/config.ts).
process.env['FIDELITY_RUN'] ??=
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${execSync('git rev-parse --short HEAD').toString().trim()}`;

/**
 * Runs against `build` + `preview`, never `dev`:
 *  - `devOptions.enabled` changes service-worker behaviour entirely, so a dev
 *    run cannot verify the PWA requirement at all;
 *  - dev's unbundled module graph changes layout timing and manufactures flake;
 *  - `pnpm verify` already builds, so preview is free.
 *
 * Playwright is installed in Phase 0 on purpose. The virtualised feed is
 * untestable in jsdom (ResizeObserver and getBoundingClientRect return 0, so the
 * virtualizer renders nothing), so without a browser harness it would go several
 * phases with no real verification at all.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0, // a local-only suite: retries hide flake instead of fixing it
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // Kills the count-up and the 150-200ms transitions, so assertions are not
    // racing animations. One spec deliberately opts out to prove the count-up
    // terminates on the correct value.
    reducedMotion: 'reduce',
    timezoneId: 'Etc/UTC',
    colorScheme: 'light',
  },
  projects: [
    { name: 'en', testIgnore: /fidelity\//, use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
    { name: 'he', testIgnore: /fidelity\//, use: { ...devices['Desktop Chrome'], locale: 'he-IL' } },
    { name: 'mobile', testIgnore: /fidelity\//, use: { ...devices['Pixel 7'], locale: 'en-US' } },
    // The fidelity harness (docs/superpowers/plans/2026-10-10-colour-of-money-phase-3.md): seeded once, then every screen.
    { name: 'fidelity-seed', testMatch: /fidelity\/seed\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'fidelity',
      testMatch: /fidelity\/.*\.spec\.ts/,
      dependencies: ['fidelity-seed'],
      // One at a time: every test opens two browsers' worth of pages and big screenshots.
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /*
   * Two builds of the same code. With accounts, nothing of the app is reachable
   * before a real sign-in, which a test cannot do - so the specs that exercise
   * the app run against a build with no Supabase configuration (4173): the
   * local-only app, which is what a build without accounts is. The account
   * specs run against the production build (4174), the one that is deployed.
   */
  webServer: [
    {
      command: 'pnpm build:local && pnpm preview:local',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    {
      command: 'pnpm build && pnpm preview',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
