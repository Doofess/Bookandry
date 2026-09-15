/// <reference types="vitest" />

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/**
 * Rate providers are deliberately NOT cached by the service worker.
 * Dexie (`ratesTables`) is the single rates cache with a 12h TTL; a second
 * Workbox cache would disagree about freshness and make `fetchedAt` a lie.
 */
const RATE_PROVIDER_HOSTS = /^https:\/\/(api\.frankfurter\.dev|open\.er-api\.com)\//;

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Greenback',
        short_name: 'Greenback',
        description: 'Local-first personal money manager',
        // The manifest is read once at install time and cannot switch locale
        // afterwards, so the installed app name stays English in both languages.
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: '/index.html',
        runtimeCaching: [{ urlPattern: RATE_PROVIDER_HOSTS, handler: 'NetworkOnly' }],
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
          include: ['src/{lib,domain,i18n}/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/{db,services}/**/*.test.ts'],
          setupFiles: ['./src/test/setup.db.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
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
        'src/components/avatars/**',
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
});
