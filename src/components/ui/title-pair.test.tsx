import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TitlePair } from './title-pair';

describe('TitlePair (§7.7)', () => {
  it('is one heading: the title in 600, the subtitle in 300 inside it, read once', () => {
    render(<TitlePair title="October so far" subtitle="day 9 of 31" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'October so far day 9 of 31' });
    expect(heading).toHaveClass('font-semibold', 'text-title-sheet');
    expect(screen.getByText('day 9 of 31')).toHaveClass('block', 'font-light', 'text-sub-sheet');
  });

  it('is the page’s h1 as a screen name: Karantina on a phone, the 38px top bar from lg', () => {
    render(<TitlePair as="h1" size="screen" title="Cards" subtitle="three of them" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass(
      'font-display',
      'text-screen-name',
      'lg:font-sans',
      'lg:font-semibold',
      'lg:text-title-screen',
    );
    // No subtitle under the phone's big name (§9.5).
    expect(screen.getByText('three of them')).toHaveClass('hidden', 'lg:block');
  });

  it('passes an id through, so a dialog can be named by it', () => {
    render(<TitlePair id="t1" title="Split into payments" />);
    expect(screen.getByRole('heading')).toHaveAttribute('id', 't1');
  });
});
