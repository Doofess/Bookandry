import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-local',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      'src/test/fixtures',
      // Tooling config that no tsconfig covers. Lighthouse reads it with its own
      // loader, so type-aware linting has no project to resolve it against.
      'lighthouserc.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.app.json', './tsconfig.node.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',

      'import-x/no-cycle': 'error',
      'import-x/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
    },
  },

  /*
   * Key material stays in ONE place.
   *
   * Everything that touches a key, a passphrase or a PRF secret lives in
   * src/services/crypto, where it can be read in one sitting and reviewed as a
   * whole. A `crypto.subtle` call anywhere else is key handling that escaped
   * that review. Same for the Argon2id binary, and for the Supabase client,
   * which belongs behind the transport in src/services/supabase.
   *
   * Placed BEFORE the pure-module block: in flat config a later block's
   * no-restricted-imports REPLACES this one for the files both match, so the
   * pure-module block repeats these packages in its own list.
   */
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/services/crypto/**', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'crypto',
          property: 'subtle',
          message: 'Key handling lives in src/services/crypto, and nowhere else.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/services/crypto/**',
      'src/services/supabase/**',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/test/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['hash-wasm'], message: 'Argon2id lives in src/services/crypto/kdf.ts.' },
            { group: ['@supabase/*'], message: 'The Supabase client lives in src/services/supabase.' },
          ],
        },
      ],
    },
  },

  {
    files: ['src/lib/**/*.ts', 'src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'dexie',
                'dexie-react-hooks',
                'zustand',
                'recharts',
                '@/db/*',
                '@/features/*',
                '@/store/*',
                '@/app/*',
                '@/components/*',
                'hash-wasm',
                '@supabase/*',
              ],
              message: 'Pure logic module: no framework, DB, or UI imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Pure module: no I/O.' },
        { name: 'localStorage', message: 'Pure module: no I/O.' },
        { name: 'indexedDB', message: 'Pure module: no I/O.' },
        { name: 'document', message: 'Pure module: no DOM.' },
        { name: 'window', message: 'Pure module: no DOM.' },
      ],
    },
  },

  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/clock.ts',
      'src/lib/dates.ts',
      // UUIDv7 embeds Date.now() as an opaque sortable prefix, never a calendar
      // date, so it cannot produce the drift this rule guards against.
      'src/lib/id.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/test/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name="toISOString"]',
          message:
            'Never toISOString() a calendar date: it shifts the day across timezones. Use @/lib/dates.',
        },
        {
          selector: 'MemberExpression[object.name="Date"][property.name="now"]',
          message: 'Ambient clock. Inject it via @/lib/clock or take `today` as a parameter.',
        },
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message: 'Ambient clock. Inject it via @/lib/clock or take `today` as a parameter.',
        },
        {
          selector: 'MemberExpression[property.name="randomUUID"]',
          message:
            'crypto.randomUUID is secure-context only and breaks on `vite --host`. Use newId() from @/lib/id.',
        },
      ],
    },
  },

  {
    files: ['src/lib/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'import-x/order': 'off', // generated files; do not fight the generator
      // False positives in generated primitives: Label receives htmlFor at the usage
      // site, and InputGroup's click target is a focus-forwarding affordance whose
      // real control is a sibling input. App-level a11y is enforced by axe + the
      // same rules everywhere outside this directory.
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'react-refresh/only-export-components': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/anchor-has-content': 'off',
    },
  },

  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs', 'eslint.config.js', 'vite.config.ts', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
