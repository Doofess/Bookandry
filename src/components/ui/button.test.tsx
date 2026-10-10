import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

/** The Bold sheets controls (§9.6, §7.8) as variants of the one Button. */
describe('Button', () => {
  it('keeps the default variant as it was', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('h-8', 'bg-primary');
  });

  it('draws a pill: a 2px edge in the text colour, full radius, 48px tall, 22px in', () => {
    render(<Button variant="pill">Cancel</Button>);
    const pill = screen.getByRole('button', { name: 'Cancel' });
    expect(pill).toHaveClass(
      'rounded-full',
      'border-2',
      'border-current',
      'min-h-12',
      'px-5.5',
      'font-medium',
    );
    expect(pill).not.toHaveClass('h-8');
  });

  it('fills a pill with the pressed pair, on a fine pointer’s hover or on press', () => {
    render(<Button variant="pill">Cancel</Button>);
    const pill = screen.getByRole('button', { name: 'Cancel' });
    expect(pill).toHaveClass('hover-fine:bg-press', 'hover-fine:text-on-press', 'active:bg-press');
    expect(pill.className).not.toMatch(/(^|\s)hover:/);
  });

  it('draws the solid pill in sapphire, the one primary action in a view', () => {
    render(<Button variant="pill-solid">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
      'border-primary',
      'min-h-12',
    );
  });

  it('draws a 48px round button and a text button', () => {
    render(
      <>
        <Button variant="round" aria-label="Next month" />
        <Button variant="text">Cancel</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveClass(
      'size-12',
      'rounded-full',
      'border-2',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass(
      'underline',
      'decoration-2',
      'min-h-11',
    );
  });

  it('scales a press only when motion is welcome, and never nudges a pill down a pixel', () => {
    render(<Button variant="pill">Cancel</Button>);
    const pill = screen.getByRole('button', { name: 'Cancel' });
    expect(pill).toHaveClass('motion-safe:active:scale-97', 'active:not-aria-[haspopup]:translate-y-0');
    expect(pill.className).not.toMatch(/(^|\s)active:scale-/);
  });
});
