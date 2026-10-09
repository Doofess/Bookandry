import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n } from '@/test/render';

import { Numeral, NUMERAL_MAX } from './numeral';

beforeAll(async () => {
  await initTestI18n('en');
});

const numeral = (container: HTMLElement) => {
  const el = container.querySelector<HTMLElement>('[data-numeral]');
  if (el === null) throw new Error('no numeral');
  return el;
};

/** The px a fluid NUMERAL_MAX comes to in a window `width` px wide. */
function clampAt(value: string, width: number): number {
  const match = /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/.exec(
    value,
  );
  if (match === null) return Number.parseFloat(value) * 16;
  const [min, base, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * width) / 100));
}

describe('Numeral (§7.5, §9.4)', () => {
  it('draws a whole figure without a fraction, symbol first, and lets it bleed', () => {
    const { container } = render(<Numeral minor={1_436_200} currency="ILS" size="balance" />);
    const el = numeral(container);
    expect(el.textContent).toBe('₪14,362');
    expect(el.style.getPropertyValue('--b')).toBe('');
    expect(el).toHaveClass('font-display');
  });

  it('never bleeds a figure with a fraction', () => {
    const { container } = render(<Numeral minor={1_436_250} currency="ILS" size="balance" />);
    expect(numeral(container).style.getPropertyValue('--b')).toBe('0');
    expect(numeral(container).textContent).toBe('₪14,362.50');
  });

  it('never bleeds an account figure or a day, whatever the amount', () => {
    const { container } = render(<Numeral minor={500_000} currency="ILS" size="account" />);
    expect(numeral(container).style.getPropertyValue('--b')).toBe('0');
  });

  it('when rounded, hides the visible figure and says the exact amount', () => {
    render(<Numeral minor={1_436_250} currency="ILS" size="balance" rounded />);
    const visible = document.querySelector('[data-numeral]');
    expect(visible).toHaveAttribute('aria-hidden', 'true');
    expect(visible?.textContent).toBe('₪14,363');
    expect(screen.getByText(/14,362\.50/)).toHaveClass('sr-only');
  });

  it('fits by its glyph count, under its size’s cap', () => {
    const { container } = render(<Numeral minor={-1_436_200} currency="ILS" size="card" />);
    const el = numeral(container);
    // '−' + '14,362' at full size, '₪' at half: 1 + 6 + 1.
    expect(el.style.getPropertyValue('--glyphs')).toBe('8');
    expect(el.style.getPropertyValue('--numeral-max')).toBe(NUMERAL_MAX.card);
    expect(el).toHaveAttribute('dir', 'ltr');
  });

  it.each([
    ['balance', 118, 252],
    ['left', 96, 168],
    ['cash', 96, 150],
    ['card', 92, 104],
    ['account', 40, 52],
    ['day', 34, 34],
  ] as const)('caps a %s figure at %ipx on a phone and %ipx at 1440 (§9.5)', (size, phone, desktop) => {
    expect(clampAt(NUMERAL_MAX[size], 390)).toBeCloseTo(phone, 0);
    expect(clampAt(NUMERAL_MAX[size], 1440)).toBeCloseTo(desktop, 0);
  });
});
