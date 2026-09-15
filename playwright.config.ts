import { defineConfig, devices } from '@playwright/test';

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
    { name: 'en', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
    { name: 'he', use: { ...devices['Desktop Chrome'], locale: 'he-IL' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], locale: 'en-US' } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
