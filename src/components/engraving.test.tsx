import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Engraving } from './engraving';

/*
 * One test, in order: the "drawn already" flag is module state, and Vitest
 * gives each test FILE a fresh module, so the first render below is the app's
 * first panel.
 */
describe('Engraving', () => {
  it('draws in on the first screen only, every panel of it together', () => {
    const first = render(
      <>
        <Engraving variant="bands" />
        <Engraving variant="compact" />
      </>,
    );
    const firstSvgs = first.container.querySelectorAll('svg');
    expect(firstSvgs).toHaveLength(2);
    for (const svg of firstSvgs) expect(svg).not.toHaveClass('engraving-drawn');
    first.unmount();

    // Navigating to another screen mounts a new panel: drawn already.
    const second = render(<Engraving variant="compact" />);
    expect(second.container.querySelector('svg')).toHaveClass('engraving-drawn');
  });

  it('gives the compact set a short drawing anchored to the top corner', () => {
    const { container } = render(<Engraving variant="compact" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 800 300');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMinYMin slice');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the front door drawing as it was', () => {
    const { container } = render(<Engraving />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 800 1000');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMaxYMax slice');
    // 4 ring sets (5+5+4+3 copies) and 2 bands (6+4 copies).
    expect(container.querySelectorAll('path')).toHaveLength(27);
  });

  it('draws only the bands for the rail', () => {
    const { container } = render(<Engraving variant="bands" />);

    expect(container.querySelectorAll('path')).toHaveLength(10);
  });
});
