import { z } from 'zod';

/*
 * Imported FIRST in main.tsx, for its side effect, before any module that
 * builds a schema.
 *
 * zod's fast path compiles validators with `new Function`, deciding whether it
 * may when each object schema is CONSTRUCTED - at import time, before
 * main.tsx's own body runs. The Content Security Policy forbids eval (see
 * ./security-headers.ts), so the probe fails and zod falls back anyway, but
 * only after the browser has reported a violation for it. Declaring eval off
 * before the first schema exists skips the probe entirely.
 */
z.config({ jitless: true });
