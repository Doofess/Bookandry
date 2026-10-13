import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { panelIconButton, panelPill } from './brand-panel';
import { Button } from './ui/button';

describe('panelPill', () => {
  it('is an outlined pill at least 44px high on a phone', () => {
    render(
      <Button variant="ghost" className={panelPill}>
        Prime
      </Button>,
    );
    const pill = screen.getByRole('button', { name: 'Prime' });

    expect(pill).toHaveClass('rounded-full', 'border-white/35', 'hover:bg-white/10', 'min-h-11');
  });
});

describe('panelIconButton', () => {
  it('is a round icon button 44px on a phone, in the panel colour', () => {
    render(
      <Button variant="ghost" size="icon" className={panelIconButton} aria-label="Next month">
        ›
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Next month' });

    expect(button).toHaveClass('size-11', 'sm:size-9', 'rounded-full', 'hover:bg-white/10');
  });
});
