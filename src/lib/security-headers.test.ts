import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, headersFile, inlineScripts } from './security-headers';

const directive = (csp: string, name: string): string[] =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

describe('the content security policy', () => {
  const csp = contentSecurityPolicy({
    scriptHashes: ['abc='],
    supabaseOrigin: 'https://eanrighmesbmboergnhj.supabase.co',
  });

  it('runs no script it was not built with', () => {
    const scripts = directive(csp, 'script-src');
    expect(scripts).toEqual(["'self'", "'sha256-abc='", "'wasm-unsafe-eval'"]);
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it('talks only to itself, the rate providers and the one Supabase project', () => {
    expect(directive(csp, 'connect-src')).toEqual([
      "'self'",
      'https://api.frankfurter.dev',
      'https://open.er-api.com',
      'https://eanrighmesbmboergnhj.supabase.co',
    ]);
    expect(directive(contentSecurityPolicy({ scriptHashes: [] }), 'connect-src')).not.toContainEqual(
      expect.stringContaining('supabase'),
    );
  });

  it('cannot be framed, and loads no plugins', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(headersFile({ scriptHashes: [] })).toMatch(/^\/\*\n {2}Content-Security-Policy: /);
  });

  it('tells browsers never to come back over plain http', () => {
    // The app cannot start on an insecure page; a phone that opened
    // http://bookandry.com got an empty screen.
    expect(headersFile({ scriptHashes: [] })).toContain(
      '  Strict-Transport-Security: max-age=31536000; includeSubDomains\n',
    );
  });
});

describe('inline scripts', () => {
  it('finds the boot script in index.html, and no module script', () => {
    const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('Pre-paint boot');
  });
});
