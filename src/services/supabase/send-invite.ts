import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import type { SendInviteOutcome } from './household';

/*
 * Apart from household.ts so that loading the household's calls - on every
 * sync - never pulls supabase-js into the app's first download.
 */

const SEND_ERRORS = new Set([
  'invite_self',
  'already_member',
  'household_full',
  'too_many_invites',
  'malformed_invite',
  'email_failed',
]);

/**
 * Invite someone by email: the send-invite function makes the invitation and
 * mails its link. The link itself never comes back here - it reaches only
 * the inbox it was sent to.
 */
export async function sendInvite(
  supabase: SupabaseClient,
  email: string,
  currency: string,
  language: 'en' | 'he',
  inviterName: string,
): Promise<SendInviteOutcome> {
  const result = await supabase.functions.invoke('send-invite', {
    body: { email, currency, language, inviterName: inviterName.slice(0, 80) },
  });
  if (result.error === null) {
    const data = result.data as { ok?: unknown } | null;
    return data?.ok === true ? { ok: true } : { ok: false, error: 'email_failed' };
  }
  let code: unknown;
  if (result.error instanceof FunctionsHttpError) {
    const response = result.error.context as Response;
    const body = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined;
    code = body?.error;
  }
  if (typeof code === 'string' && SEND_ERRORS.has(code)) {
    return { ok: false, error: code as Exclude<SendInviteOutcome, { ok: true }>['error'] };
  }
  return { ok: false, error: 'offline' };
}
