import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Chip } from './chip';
import { HuePill } from './hue-pill';

describe('Chip', () => {
  it('is the company colour with its name, never colour alone', () => {
    render(<Chip moneyKey="issuer-max">Max 0937</Chip>);
    const chip = screen.getByText('Max 0937');
    expect(chip).toHaveAttribute('data-slot', 'chip');
    expect(chip).toHaveAttribute('data-money', 'issuer-max');
    expect(chip.className).toMatch(/min-h-6/);
  });
});

describe('HuePill', () => {
  it('is a mark: hidden from screen readers, keyed by hue', () => {
    const { container } = render(<HuePill hue="green" />);
    const pill = container.querySelector('[data-slot="hue-pill"]');
    expect(pill).toHaveAttribute('aria-hidden', 'true');
    expect(pill).toHaveAttribute('data-hue', 'green');
    expect(pill?.className).toMatch(/h-10/);
    expect(pill?.className).toMatch(/w-3\.5/);
  });

  it('is an outline when the row has no category hue', () => {
    const { container } = render(<HuePill hue={undefined} />);
    const pill = container.querySelector('[data-slot="hue-pill"]');
    expect(pill).toHaveAttribute('data-hue', 'neutral');
    expect(pill?.className).toMatch(/inset_0_0_0_2px/);
  });
});
