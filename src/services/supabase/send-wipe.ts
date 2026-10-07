import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import type { SendWipeOutcome } from './wipe';

/*
 * Apart from wipe.ts so that loading its calls - on every sync - never pulls
 * supabase-js into the app's first download.
 */

const REFUSALS = new Set(['not_linked', 'wipe_pending', 'too_many_wipe_requests']);

/**
 * Ask every other member to confirm: the send-wipe-requests function makes
 * the request and mails each member their own link. The links never come
 * back here - each reaches only the inbox it was sent to.
 */
export async function sendWipeRequests(
  supabase: SupabaseClient,
  language: 'en' | 'he',
  requesterName: string,
): Promise<SendWipeOutcome> {
  let result;
  try {
    result = await supabase.functions.invoke('send-wipe-requests', {
      body: { language, requesterName: requesterName.slice(0, 80) },
    });
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (result.error === null) {
    const data = result.data as { ok?: unknown; asked?: unknown } | null;
    return data?.ok === true && typeof data.asked === 'number'
      ? { ok: true, asked: data.asked }
      : { ok: false, error: 'email_failed' };
  }
  if (!(result.error instanceof FunctionsHttpError)) return { ok: false, error: 'offline' };
  const response = result.error.context as Response;
  const body = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined;
  const code = body?.error;
  if (typeof code === 'string' && REFUSALS.has(code)) {
    return { ok: false, error: code as 'not_linked' | 'wipe_pending' | 'too_many_wipe_requests' };
  }
  return { ok: false, error: 'email_failed' };
}
