import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AvatarKey } from '@/types/domain';

import { Avatar } from './avatar';
import { FACES } from './faces';
import { AVATAR_SIZES } from './sizes';

const ALL_KEYS: readonly AvatarKey[] = [
  'fox',
  'cat',
  'panda',
  'owl',
  'frog',
  'koala',
  'penguin',
  'bear',
  'bunny',
  'sloth',
  'whale',
  'hedgehog',
  'otter',
  'duck',
  'monkey',
  'robot',
];

describe('Avatar', () => {
  it('renders every key, drawn or not', () => {
    // The remaining faces land in Phase 5; until then each key must still
    // render something rather than an empty box.
    for (const avatar of ALL_KEYS) {
      const { container, unmount } = render(<Avatar avatar={avatar} color="#16794a" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
      unmount();
    }
  });

  it('has at least the four faces Phase 3 needs', () => {
    expect(Object.keys(FACES).sort()).toEqual(['bear', 'cat', 'fox', 'owl']);
  });

  it('is decorative unless given a label', () => {
    const { container } = render(<Avatar avatar="fox" color="#16794a" />);
    // Sitting next to its own name in text, a second announcement of "Dana"
    // helps nobody.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('role', 'presentation');
  });

  it('is an image with a name when labelled', () => {
    render(<Avatar avatar="fox" color="#16794a" label="Dana" />);
    expect(screen.getByRole('img', { name: 'Dana' })).toBeInTheDocument();
  });

  it('puts the profile colour on the ring and never behind a feature', () => {
    const { container } = render(<Avatar avatar="fox" color="#be123c" />);
    const coloured = [...container.querySelectorAll('[stroke="#be123c"], [fill="#be123c"]')];

    // Exactly one element wears the colour, and it is a stroke.
    expect(coloured).toHaveLength(1);
    expect(coloured[0]?.getAttribute('fill')).toBe('none');
  });

  it('draws the face mass in paper, so contrast is structural', () => {
    const { container } = render(<Avatar avatar="bear" color="#1e293b" />);
    const paper = container.querySelectorAll('[fill="var(--avatar-paper)"]');
    // Outer ring plus face mass, at minimum.
    expect(paper.length).toBeGreaterThanOrEqual(2);
  });

  it('steps the stroke weight rather than scaling it', () => {
    const widths = (size: 'sm' | 'md' | 'lg') => {
      const { container, unmount } = render(<Avatar avatar="owl" color="#16794a" size={size} />);
      const value = container
        .querySelector('circle[stroke="var(--avatar-ink)"]')
        ?.getAttribute('stroke-width');
      unmount();
      return Number(value);
    };
    // A constant width would render as 1.33 CSS pixels at 32px: a grey smear.
    expect(widths('sm')).toBeGreaterThan(widths('md'));
    expect(widths('md')).toBeGreaterThan(widths('lg'));
  });

  it('renders at the requested pixel size', () => {
    const { container } = render(<Avatar avatar="fox" color="#16794a" size="lg" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', String(AVATAR_SIZES.lg));
  });
});
