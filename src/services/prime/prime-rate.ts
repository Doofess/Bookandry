import { parseBoiAnswer, type BoiAnswer } from '@/domain/prime';

/**
 * The Bank of Israel's current rate, through the app's own relay.
 *
 * The Bank's API sends no CORS headers, so a browser cannot read it; the
 * `prime-rate` Edge Function (supabase/functions/prime-rate) reads it and
 * passes it on. Public data: no session, no key, and a plain `fetch` - a
 * signed-out person does not download the Supabase client to learn a rate.
 */
export async function fetchBoiRate(signal?: AbortSignal): Promise<BoiAnswer> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (base === undefined || base === '') throw new Error('No relay configured');
  const response = await fetch(`${base}/functions/v1/prime-rate`, { signal });
  if (!response.ok) throw new Error(`prime-rate answered ${String(response.status)}`);
  const answer = parseBoiAnswer(await response.json());
  if (answer === undefined) throw new Error('prime-rate answered something else');
  return answer;
}
