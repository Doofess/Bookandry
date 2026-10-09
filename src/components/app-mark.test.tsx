import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AppMark } from './app-mark';

describe('AppMark (§3)', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is an outlined circle with a Karantina B, beside the name in Plex 600', () => {
    renderWithProviders(<AppMark />);
    const circle = screen.getByText('B');
    expect(circle).toHaveAttribute('aria-hidden', 'true');
    expect(circle).toHaveClass(
      'font-display',
      'rounded-full',
      'border-2',
      'border-current',
      'size-11.5',
      'text-[1.75rem]',
    );
    expect(screen.getByText('Bookandry')).toHaveClass('font-semibold');
  });

  it('keeps the name for screen readers when it is not shown', () => {
    renderWithProviders(<AppMark withName={false} />);
    expect(screen.getByText('Bookandry')).toHaveClass('sr-only');
  });
});
