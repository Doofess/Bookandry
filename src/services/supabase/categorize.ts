import type { SupabaseClient } from '@supabase/supabase-js';

/** A category the guess may land on: its id, and its name as the person sees it. */
export type CategoryChoice = { readonly id: string; readonly name: string };

/**
 * Asks the `categorize` Edge Function (supabase/functions/categorize) which of
 * `choices` the typed `name` belongs in. Sent: that name and those category
 * names, nothing else.
 *
 * Undefined for no answer, whatever the reason - offline, not set up, a name
 * it could not place: the person chooses, as they always could.
 */
export async function suggestCategory(
  supabase: SupabaseClient,
  name: string,
  kind: 'income' | 'expense',
  choices: readonly CategoryChoice[],
): Promise<string | undefined> {
  const result = await supabase.functions.invoke('categorize', {
    body: { name, kind, categories: choices },
  });
  if (result.error !== null) return undefined;
  // Checked, not trusted: only an id that was offered comes back out.
  const data: unknown = result.data;
  const id =
    typeof data === 'object' && data !== null ? (data as { categoryId?: unknown }).categoryId : undefined;
  return typeof id === 'string' && choices.some((c) => c.id === id) ? id : undefined;
}
