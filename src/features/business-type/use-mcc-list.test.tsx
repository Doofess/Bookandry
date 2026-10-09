import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useMccList } from './use-mcc-list';

describe('useMccList', () => {
  it('has nothing until the names have loaded, then the whole list', async () => {
    const { result } = renderHook(() => useMccList());
    expect(result.current).toBeUndefined();
    await waitFor(() => {
      expect(result.current).toHaveLength(981);
    });
  });
});
