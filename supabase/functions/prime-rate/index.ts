/**
 * The Bank of Israel's interest rate, which Israeli prime is built on
 * (prime = the Bank of Israel rate + 1.5).
 *
 * A relay, because the Bank of Israel's API sends no CORS headers: a browser
 * cannot read it directly. Public data, so public here too - deployed with
 * `verify_jwt` off, for signed-out people as much as signed-in ones. Nothing
 * is sent but the request; nothing is stored.
 *
 * The Bank's own public API first (GetInterest: the current rate and the next
 * decision's date), its SDMX statistics series second (MNT_RIB_BOI_D, the
 * daily rate), so one of the two being down does not leave the app guessing.
 * Cached for a quarter of an hour: the rate changes eight times a year at
 * most, and a decision is in the app within fifteen minutes of taking effect.
 *
 * Deployed with the Supabase MCP / CLI:
 * `supabase functions deploy prime-rate --no-verify-jwt`.
 */
const ORIGINS = new Set(['https://bookandry.com', 'http://localhost:4173', 'http://localhost:4174']);
const CACHE_SECONDS = 900;

type Answer = { boiRate: string; nextDecision?: string; source: 'boi-api' | 'boi-sdmx' };

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

/** A rate as a plain decimal string, or undefined if it is not a believable one. */
function rate(value: unknown): string | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 50) return undefined;
  // At most three decimals: the Bank moves in quarter points.
  return String(Math.round(n * 1000) / 1000);
}

async function fromApi(): Promise<Answer | undefined> {
  const response = await fetch('https://www.boi.org.il/PublicApi/GetInterest', {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return undefined;
  const body = (await response.json()) as Record<string, unknown>;
  const boiRate = rate(body.currentInterest);
  if (boiRate === undefined) return undefined;
  const next = typeof body.nextInterestDate === 'string' ? body.nextInterestDate.slice(0, 10) : undefined;
  return {
    boiRate,
    ...(next !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(next) ? { nextDecision: next } : {}),
    source: 'boi-api',
  };
}

async function fromSdmx(): Promise<Answer | undefined> {
  const response = await fetch(
    'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/BR/1.0/MNT_RIB_BOI_D?lastNObservations=1&format=csv',
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) return undefined;
  const [header, row] = (await response.text()).trim().split(/\r?\n/);
  if (header === undefined || row === undefined) return undefined;
  const column = header.split(',').indexOf('OBS_VALUE');
  const boiRate = column < 0 ? undefined : rate(row.split(',')[column]);
  return boiRate === undefined ? undefined : { boiRate, source: 'boi-sdmx' };
}

Deno.serve(async (request) => {
  const headers = cors(request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

  let answer: Answer | undefined;
  for (const source of [fromApi, fromSdmx]) {
    try {
      answer = await source();
    } catch {
      answer = undefined;
    }
    if (answer !== undefined) break;
  }

  if (answer === undefined) {
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 503,
      headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return new Response(JSON.stringify(answer), {
    headers: {
      ...headers,
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
});
