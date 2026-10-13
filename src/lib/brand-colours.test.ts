import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { oklchToSrgb, parseOklch } from './color';

/**
 * The colours that live OUTSIDE index.css: the phone's status bar, the
 * installed app's splash, the favicon and the icon backgrounds. A token
 * change cannot reach these, so they are pinned here (§3).
 */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** An oklch() token as the #RRGGBB the browser chrome is given. */
const hex = (value: string) => {
  const color = parseOklch(value);
  if (color === undefined) throw new Error(`not oklch: ${value}`);
  const channels = oklchToSrgb(color).map((channel) =>
    Math.round(channel * 255) // money-allow: a colour channel, not money
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${channels.join('')}`.toUpperCase();
};

describe('the status bar and the splash follow the paper (§3)', () => {
  it('index.html has one theme-color meta, the light paper, and supports both schemes', () => {
    const html = read('index.html');
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="theme-color" content="#F6F2EA" />');
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).not.toContain('media="(prefers-color-scheme');
  });

  it('the boot script sets it to the resolved theme’s paper before first paint', () => {
    const html = read('index.html');
    expect(html).toContain("'#1A1510'");
    expect(html).toContain("'#F6F2EA'");
    expect(html).toContain("removeAttribute('media')");
  });

  it('the boot values are the paper tokens, as hex', () => {
    expect(hex('oklch(0.962 0.012 85)')).toBe('#F6F2EA');
    expect(hex('oklch(0.2 0.012 70)')).toBe('#1A1510');
  });

  it('the manifest’s theme and background are the light paper', () => {
    const config = read('vite.config.ts');
    expect(config).toContain("theme_color: '#F6F2EA'");
    expect(config).toContain("background_color: '#F6F2EA'");
  });
});

describe('the icons do not change (decision 37)', () => {
  it('keeps the sapphire disc in the favicon and the PWA icon backgrounds', () => {
    expect(read('public/favicon.svg')).toContain('#0F3A8A');
    expect(read('pwa-assets.config.ts').match(/#0F3A8A/g)).toHaveLength(2);
  });

  it('keeps the privacy and terms pages’ link colours', () => {
    const css = read('public/legal.css');
    expect(css).toContain('--primary: oklch(0.462 0.175 262.6)');
    expect(css).toContain('--primary: oklch(0.779 0.113 259.7)');
  });
});
