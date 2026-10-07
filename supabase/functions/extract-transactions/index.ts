/**
 * "Smart import": reads the documents a person picked or shared - statements,
 * receipts, wallet notifications - and transcribes the transactions in them.
 *
 * Runs here because it needs the Anthropic API key, which lives only in this
 * project's Edge Function secrets (ANTHROPIC_API_KEY) - never in the app, the
 * repo or `.env.local`.
 *
 * Stateless, and ONE model call per request: the app runs the sequence - the
 * first read, the checks between, a correction for what failed - so each step
 * is small, cheap and bounded by Supabase's request time. Three modes:
 *  - extract: read a set of documents (a second, cheaper "check" read is the
 *    same mode with `read: 'check'`);
 *  - map: which spreadsheet column holds what, from a block's first rows;
 *  - verify: look again at the rows that failed a check, and only those.
 *
 * Only for signed-in people (`verify_jwt` plus the handler's own check), under
 * a daily cap per person kept in the database (`ai_take_quota`). Nothing that
 * is read is stored or logged: the log line is counts and timings.
 *
 * Every request and every answer goes through `_shared/import-wire.ts` - a
 * verbatim copy of the app's src/domain/import-wire.ts - so both sides check
 * the same things.
 *
 * Deployed with the Supabase MCP / CLI: `supabase functions deploy extract-transactions`.
 */
import { createSupabaseContext } from 'npm:@supabase/server';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  cleanExtract,
  cleanMap,
  cleanVerify,
  contextText,
  extractSchema,
  extractTask,
  INSTRUCTIONS,
  mapSchema,
  mapTask,
  parseWireRequest,
  verifySchema,
  verifyTask,
  type WireRequest,
  type WireSource,
  type WireUsage,
} from '../_shared/import-wire.ts';

/** Models that keep nothing by default. Anything else in the environment falls back. */
const ALLOWED = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001']);
const pick = (name: string, fallback: string): string => {
  const value = Deno.env.get(name);
  return value !== undefined && ALLOWED.has(value) ? value : fallback;
};
const EXTRACT_MODEL = pick('EXTRACT_MODEL', 'claude-sonnet-5-5');
const CHECK_MODEL = pick('CHECK_MODEL', 'claude-haiku-4-5-20251001');
const VERIFY_MODEL = pick('VERIFY_MODEL', 'claude-opus-5-5');

const ORIGINS = new Set(['https://bookandry.com', 'http://localhost:4174']);
/** About 15MB of files, as base64, plus the rest of the body. */
const MAX_BODY = 21 * 1024 * 1024;
/** Answer before Supabase's 150s limit, whatever the model does. */
const MODEL_TIMEOUT_MS = 110_000;
/** Below this the instructions are not worth a cache write (and Haiku will not cache under 4,096). */
const CACHEABLE = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** The documents as content blocks, each introduced by its label - images and PDFs before the task. */
function sourceBlocks(sources: readonly WireSource[], cacheLast: boolean): unknown[] {
  const blocks: Record<string, unknown>[] = [];
  sources.forEach((source, i) => {
    blocks.push({ type: 'text', text: `Document ${String(i)}: ${source.label}` });
    if (source.kind === 'image') {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: source.media, data: source.data } });
    } else if (source.kind === 'pdf') {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: source.data },
      });
    } else {
      blocks.push({ type: 'text', text: `<document index="${String(i)}">\n${source.text}\n</document>` });
    }
  });
  const last = blocks.at(-1);
  if (cacheLast && last !== undefined) last.cache_control = { type: 'ephemeral' };
  return blocks;
}

type Plan = {
  model: string;
  effort: 'low' | 'medium' | undefined;
  schema: unknown;
  content: unknown[];
  cache: boolean;
};

function plan(request: WireRequest): Plan {
  if (request.mode === 'extract') {
    const model = request.read === 'check' ? CHECK_MODEL : EXTRACT_MODEL;
    const maxRows = Math.max(5, Math.floor((request.maxTokens - 400) / 70));
    return {
      model,
      effort: 'low',
      schema: extractSchema(request.ctx),
      content: [
        ...sourceBlocks(request.sources, false),
        { type: 'text', text: extractTask(request, maxRows) },
      ],
      cache: request.cache,
    };
  }
  if (request.mode === 'map') {
    return {
      model: EXTRACT_MODEL,
      effort: 'low',
      schema: mapSchema(request.ctx),
      content: [{ type: 'text', text: mapTask(request) }],
      cache: false,
    };
  }
  return {
    model: VERIFY_MODEL,
    effort: 'medium',
    schema: verifySchema(
      request.ctx,
      request.disputes.map((d) => d.id),
    ),
    content: [...sourceBlocks(request.sources, false), { type: 'text', text: verifyTask(request) }],
    cache: false,
  };
}

type ModelAnswer =
  | { ok: true; json: unknown; usage: WireUsage }
  | { ok: false; code: 'refused' | 'partial' | 'upstream' | 'timeout' | 'too_large'; usage?: WireUsage };

async function ask(request: WireRequest, key: string): Promise<ModelAnswer> {
  const p = plan(request);
  const system: Record<string, unknown>[] = [
    { type: 'text', text: INSTRUCTIONS },
    { type: 'text', text: contextText(request.ctx) },
  ];
  // The instructions and the household's lists are the same for every call of
  // one import: cached when more calls are coming, on a model that caches them.
  if (p.cache && CACHEABLE.has(p.model)) system[1]!.cache_control = { type: 'ephemeral' };

  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: p.schema } };
  // Haiku takes no effort setting.
  if (p.effort !== undefined && p.model !== 'claude-haiku-4-5-20251001') outputConfig.effort = p.effort;

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        max_tokens: request.maxTokens,
        system,
        output_config: outputConfig,
        messages: [{ role: 'user', content: p.content }],
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      code: error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'upstream',
    };
  }
  if (response.status === 413) return { ok: false, code: 'too_large' };
  if (!response.ok) {
    // Never the body: it can quote the request.
    await response.body?.cancel();
    return { ok: false, code: response.status === 400 ? 'too_large' : 'upstream' };
  }
  const message = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  const usage: WireUsage = {
    in: message.usage?.input_tokens ?? 0,
    out: message.usage?.output_tokens ?? 0,
    cacheRead: message.usage?.cache_read_input_tokens ?? 0,
    cacheWrite: message.usage?.cache_creation_input_tokens ?? 0,
  };
  if (message.stop_reason === 'refusal') return { ok: false, code: 'refused', usage };
  if (message.stop_reason === 'max_tokens') return { ok: false, code: 'partial', usage };
  if (message.stop_reason !== 'end_turn') return { ok: false, code: 'upstream', usage };
  const text = message.content?.find((block) => block.type === 'text')?.text;
  try {
    return { ok: true, json: JSON.parse(text ?? ''), usage };
  } catch {
    return { ok: false, code: 'upstream', usage };
  }
}

/**
 * The body as JSON, read no further than `MAX_BODY` bytes. Content-Length is
 * the caller's claim - a chunked request has none - so the bytes are counted
 * as they arrive and reading stops at the limit, before any of it is parsed.
 */
async function readBody(req: Request): Promise<unknown | 'too_large'> {
  const reader = req.body?.getReader();
  if (reader === undefined) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return 'too_large';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

function check(request: WireRequest, json: unknown): unknown {
  if (request.mode === 'extract') return cleanExtract(json, request.sources.length, request.ctx);
  if (request.mode === 'map') {
    const cols = Math.max(...request.rows.map((row) => row.length));
    return cleanMap(json, request.rows.length, cols, request.ctx, request.merchants);
  }
  return cleanVerify(
    json,
    request.sources.length,
    request.ctx,
    request.disputes.map((d) => d.id),
  );
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    const started = Date.now();
    const headers = cors(req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405, headers });

    // A claim, checked early and cheaply; `readBody` enforces the same limit on what actually arrives.
    const length = Number(req.headers.get('content-length') ?? '0');
    if (length > MAX_BODY) return Response.json({ error: 'too_large' }, { status: 413, headers });

    const { data: ctx, error } = await createSupabaseContext(req, { auth: 'user' });
    if (error || !ctx?.userClaims) return Response.json({ error: 'unauthorized' }, { status: 401, headers });

    const body = await readBody(req);
    if (body === 'too_large') return Response.json({ error: 'too_large' }, { status: 413, headers });
    const request = parseWireRequest(body);
    if (request === undefined) return Response.json({ error: 'invalid' }, { status: 400, headers });

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (key === undefined || key === '')
      return Response.json({ error: 'not_configured' }, { status: 503, headers });

    // The caller's own session, so the cap is theirs: no service key involved.
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
      auth: { persistSession: false },
    });
    // Every call counts the same: whether one is a "follow-up" is only the caller's word.
    const quota = await db.rpc('ai_take_quota', { p_followup: false });
    if (quota.error !== null) return Response.json({ error: 'upstream' }, { status: 502, headers });
    if (quota.data === null) return Response.json({ error: 'quota' }, { status: 429, headers });

    const answer = await ask(request, key);
    if (answer.usage !== undefined) {
      await db.rpc('ai_record_tokens', {
        p_input: answer.usage.in + answer.usage.cacheWrite,
        p_output: answer.usage.out,
      });
    }
    const log = (status: number, code: string, rows = 0) => {
      console.log(
        JSON.stringify({
          status,
          code,
          mode: request.mode,
          sources: 'sources' in request ? request.sources.length : 0,
          rows,
          ms: Date.now() - started,
        }),
      );
    };

    if (!answer.ok) {
      const status = answer.code === 'too_large' ? 413 : answer.code === 'timeout' ? 504 : 502;
      log(status, answer.code);
      return Response.json({ error: answer.code, usage: answer.usage }, { status, headers });
    }
    const result = check(request, answer.json);
    if (result === undefined) {
      log(502, 'upstream');
      return Response.json({ error: 'upstream', usage: answer.usage }, { status: 502, headers });
    }
    const rows =
      typeof result === 'object' && result !== null && 'r' in result ? (result.r as unknown[]).length : 0;
    log(200, 'ok', rows);
    return Response.json({ result, usage: answer.usage }, { headers });
  },
};
