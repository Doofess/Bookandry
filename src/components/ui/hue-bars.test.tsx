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
  it('shows whole shekels without agorot with `whole`, and keeps the exact amount for a screen reader', () => {
    const { container } = render(<HueBars items={[item('rent', 1_234_567)]} currency="ILS" whole />);
    const amount = container.querySelector('li > span[data-value]');
    expect(amount).toHaveAttribute('data-value', '1234567');
    expect(amount?.querySelector('[aria-hidden]')).toHaveTextContent('₪12,346');
    expect(amount?.querySelector('.sr-only')).toHaveTextContent('12,345.67');
  });

  it('keeps agorot by default (the chart)', () => {
    render(<HueBars items={[item('rent', 1_234_567)]} currency="ILS" />);
    expect(screen.getByText(/12,345.67/, { selector: '[aria-hidden]' })).toBeInTheDocument();
  });

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

describe('HueBars against the largest', () => {
  it('draws each bar against the largest, as the concept does', () => {
    const { container } = render(
      <HueBars
        currency="ILS"
        items={[
          { id: 'rent', name: 'Rent', minor: 560_000, hue: 'indigo' },
          { id: 'food', name: 'Groceries', minor: 284_000, hue: 'green' },
        ]}
      />,
    );
    const bars = [...container.querySelectorAll<HTMLElement>('i[data-hue]')];
    expect(bars[0]?.style.getPropertyValue('--bp')).toBe(bars[0]?.style.getPropertyValue('--bp-max'));
    expect(bars[0]?.className).toMatch(/var\(--bp\)\/var\(--bp-max\)/);
  });

  it('draws no bar for a category with nothing in it', () => {
    const { container } = render(
      <HueBars
        currency="ILS"
        items={[
          { id: 'a', name: 'A', minor: 0, hue: 'teal' },
          { id: 'b', name: 'B', minor: 5, hue: 'lime' },
        ]}
      />,
    );
    expect(container.querySelectorAll('i[data-hue]')).toHaveLength(1);
  });

  it('stays a list in Safari, and keeps a long name whole', () => {
    render(
      <HueBars
        currency="ILS"
        items={[{ id: 'a', name: 'חשבונות בית ועוד דברים ארוכים', minor: 5, hue: 'cyan' }]}
      />,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('חשבונות בית ועוד דברים ארוכים')).toHaveAttribute(
      'title',
      'חשבונות בית ועוד דברים ארוכים',
    );
  });
});
