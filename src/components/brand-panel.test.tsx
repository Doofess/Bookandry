import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandPanel, PanelSheet, panelIconButton, panelPill } from './brand-panel';
import { Button } from './ui/button';

describe('BrandPanel', () => {
  it('is the deep panel with its engraving behind the content', () => {
    const { container } = render(
      <BrandPanel className="px-4">
        <h1>Cards</h1>
      </BrandPanel>,
    );
    const panel = container.querySelector('[data-slot="brand-panel"]');

    expect(panel).toHaveClass('bg-brand-deep', 'text-brand-deep-foreground', 'px-4');
    expect(panel?.querySelector('svg.engraving')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { name: 'Cards' })).toBeInTheDocument();
  });

  it('draws the rail with bands only', () => {
    const { container } = render(<BrandPanel engraving="bands">x</BrandPanel>);

    // The viewBox equals the full variant's, so count the paths: the 2 bands (6+4 copies), no rings.
    expect(container.querySelectorAll('svg path')).toHaveLength(10);
  });
});

describe('PanelSheet', () => {
  it('rises over the panel foot exactly as the sign-in form does', () => {
    const { container } = render(<PanelSheet>body</PanelSheet>);

    expect(container.firstElementChild).toHaveClass('-mt-6', 'rounded-t-3xl', 'bg-background');
  });
});

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
