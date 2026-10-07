import type { SupabaseClient } from '@supabase/supabase-js';

import type { SendWipeOutcome } from './wipe';

/*
 * Apart from wipe.ts so that loading its calls - on every sync - never pulls
 * supabase-js into the app's first download. Task 6 replaces this.
 */
export function sendWipeRequests(
  _supabase: SupabaseClient,
  _language: 'en' | 'he',
  _requesterName: string,
): Promise<SendWipeOutcome> {
  return Promise.resolve({ ok: false, error: 'email_failed' });
}
