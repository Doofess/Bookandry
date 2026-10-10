import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n } from '@/test/render';

import { HueBars, largestWithOther, MoneyStrip, type HueBarItem } from './hue-bars';

beforeAll(async () => {
  await initTestI18n('en');
});

const item = (id: string, minor: number, hue: HueBarItem['hue'] = 'teal'): HueBarItem => ({
  id,
  name: id,
  minor,
  hue,
});
const TWELVE = Array.from({ length: 12 }, (_, i) => item(`c${String(i + 1)}`, (i + 1) * 1000));

describe('largestWithOther (§1.4)', () => {
  it('keeps the largest, then folds the rest into one neutral "Other"', () => {
    const shown = largestWithOther(TWELVE, 10, 'Other');
    expect(shown).toHaveLength(11);
    expect(shown[0]?.id).toBe('c12');
    expect(shown.at(-1)).toEqual({ id: 'other', name: 'Other', minor: 3000, hue: 'neutral' });
  });

  it('adds no "Other" when everything fits', () => {
    expect(largestWithOther(TWELVE.slice(0, 3), 10, 'Other').map((i) => i.id)).toEqual(['c3', 'c2', 'c1']);
  });
});

describe('HueBars (§7.4)', () => {
  it('lists every category by name and amount, then "Other"', () => {
    render(<HueBars items={TWELVE} currency="ILS" />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(11);
    expect(rows.at(-1)).toHaveTextContent('Other');
  });

  it('draws each bar as a hue mark sized by its share, hidden from screen readers', () => {
    const { container } = render(<HueBars items={TWELVE.slice(0, 2)} currency="ILS" />);
    const bars = [...container.querySelectorAll<HTMLElement>('[data-hue]')];
    expect(bars.map((bar) => bar.getAttribute('data-hue'))).toEqual(['teal', 'teal']);
    expect(bars.map((bar) => Number(bar.style.getPropertyValue('--bp'))).reduce((a, b) => a + b, 0)).toBe(
      10_000,
    );
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('MoneyStrip (§7.4)', () => {
  it('is hidden from screen readers: its legend or the bar list carries the data', () => {
    const { container } = render(<MoneyStrip items={TWELVE} />);
    const strip = container.querySelector('[data-slot="money-strip"]');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    // The largest 7, then "Other": 8 segments, 2px apart.
    expect(strip?.children).toHaveLength(8);
    expect(strip).toHaveClass('gap-0.5');
  });
});
