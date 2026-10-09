/**
 * Which of the person's categories an expense or income belongs in, from what
 * they typed ("Claude Max Plan" -> AI & software).
 *
 * Runs here rather than in the app because it needs the Anthropic API key,
 * which lives only in this project's Edge Function secrets
 * (ANTHROPIC_API_KEY) - never in the app, the repo or `.env.local`.
 *
 * Only for signed-in people: `verify_jwt` (the default) refuses anything
 * without a valid session before this runs, and the handler checks the user
 * again. Sent: the typed name and the names of the person's categories.
 * Answered: one of the ids it was given, or null - Claude is made to choose
 * through a tool whose input is an enum of exactly those ids, and the answer
 * is checked against them anyway - and, for an expense, the business type (a
 * 4-digit Merchant Category Code) checked against the code list this function
 * bundles (../_shared/mcc-codes.ts, a copy of the app's), or null.
 *
 * Deployed with the Supabase MCP / CLI: `supabase functions deploy categorize`.
 */
import { createSupabaseContext } from 'npm:@supabase/server';

import { isMcc } from '../_shared/mcc-codes.ts';

const MODEL = Deno.env.get('CATEGORIZE_MODEL') ?? 'claude-haiku-4-5-20251001';
const ORIGINS = new Set(['https://bookandry.com', 'http://localhost:4174']);
const MAX_NAME = 120;
const MAX_CATEGORIES = 80;
const MAX_CATEGORY_NAME = 60;

type Choice = { id: string; name: string };

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function parse(body: unknown): { name: string; kind: 'income' | 'expense'; choices: Choice[] } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { name, kind, categories } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_NAME) return undefined;
  if (kind !== 'income' && kind !== 'expense') return undefined;
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > MAX_CATEGORIES)
    return undefined;
  const choices: Choice[] = [];
  for (const c of categories) {
    if (typeof c !== 'object' || c === null) return undefined;
    const { id, name: label } = c as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || id.length > 64) return undefined;
    if (typeof label !== 'string' || label === '' || label.length > MAX_CATEGORY_NAME) return undefined;
    choices.push({ id, name: label });
  }
  return { name: name.trim(), kind, choices };
}

type Answer = { categoryId: string | null; mcc: string | null };

async function choose(
  name: string,
  kind: 'income' | 'expense',
  choices: Choice[],
  key: string,
): Promise<Answer> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system:
        "You sort entries in a household budgeting app used in Israel into the household's own categories. " +
        'Entries are short and may be in Hebrew or English: a product, a service, a shop, a brand, a bill. ' +
        'Pick the single category that fits best. Prefer a specific category over a general one ' +
        '(an AI tool subscription belongs in an AI or software category rather than a general subscriptions one, if there is one). ' +
        'Choose the "other" category only when nothing else reasonably fits. ' +
        'For an expense, also give the single most likely 4-digit merchant category code (MCC) of the business, ' +
        'or "" when unsure; for income, always "".',
      tools: [
        {
          name: 'choose_category',
          description: 'Record the category this entry belongs in, and its business type.',
          input_schema: {
            type: 'object',
            properties: {
              category_id: { type: 'string', enum: choices.map((c) => c.id) },
              mcc: {
                type: 'string',
                description: 'The 4-digit merchant category code (MCC) of the business, or "" when unsure.',
              },
            },
            required: ['category_id', 'mcc'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'choose_category' },
      messages: [
        {
          role: 'user',
          content:
            `This ${kind === 'expense' ? 'expense' : 'income'} was entered as: ${JSON.stringify(name)}\n\n` +
            `Categories (id: name):\n${choices.map((c) => `${c.id}: ${c.name}`).join('\n')}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`anthropic ${response.status}`);
  const message = (await response.json()) as {
    content?: { type: string; input?: { category_id?: unknown; mcc?: unknown } }[];
  };
  const input = message.content?.find((block) => block.type === 'tool_use')?.input;
  const picked = input?.category_id;
  const code = input?.mcc;
  return {
    categoryId: typeof picked === 'string' && choices.some((c) => c.id === picked) ? picked : null,
    // Checked, not trusted: a code the list has, on an expense; anything else is no answer.
    mcc: kind === 'expense' && isMcc(code) ? code : null,
  };
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405, headers });

    const { data: ctx, error } = await createSupabaseContext(req, { auth: 'user' });
    if (error || !ctx?.userClaims) {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers });
    }

    const input = parse(await req.json().catch(() => undefined));
    if (input === undefined) return Response.json({ error: 'invalid' }, { status: 400, headers });

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (key === undefined || key === '') {
      return Response.json({ error: 'not_configured' }, { status: 503, headers });
    }

    try {
      return Response.json(await choose(input.name, input.kind, input.choices, key), { headers });
    } catch {
      return Response.json({ error: 'upstream' }, { status: 502, headers });
    }
  },
};
