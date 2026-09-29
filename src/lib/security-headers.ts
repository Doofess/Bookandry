/**
 * The HTTP security headers, as a Cloudflare `_headers` file (see wrangler.jsonc).
 *
 * Built at build time (vite.config.ts) from the final index.html, so the hash
 * of the inline boot script is always the hash of the script actually
 * shipped - a hand-maintained hash drifts the first time someone edits a
 * comment in that script, and then the app renders nothing.
 *
 * Why these matter more than they did: with accounts, a script injected into
 * this page could read the local data AND use the sync keys while it runs.
 * The keys are non-extractable, so it cannot carry them off, but the CSP is
 * what stops such a script from running at all - and from sending anything
 * anywhere but the few hosts listed here.
 */
export type SecurityHeaderInput = {
  /** base64 SHA-256 of each inline <script> in index.html. */
  readonly scriptHashes: readonly string[];
  /** The Supabase project origin, when this build has accounts. */
  readonly supabaseOrigin?: string;
};

/** Exchange-rate providers the app fetches from directly. */
const RATE_ORIGINS = ['https://api.frankfurter.dev', 'https://open.er-api.com'];

export function contentSecurityPolicy(input: SecurityHeaderInput): string {
  const connect = [
    "'self'",
    ...RATE_ORIGINS,
    ...(input.supabaseOrigin === undefined ? [] : [input.supabaseOrigin]),
  ];
  const directives: readonly (readonly [string, readonly string[]])[] = [
    ['default-src', ["'self'"]],
    // The boot script by hash, never 'unsafe-inline'. 'wasm-unsafe-eval'
    // allows compiling WebAssembly (Argon2id) - and nothing else: no eval().
    ['script-src', ["'self'", ...input.scriptHashes.map((h) => `'sha256-${h}'`), "'wasm-unsafe-eval'"]],
    // The toast library injects its stylesheet at runtime. Styles cannot run
    // code; scripts are what this policy is for.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    ['connect-src', connect],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

export function headersFile(input: SecurityHeaderInput): string {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(input)}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
    // After one https visit, the browser never tries plain http again - the
    // app cannot run on an insecure page. A year; no preload list, which is
    // hard to leave.
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '',
  ].join('\n');
}

/** The inline scripts in an HTML document: what the policy must allow by hash. */
export function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    out.push(match[2] ?? '');
  }
  return out;
}
