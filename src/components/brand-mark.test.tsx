import { render } from '@testing-library/react';
import { CircleHelp } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { brandLogo } from '@/data/brands';

import { BankMark, BrandMark, NeutralMark } from './brand-mark';

describe('a brand mark', () => {
  it('is the brand’s own logo, as a decorative image: the name beside it is the text', () => {
    const { container } = render(<BrandMark brand="bank-10" />);
    const img = container.querySelector('img');

    expect(img).toHaveAttribute('src', brandLogo('bank-10'));
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('data-brand', 'bank-10');
    expect(img).toHaveAttribute('draggable', 'false');
  });

  it('sits on a white tile, in both themes, the way a card prints it', () => {
    const { container } = render(<BrandMark brand="network-visa" className="extra" />);
    const tile = container.querySelector('[data-slot="brand-mark"]');

    expect(tile).toHaveClass(
      'bg-white',
      'rounded-md',
      'ring-1',
      'ring-black/5',
      'dark:ring-white/10',
      'h-7',
      'extra',
    );
    expect(tile?.querySelector('img')).toHaveClass('h-5', 'w-auto', 'object-contain');
  });

  it('is nothing for a brand with no logo', () => {
    const { container } = render(<BrandMark brand="bank-99" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('a neutral mark', () => {
  it('is a line icon on the sapphire tint, the size of a brand tile', () => {
    const { container } = render(<NeutralMark icon={CircleHelp} />);
    const tile = container.querySelector('[data-slot="neutral-mark"]');

    expect(tile).toHaveClass('bg-accent', 'text-accent-foreground', 'h-7', 'rounded-md');
    expect(tile?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(tile?.querySelector('svg')).toHaveAttribute('stroke-width', '1.75');
  });
});

describe('a bank’s mark', () => {
  it('is its logo where it has one, and a neutral landmark where it has none', () => {
    const { container } = render(
      <>
        <BankMark code="12" />
        <BankMark code="54" />
      </>,
    );

    expect(container.querySelector('img[data-brand="bank-12"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-slot="neutral-mark"] svg')).toHaveLength(1);
  });
});

describe('the small mark', () => {
  it('fits a line of small print: a bank under an amount', () => {
    const { container } = render(<BankMark code="10" size="xs" />);
    expect(container.querySelector('[data-slot="brand-mark"]')).toHaveClass('h-4');
    expect(container.querySelector('img')).toHaveClass('h-3');

    const neutral = render(<BankMark code="54" size="xs" />).container.querySelector(
      '[data-slot="neutral-mark"]',
    );
    expect(neutral).toHaveClass('h-4');
    expect(neutral?.querySelector('svg')).toHaveClass('size-3');
  });
});
