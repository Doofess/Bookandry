import { FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import type { WireRequest, WireUsage } from '@/domain/import-wire';

/** Why a read did not come back, as the function names it - or offline when it was never reached. */
export type ExtractError =
  | 'offline'
  | 'aborted'
  | 'unauthorized'
  | 'invalid'
  | 'too_large'
  | 'quota'
  | 'not_configured'
  | 'refused'
  | 'partial'
  | 'timeout'
  | 'upstream';

export type ExtractOutcome =
  | { readonly ok: true; readonly result: unknown; readonly usage: WireUsage }
  | { readonly ok: false; readonly error: ExtractError; readonly usage?: WireUsage };

const KNOWN = new Set<ExtractError>([
  'unauthorized',
  'invalid',
  'too_large',
  'quota',
  'not_configured',
  'refused',
  'partial',
  'timeout',
  'upstream',
]);

const usageOf = (value: unknown): WireUsage | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const u = value as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return { in: n(u.in), out: n(u.out), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) };
};

/**
 * One call to the `extract-transactions` function (supabase/functions). The
 * answer is returned raw: the caller checks it again with the same
 * `import-wire` checks the function ran, and trusts nothing it did not check.
 */
export async function callExtract(
  supabase: SupabaseClient,
  request: WireRequest,
  signal?: AbortSignal,
): Promise<ExtractOutcome> {
  const result = await supabase.functions.invoke('extract-transactions', {
    body: request,
    ...(signal === undefined ? {} : { signal }),
  });
  if (result.error === null) {
    const data = result.data as { result?: unknown; usage?: unknown } | null;
    const usage = usageOf(data?.usage);
    if (data?.result === undefined || usage === undefined) return { ok: false, error: 'upstream' };
    return { ok: true, result: data.result, usage };
  }
  if (signal?.aborted === true) return { ok: false, error: 'aborted' };
  if (result.error instanceof FunctionsFetchError) return { ok: false, error: 'offline' };
  if (result.error instanceof FunctionsHttpError) {
    const response = result.error.context as Response;
    const body = (await response.json().catch(() => undefined)) as
      { error?: unknown; usage?: unknown } | undefined;
    const code =
      typeof body?.error === 'string' && KNOWN.has(body.error as ExtractError)
        ? (body.error as ExtractError)
        : 'upstream';
    const usage = usageOf(body?.usage);
    return usage === undefined ? { ok: false, error: code } : { ok: false, error: code, usage };
  }
  return { ok: false, error: 'upstream' };
}
