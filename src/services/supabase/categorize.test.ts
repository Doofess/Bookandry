import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { suggestCategory } from './categorize';

const client = (answer: { data: unknown; error: unknown }) =>
  ({ functions: { invoke: vi.fn(() => Promise.resolve(answer)) } }) as unknown as SupabaseClient;
const CHOICES = [{ id: 'cat.dining', name: 'Dining' }];

describe('suggestCategory', () => {
  it('takes an offered category and a listed business type', async () => {
    const supabase = client({ data: { categoryId: 'cat.dining', mcc: '5812' }, error: null });
    expect(await suggestCategory(supabase, 'Cafe', 'expense', CHOICES)).toEqual({
      categoryId: 'cat.dining',
      mcc: '5812',
    });
  });

  it('drops what it did not offer, a code the list lacks, and any code on income', async () => {
    expect(
      await suggestCategory(
        client({ data: { categoryId: 'cat.gone', mcc: '9999' }, error: null }),
        'Cafe',
        'expense',
        CHOICES,
      ),
    ).toEqual({});
    expect(
      await suggestCategory(
        client({ data: { categoryId: 'cat.dining', mcc: '5812' }, error: null }),
        'Cafe',
        'income',
        CHOICES,
      ),
    ).toEqual({ categoryId: 'cat.dining' });
  });

  it('is no answer at all on an error, and reads a reply from before business types', async () => {
    expect(
      await suggestCategory(client({ data: null, error: new Error('x') }), 'Cafe', 'expense', CHOICES),
    ).toEqual({});
    expect(
      await suggestCategory(
        client({ data: { categoryId: 'cat.dining' }, error: null }),
        'Cafe',
        'expense',
        CHOICES,
      ),
    ).toEqual({ categoryId: 'cat.dining' });
  });
});
