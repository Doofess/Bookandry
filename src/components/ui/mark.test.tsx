import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Mark } from './mark';

describe('Mark, the inverted figure box (§9.3)', () => {
  it('sets its text in the sheet’s box pair, weight 600, with the mark radius', () => {
    render(<Mark>₪2,180</Mark>);
    const mark = screen.getByText('₪2,180');
    expect(mark).toHaveAttribute('data-slot', 'mark');
    expect(mark).toHaveClass(
      'bg-box',
      'text-box-text',
      'font-semibold',
      'rounded-mark',
      'box-decoration-clone',
    );
  });

  it('isolates its run, so a number keeps its order in Hebrew', () => {
    render(<Mark>12</Mark>);
    expect(screen.getByText('12')).toHaveClass('[unicode-bidi:isolate]');
  });
});
