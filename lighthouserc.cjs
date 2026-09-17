/**
 * Lighthouse, four routes, median of three runs.
 *
 * NOTE ON THE MISSING CATEGORY. `seo` is deliberately not asserted, and adding
 * it back would be a mistake rather than an improvement.
 *
 * Greenback has no public content: every route renders from the viewer's own
 * IndexedDB, behind a first-run gate, on a device with no server. `public/
 * robots.txt` therefore disallows crawling, which is the correct posture for a
 * household's spending - and Lighthouse scores exactly that as an SEO failure
 * ("Page is blocked from indexing"). Chasing the number would mean inviting
 * indexing of an app with nothing to index. The audits worth having from that
 * category - a title, a meta description, a valid `lang` - are present anyway.
 *
 * WHAT THESE RUNS DO AND DO NOT COVER. Lighthouse starts from a clean browser
 * profile, so there is no database and every route renders the first-run
 * wizard. That makes these numbers a measurement of the SHELL: bundle, fonts,
 * icons, boot script, service worker, layout stability. Populated-screen
 * accessibility is covered by the axe matrix (16 route/language/theme
 * combinations) and populated-screen performance by the feed's virtualisation
 * spec under 4x CPU throttle. Neither is measured here, and this comment exists
 * so nobody reads a 0.99 as covering them.
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm preview',
      startServerReadyPattern: 'Local:',
      url: [
        'http://localhost:4173/',
        'http://localhost:4173/chart',
        'http://localhost:4173/profiles',
        'http://localhost:4173/settings',
      ],
      numberOfRuns: 3,
      settings: { preset: 'desktop', chromeFlags: '--no-sandbox --disable-gpu' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.95, aggregationMethod: 'median' }],
        'categories:best-practices': ['error', { minScore: 0.95, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: 'artifacts/lighthouse' },
  },
};
