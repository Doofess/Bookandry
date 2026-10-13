import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n } from '@/test/render';

import { greetingKey, SearchPill } from './top-bar';

beforeAll(async () => {
  await initTestI18n('he');
});

describe('the top bar', () => {
  it('greets by the time of day', () => {
    expect(greetingKey(9)).toBe('topbar.morning');
    expect(greetingKey(12)).toBe('topbar.afternoon');
    expect(greetingKey(18)).toBe('topbar.evening');
    expect(greetingKey(4)).toBe('topbar.evening');
  });

  it('searches from a 48px pill', () => {
    const onChange = vi.fn();
    render(<SearchPill value="" onChange={onChange} />);
    const field = screen.getByRole('searchbox', { name: 'חיפוש' });
    fireEvent.change(field, { target: { value: 'ארומה' } });
    expect(onChange).toHaveBeenCalledWith('ארומה');
    expect(field.closest('[data-slot="search-pill"]')?.className).toMatch(/min-h-12/);
  });
});
