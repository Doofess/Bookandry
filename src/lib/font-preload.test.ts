import { describe, expect, it } from 'vitest';

import { fontPreloadTags } from './font-preload';

const EMITTED = [
  'assets/index-AbC123.js',
  'assets/karantina-hebrew-700-normal-B9xY_1.woff2',
  'assets/karantina-latin-700-normal-Qq-2zz.woff2',
  'assets/karantina-latin-ext-700-normal-Zz9.woff2',
  'assets/karantina-latin-700-normal-Qq-2zz.woff',
  'assets/ibm-plex-sans-hebrew-latin-400-normal-x1.woff2',
];

const link = (href: string) => ({
  tag: 'link',
  attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href, crossorigin: true },
  injectTo: 'head',
});

describe('fontPreloadTags', () => {
  it('preloads Karantina 700, latin and hebrew, and nothing else (decision 21)', () => {
    expect(fontPreloadTags(EMITTED)).toEqual([
      link('/assets/karantina-hebrew-700-normal-B9xY_1.woff2'),
      link('/assets/karantina-latin-700-normal-Qq-2zz.woff2'),
    ]);
  });

  it('fails the build when the files are not there, rather than shipping no preload', () => {
    expect(() => fontPreloadTags(['assets/index-AbC123.js'])).toThrow(/Karantina/);
  });
});
