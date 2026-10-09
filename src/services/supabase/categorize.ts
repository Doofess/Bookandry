import type { SupabaseClient } from '@supabase/supabase-js';

import { isMcc } from '@/domain/mcc';

/** A category the guess may land on: its id, and its name as the person sees it. */
export type CategoryChoice = { readonly id: string; readonly name: string };

/** What the guess came back with: a category it was offered, and an expense's business type. Either may be absent. */
export type Suggestion = { readonly categoryId?: string; readonly mcc?: string };

/**
 * Asks the `categorize` Edge Function (supabase/functions/categorize) which of
 * `choices` the typed `name` belongs in, and - for an expense - its business
 * type. Sent: that name and those category names, nothing else.
 *
 * `{}` for no answer, whatever the reason - offline, not set up, a name it
 * could not place: the person chooses, as they always could.
 */
export async function suggestCategory(
  supabase: SupabaseClient,
  name: string,
  kind: 'income' | 'expense',
  choices: readonly CategoryChoice[],
): Promise<Suggestion> {
  const result = await supabase.functions.invoke('categorize', {
    body: { name, kind, categories: choices },
  });
  if (result.error !== null) return {};
  // Checked, not trusted: only an id that was offered, and a code the list has, come back out.
  const data: unknown = result.data;
  const reply =
    typeof data === 'object' && data !== null ? (data as { categoryId?: unknown; mcc?: unknown }) : {};
  const id = reply.categoryId;
  const mcc = reply.mcc;
  return {
    ...(typeof id === 'string' && choices.some((c) => c.id === id) ? { categoryId: id } : {}),
    ...(kind === 'expense' && isMcc(mcc) ? { mcc } : {}),
  };
}
