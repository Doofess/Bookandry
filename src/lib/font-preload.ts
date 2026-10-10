/**
 * The two font files worth preloading (§2.4, decision 21): Karantina 700,
 * latin and hebrew. It draws the largest thing on the first screen, and a
 * Hebrew screen needs both files (its digits are in latin, its letters in
 * hebrew). Plex is not preloaded: its fallback face is metric-matched, so its
 * swap moves nothing.
 *
 * Two preloads, within the preload guide's limit. After the service worker
 * installs, every font comes from its cache.
 */

const KARANTINA = /^assets\/karantina-(latin|hebrew)-700-normal-[\w-]+\.woff2$/;

export type PreloadTag = {
  readonly tag: 'link';
  readonly attrs: Readonly<Record<string, string | boolean>>;
  readonly injectTo: 'head';
};

/** `<link rel="preload">` tags for the emitted Karantina files, or a build error if they are not there. */
export function fontPreloadTags(emitted: readonly string[]): PreloadTag[] {
  const files = emitted.filter((name) => KARANTINA.test(name)).sort();
  if (files.length !== 2) {
    throw new Error(
      `font-preload: expected Karantina 700's latin and hebrew woff2 in the build, found ${files.join(', ') || 'none'}`,
    );
  }
  return files.map((file) => ({
    tag: 'link',
    attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: true },
    injectTo: 'head',
  }));
}
