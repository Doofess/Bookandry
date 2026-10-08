import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategoryChip, CategoryIcon } from './category-icon';

describe('category icons', () => {
  it('are thin line icons', () => {
    const { container } = render(<CategoryIcon name="ShoppingBasket" />);

    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.75');
  });

  it('sit on the sapphire tint, the same for every kind', () => {
    const { container } = render(<CategoryChip icon="ShoppingBasket" />);
    const chip = container.querySelector('[data-slot="category-chip"]');

    expect(chip).toHaveClass('bg-accent', 'text-accent-foreground', 'size-9', 'rounded-full');
    expect(chip?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to a circle for an icon this build does not ship', () => {
    const { container } = render(<CategoryChip icon="NoSuchIcon" />);

    expect(container.querySelector('svg')).not.toBeNull();
  });
});
