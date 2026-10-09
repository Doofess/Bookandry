/// <reference types="vitest" />

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { fontPreloadTags } from './src/lib/font-preload';
import { headersFile, inlineScripts } from './src/lib/security-headers';

/**
 * Rate providers are deliberately NOT cached by the service worker.
 * Dexie (`ratesTables`) is the single rates cache with a 12h TTL; a second
 * Workbox cache would disagree about freshness and make `fetchedAt` a lie.
 */
const RATE_PROVIDER_HOSTS = /^https:\/\/(api\.frankfurter\.dev|open\.er-api\.com)\//;

/**
 * Supabase is never cached either, and for a sharper reason: its responses
 * carry session tokens and account data. A cached auth or RPC response would
 * outlive a sign-out, and could serve one account's answer to the next person
 * on a shared device.
 */
const SUPABASE_HOSTS = /^https:\/\/[a-z0-9-]+\.supabase\.co\//;

/**
 * The file readers "Add with AI" loads - SheetJS, pdf.js, pdf-lib, mammoth -
 * are megabytes the app never needs to open, so they are kept out of the
 * install: named `import-*` here, left out of the precache, and fetched the
 * first time someone reads a file (which needs the network anyway), then
 * kept by a runtime cache.
 */
const IMPORT_READERS = /node_modules\/(xlsx|pdfjs-dist|pdf-lib|mammoth)\//;

/**
 * Writes dist/_headers - the CSP and friends - for Cloudflare, hashing
 * the inline scripts of the index.html actually being shipped. See
 * src/lib/security-headers.ts.
 */
function securityHeaders(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'bookandry:security-headers',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') throw new Error('security-headers: index.html is not in the bundle');
      const html = typeof index.source === 'string' ? index.source : new TextDecoder().decode(index.source);
      const scriptHashes = inlineScripts(html).map((script) =>
        createHash('sha256').update(script, 'utf8').digest('base64'),
      );
      const supabaseOrigin =
        supabaseUrl?.startsWith('https://') === true ? new URL(supabaseUrl).origin : undefined;
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: headersFile({ scriptHashes, supabaseOrigin }),
      });
    },
  };
}

/** Adds the Karantina preloads to the built index.html (src/lib/font-preload.ts). */
function preloadDisplayFont(): Plugin {
  return {
    name: 'bookandry:preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (_html, context) => fontPreloadTags(Object.keys(context.bundle ?? {})),
    },
  };
}

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => IMPORT_READERS.test(id))
            ? 'assets/import-[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  plugins: [
    react(),
    tailwindcss(),
    preloadDisplayFont(),
    securityHeaders(loadEnv(mode, process.cwd(), 'VITE_')['VITE_SUPABASE_URL']),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by main.tsx, after its check that this page is not already
      // leaving for https://bookandry.com - never on http or www.
      injectRegister: false,
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Bookandry',
        short_name: 'Bookandry',
        description: 'Local-first personal money manager',
        // The manifest is read once at install time and cannot switch locale
        // afterwards, so the installed app name stays English in both languages.
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // "Add with AI" from the phone's Share menu: a screenshot or a statement
        // shared to the installed app lands in its import sheet
        // (public/share-target-sw.js receives it). Android only; iOS has none.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'files',
                accept: [
                  'image/*',
                  'application/pdf',
                  '.xlsx',
                  '.xls',
                  '.csv',
                  '.docx',
                  '.txt',
                  'text/csv',
                  'text/comma-separated-values',
                  'text/plain',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'application/vnd.ms-excel',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                ],
              },
            ],
          },
        },
        // The paper (§3): the splash and the title bar of the installed app.
        background_color: '#F6F2EA',
        theme_color: '#F6F2EA',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The app's main chunk is precached whole, or it would not start offline. It
        // passed Workbox's 2 MiB default once the business-type code (not its names,
        // which are their own chunk) was added, so the limit leaves room to grow.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Images for the account's emails (scripts/emails.mjs): read by mail
        // clients from the site, never by the app, so not worth a download.
        // Cyrillic-ext font files: neither face covers basic Cyrillic anyway,
        // and a page that needs the extended block fetches it online (§2.4).
        globIgnores: ['email/**', 'assets/import-*', 'assets/*-cyrillic-ext-*.woff2'],
        // Runs before Workbox's own routes: it answers the Share menu's POST and nothing else.
        importScripts: ['share-target-sw.js'],
        cleanupOutdatedCaches: true,
        // A new version takes over as soon as it is downloaded; open pages reload
        // into it when nothing is lost by doing so (src/app/sw-update.ts).
        skipWaiting: true,
        clientsClaim: false,
        navigateFallback: '/index.html',
        // The privacy policy and terms are pages of their own (public/), not the app.
        navigateFallbackDenylist: [/^\/(privacy|terms)(\.html)?$/],
        runtimeCaching: [
          { urlPattern: RATE_PROVIDER_HOSTS, handler: 'NetworkOnly' },
          { urlPattern: SUPABASE_HOSTS, handler: 'NetworkOnly' },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/import-/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'import-readers', expiration: { maxEntries: 20 } },
          },
        ],
      },
      devOptions: {
        enabled: process.env['VITE_PWA_DEV'] === '1',
        type: 'module',
        suppressWarnings: true,
      },
    }),
  ],
  test: {
    globals: true,
    // Generous: a test file's first Postgres (PGlite, every migration run) can take seconds
    // on a machine busy running every other file at once under coverage.
    hookTimeout: 30_000,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    globalSetup: ['./src/test/global-setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/{lib,domain,i18n,data}/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/{db,services,features}/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
          setupFiles: ['./src/test/setup.db.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx', 'src/app/**/*.test.ts'],
          setupFiles: ['./src/test/setup.db.ts', './src/test/setup.dom.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/components/ui/**',
        'src/app/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/**/*.d.ts',
        'src/db/demo-data.ts',
      ],
      thresholds: {
        // Global floor is modest on purpose; the per-glob entries below are the real gate.
        lines: 60,
        functions: 60,
        branches: 55,
        statements: 60,
        // `perFile` matters: without it one exhaustively-tested module masks an
        // untested sibling and the number becomes vanity.
        'src/lib/money.ts': { lines: 100, functions: 100, branches: 100, statements: 100, perFile: true },
        'src/lib/dates.ts': { lines: 100, functions: 100, branches: 100, statements: 100, perFile: true },
        'src/domain/occurrences.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
          perFile: true,
        },
        'src/lib/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        'src/domain/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
}));
