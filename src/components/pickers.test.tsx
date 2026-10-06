import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { ColorPicker } from './pickers';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('ColorPicker', () => {
  it('names each swatch by its colour, not its hex, inside a named radiogroup', () => {
    renderWithProviders(
      <>
        <span id="colour">Colour</span>
        <ColorPicker value="#16794a" taken={[]} labelledBy="colour" onChange={() => undefined} />
      </>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument();
    // Hue alone fails SC 1.4.1, and a hex code is not a name.
    expect(screen.getByRole('radio', { name: 'Emerald' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps a taken colour focusable, with aria-disabled rather than disabled', async () => {
    const onChange = vi.fn();
    renderWithProviders(<ColorPicker value="#16794a" taken={['#0369a1']} onChange={onChange} />);

    const taken = screen.getByRole('radio', { name: 'Ocean' });
    expect(taken).toHaveAttribute('aria-disabled', 'true');
    // `disabled` would remove it from the tab order, so a keyboard user would
    // never learn why the colour they wanted is missing.
    expect(taken).not.toBeDisabled();

    await userEvent.setup().click(taken);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not count its own colour as taken', () => {
    renderWithProviders(<ColorPicker value="#16794a" taken={['#16794a']} onChange={() => undefined} />);
    expect(screen.getByRole('radio', { name: 'Emerald' })).not.toHaveAttribute('aria-disabled');
  });
});
