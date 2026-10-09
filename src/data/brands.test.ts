import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CardIssuer, CardNetwork } from '@/types/domain';

import { brandLogo } from './brands';
import { banks } from './card-catalog/banks';

const DIR = resolve(__dirname, '../assets/brands');
const FILES = readdirSync(DIR).filter((name) => name.endsWith('.svg'));

const ISSUERS: readonly Exclude<CardIssuer, 'other'>[] = ['isracard', 'cal', 'max', 'amex', 'diners'];
const NETWORKS: readonly CardNetwork[] = ['visa', 'mastercard', 'amex', 'diners', 'isracard'];

/*
 * Each file as the build serves it. Vite inlines a small file as a data: URI,
 * so a URL does not always name its file: a logo is checked against the URL
 * of the file it should be.
 */
const URLS: Readonly<Record<string, string>> = import.meta.glob<string>('/src/assets/brands/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const urlOf = (file: string) => URLS[`/src/assets/brands/${file}`];

describe('coverage', () => {
  it.each(banks.map((bank) => [bank.id, bank.name.en]))('has a logo for bank %s (%s)', (id) => {
    expect(brandLogo(`bank-${id}`)).toBeDefined();
  });

  it.each(ISSUERS)('has a logo for the card company %s', (issuer) => {
    expect(brandLogo(`issuer-${issuer}`)).toBe(urlOf(`issuer-${issuer}.svg`));
  });

  it.each(NETWORKS)('has a logo for the network %s', (network) => {
    expect(brandLogo(`network-${network}`)).toBe(urlOf(`network-${network}.svg`));
  });

  it('has none for the card company "other", or for a bank it has no file for', () => {
    expect(brandLogo('issuer-other')).toBeUndefined();
    expect(brandLogo('bank-99')).toBeUndefined();
  });

  it.each(['31', '52', '14', '46'])('shows the FIBI group bank %s by its wordmark', (id) => {
    // They share one zigzag mark: only the name in the wordmark tells them apart.
    expect(brandLogo(`bank-${id}`)).toBe(urlOf(`bank-${id}-wordmark.svg`));
  });

  it('shows every other bank by its compact mark', () => {
    expect(brandLogo('bank-10')).toBe(urlOf('bank-10.svg'));
    expect(brandLogo('bank-26')).toBe(urlOf('bank-26.svg'));
  });

  it('ships no file the registry cannot reach', () => {
    const reached = new Set(
      [
        ...banks.map((bank) => `bank-${bank.id}` as const),
        ...ISSUERS.map((issuer) => `issuer-${issuer}` as const),
        ...NETWORKS.map((network) => `network-${network}` as const),
      ].map((key) => brandLogo(key)),
    );
    expect(FILES.filter((file) => !reached.has(urlOf(file)))).toEqual([]);
  });
});

/*
 * The logos come from outside the project. Rendered through <img> an SVG can
 * neither run script nor load anything - but that is a property of how it is
 * used, and this scan keeps a future swap honest even if one were inlined.
 */
describe.each(FILES)('%s', (file) => {
  const svg = readFileSync(resolve(DIR, file), 'utf8');

  it('runs nothing and loads nothing', () => {
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg).not.toMatch(/@import/i);
    expect(svg).not.toMatch(/<!ENTITY/i);
    // A url() may point inside the file (a gradient, a mask), never outside it.
    expect(svg).not.toMatch(/url\(\s*(?!["']?#)/i);
    const hrefs = [...svg.matchAll(/\s(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gis)].map((m) => m[2] ?? '');
    for (const href of hrefs) expect(href).toMatch(/^(#|data:image\/)/);
  });

  it('stays within 64 KB', () => {
    expect(statSync(resolve(DIR, file)).size).toBeLessThanOrEqual(64 * 1024);
  });
});

it('keeps the whole set within 300 KB', () => {
  const total = FILES.reduce((sum, file) => sum + statSync(resolve(DIR, file)).size, 0);
  expect(total).toBeLessThanOrEqual(300 * 1024);
});
