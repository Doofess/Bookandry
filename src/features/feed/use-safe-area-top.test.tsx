import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSafeAreaTop } from './use-safe-area-top';

function Probe() {
  return <div data-testid="probe" data-inset={useSafeAreaTop()} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSafeAreaTop', () => {
  it('reads the top inset the browser resolves for env(safe-area-inset-top)', () => {
    // An installed app on a notched phone: the status bar takes 47px.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ paddingTop: '47px' } as CSSStyleDeclaration);

    const { getByTestId } = render(<Probe />);

    expect(getByTestId('probe')).toHaveAttribute('data-inset', '47');
  });

  it('is zero where there is no inset, or no env() at all', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ paddingTop: '' } as CSSStyleDeclaration);

    const { getByTestId } = render(<Probe />);

    expect(getByTestId('probe')).toHaveAttribute('data-inset', '0');
  });
});
