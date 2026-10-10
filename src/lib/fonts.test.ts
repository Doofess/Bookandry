import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The fonts (§2): exactly the faces and weights the design uses, loaded from
 * the app itself, and nothing that asks for a weight that is not loaded.
 *
 * With `font-synthesis: none` a weight that is not loaded renders as the
 * nearest one that is, silently. `font-bold` is the one that would bite
 * (Plex 700 is not loaded), so it is banned outright.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');
const sources = (pattern: string) =>
  globSync(pattern, { cwd: ROOT })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => !/\.test\.(ts|tsx)$/.test(file));

describe('the fonts that load', () => {
  it('imports exactly Karantina 700 and Plex 300, 400, 500 and 600, per weight', () => {
    const imports = [...read('src/main.tsx').matchAll(/^import '(@fontsource[^']*)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual([
      '@fontsource/karantina/700.css',
      '@fontsource/ibm-plex-sans-hebrew/300.css',
      '@fontsource/ibm-plex-sans-hebrew/400.css',
      '@fontsource/ibm-plex-sans-hebrew/500.css',
      '@fontsource/ibm-plex-sans-hebrew/600.css',
    ]);
  });

  it('pins both packages exactly, and the old three are gone', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@fontsource/karantina']).toBe('5.3.0');
    expect(pkg.dependencies['@fontsource/ibm-plex-sans-hebrew']).toBe('5.3.0');
    expect(Object.keys(pkg.dependencies).filter((name) => name.startsWith('@fontsource-variable/'))).toEqual(
      [],
    );
  });

  it('imports none of Inter, Heebo or Frank Ruhl anywhere', () => {
    for (const file of [...sources('src/**/*.ts'), ...sources('src/**/*.tsx'), ...sources('src/**/*.css')]) {
      expect(read(file), file).not.toContain('@fontsource-variable/');
    }
  });

  it('declares both fallback faces, sized for Plex text and Karantina figures', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/font-family: 'Plex Fallback';[\s\S]*?size-adjust: 103%;/);
    expect(css).toMatch(/font-family: 'Karantina Fallback';[\s\S]*?size-adjust: 60%;/);
    expect(css).toContain('font-synthesis: none;');
  });

  it('puts Plex first in the text stack and Karantina first in the display stack', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/--font-stack-sans:\s*'IBM Plex Sans Hebrew',\s*'Plex Fallback',/);
    expect(css).toMatch(
      /--font-stack-display:\s*'Karantina',\s*'Karantina Fallback',\s*'Plex Fallback',\s*sans-serif;/,
    );
  });

  it('keeps the cyrillic-ext files out of the precache', () => {
    expect(read('vite.config.ts')).toContain("'assets/*-cyrillic-ext-*.woff2'");
  });

  it('gives the legal pages the new stack', () => {
    expect(read('public/legal.css')).toMatch(/'IBM Plex Sans Hebrew'/);
  });
});

describe('the rules the code keeps', () => {
  const code = [...sources('src/**/*.ts'), ...sources('src/**/*.tsx')];

  it('declares font-family only in index.css', () => {
    for (const file of [...code, ...sources('src/**/*.css')].filter((f) => f !== 'src/index.css')) {
      expect(read(file), file).not.toMatch(/font-family|fontFamily/);
    }
  });

  it('asks for no weight that is not loaded: no font-bold, font-extrabold, font-black, font-thin or font-extralight', () => {
    for (const file of code) {
      expect(read(file), file).not.toMatch(/\bfont-(bold|extrabold|black|thin|extralight)\b/);
    }
  });
});
