import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AddButton } from './add-button';

describe('AddButton', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is a labelled sapphire pill, 48px high', () => {
    renderWithProviders(<AddButton />);
    const button = screen.getByRole('button', { name: 'Add' });

    expect(button).toHaveClass('h-12', 'px-5', 'rounded-full', 'bg-brand-deep', 'text-brand-deep-foreground');
    // Its edge on the near-black page.
    expect(button).toHaveClass('dark:border', 'dark:border-brand-vivid');
  });

  it('is centred above the tab bar on a phone and at the bottom-end corner on a desktop', () => {
    renderWithProviders(<AddButton />);
    const button = screen.getByTestId('add-button');

    expect(button).toHaveClass('start-0', 'end-0', 'mx-auto', 'w-max', 'lg:end-6', 'lg:start-auto');
  });

  it('reads הוספה in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<AddButton />);
    expect(screen.getByRole('button', { name: 'הוספה' })).toBeInTheDocument();
    await initTestI18n('en');
  });

  it('is disabled when asked, and fires when it is not', async () => {
    const onClick = vi.fn();
    const { rerender } = renderWithProviders(<AddButton disabled onClick={onClick} />);
    expect(screen.getByTestId('add-button')).toBeDisabled();

    rerender(<AddButton onClick={onClick} />);
    await userEvent.setup().click(screen.getByTestId('add-button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
