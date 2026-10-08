import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The colours that live OUTSIDE index.css: the phone's status bar, the
 * favicon and the installed icon's background. A token change cannot reach
 * these, so they are pinned here.
 */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('brand colours outside the token file', () => {
  it('index.html sets the status bar to the panel colour in each theme', () => {
    const html = read('index.html');

    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#0F3A8A" />',
    );
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B2C6B" />',
    );
    expect(html).not.toContain('content="#ffffff"');
  });

  it('the manifest theme colour is sapphire', () => {
    expect(read('vite.config.ts')).toContain("theme_color: '#0F3A8A'");
  });

  it('the favicon and the PWA icon backgrounds are sapphire', () => {
    expect(read('public/favicon.svg')).toContain('#0F3A8A');
    expect(read('public/favicon.svg')).not.toContain('#16794a');
    expect(read('pwa-assets.config.ts').match(/#0F3A8A/g)).toHaveLength(2);
  });

  it('the privacy and terms pages link in the app sapphire, not the old green', () => {
    const css = read('public/legal.css');

    expect(css).toContain('--primary: oklch(0.462 0.175 262.6)');
    expect(css).toContain('--primary: oklch(0.779 0.113 259.7)');
    expect(css).not.toMatch(/oklch\([^)]* 15[5-9]\.\d\)/);
  });
});
