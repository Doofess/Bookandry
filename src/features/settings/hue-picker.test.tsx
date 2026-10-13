import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { HuePicker } from './hue-picker';

describe('the hue picker', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('offers the twelve hues in two tones as 44px radios, named, and says which is chosen', async () => {
    const onChange = vi.fn();
    renderWithProviders(<HuePicker legend="Colour" value="teal" onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(24);
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Indigo, deeper' }));
    expect(onChange).toHaveBeenCalledWith('indigo-2');
    expect(radios[0]?.closest('label')?.className).toMatch(/size-11/);
  });
});
