import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The categorize Edge Function (supabase/functions/categorize), run here with
 * its Deno import and environment stood in for. What matters: the category id
 * is one it was offered, and the business type is a code the list has, on an
 * expense, or null.
 */

vi.mock('npm:@supabase/server', () => ({
  createSupabaseContext: () => Promise.resolve({ data: { userClaims: { sub: 'u-alice' } }, error: null }),
}));

const PATH = '../../../supabase/functions/categorize/index.ts';
const load = async (): Promise<{ fetch: (req: Request) => Promise<Response> }> =>
  ((await import(/* @vite-ignore */ PATH)) as { default: { fetch: (req: Request) => Promise<Response> } })
    .default;

const request = (body: Record<string, unknown>): Request =>
  new Request('https://fn.example/categorize', {
    method: 'POST',
    headers: { origin: 'https://bookandry.com', authorization: 'Bearer user-jwt' },
    body: JSON.stringify({
      name: 'Cafe Nero',
      kind: 'expense',
      categories: [
        { id: 'c1', name: 'Eating out' },
        { id: 'c2', name: 'Shopping' },
      ],
      ...body,
    }),
  });

/** Claude answers with this tool input; the body it was sent is kept. */
let sent: string[];
const claude = (input: Record<string, unknown>): void => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { body: string }) => {
      sent.push(init.body);
      return Promise.resolve(Response.json({ content: [{ type: 'tool_use', input }] }));
    }),
  );
};

beforeEach(() => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => (name === 'ANTHROPIC_API_KEY' ? 'key' : undefined) },
  });
});

describe('categorize', () => {
  it('answers the category it was offered and a business type the list has', async () => {
    claude({ category_id: 'c1', mcc: '5812' });
    const response = await (await load()).fetch(request({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ categoryId: 'c1', mcc: '5812' });
    // Asked for both, through one tool, without the code list.
    const body = JSON.parse(sent[0] ?? '{}') as { tools: { input_schema: { required: string[] } }[] };
    expect(body.tools[0]?.input_schema.required).toEqual(['category_id', 'mcc']);
    expect(sent[0]).not.toContain('0742');
  });

  it.each([
    ['a code the list lacks', { category_id: 'c1', mcc: '9999' }, {}],
    ['no code', { category_id: 'c1', mcc: '' }, {}],
    ['a code that is not four digits', { category_id: 'c1', mcc: 5812 }, {}],
    ['income', { category_id: 'c1', mcc: '5812' }, { kind: 'income' }],
  ])('answers null for the business type on %s', async (_what, input, body) => {
    claude(input);
    const response = await (await load()).fetch(request(body));
    expect(await response.json()).toEqual({ categoryId: 'c1', mcc: null });
  });

  it('still refuses a category it did not offer', async () => {
    claude({ category_id: 'c9', mcc: '5812' });
    expect(await (await (await load()).fetch(request({}))).json()).toEqual({ categoryId: null, mcc: '5812' });
  });
});
