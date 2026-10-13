import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n } from '@/test/render';

import { Sheet, SheetHead } from './sheet-surface';

beforeAll(async () => {
  await initTestI18n();
});

describe('Sheet', () => {
  it('is a sheet of its kind, keyed, clipped and padded', () => {
    render(
      <Sheet kind="money" moneyKey="bank-10" aria-label="Leumi">
        x
      </Sheet>,
    );
    const sheet = screen.getByRole('region', { name: 'Leumi' });
    expect(sheet).toHaveAttribute('data-sheet', 'money');
    expect(sheet).toHaveAttribute('data-money', 'bank-10');
    expect(sheet.className).toMatch(/overflow-clip/);
    expect(sheet.className).toMatch(/rounded-sheet\b/);
    expect(sheet.className).toMatch(/pb-sheet-y/);
  });

  it('falls back to neutral money, never to a colour of its own', () => {
    const { container } = render(<Sheet kind="money">x</Sheet>);
    expect(container.firstElementChild).toHaveAttribute('data-money', 'neutral');
  });

  it('gives no money key to a house sheet', () => {
    const { container } = render(<Sheet kind="night">x</Sheet>);
    expect(container.firstElementChild).not.toHaveAttribute('data-money');
  });

  it('has no padding at its foot when a numeral bleeds off it', () => {
    const { container } = render(
      <Sheet kind="sapphire" bleed radius="cash">
        x
      </Sheet>,
    );
    expect(container.firstElementChild?.className).toMatch(/\bpb-0\b/);
    expect(container.firstElementChild?.className).toMatch(/rounded-sheet-cash/);
  });
});

describe('SheetHead', () => {
  it('reads as one heading, with its action beside it', () => {
    render(
      <SheetHead
        title="October by category"
        subtitle="₪14,362 in ten"
        action={<button type="button">All</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('October by category ₪14,362 in ten');
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });
});
