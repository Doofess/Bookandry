import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { CardSheet } from './card-sheet';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('CardSheet (§7.1)', () => {
  it('is a sheet in the card’s colour, named by its heading, with the billing day in the box', () => {
    renderWithProviders(
      <CardSheet
        moneyKey="card-teal"
        name="Max Gold"
        holder="Dana"
        lastDigits="4821"
        billing="Bills on the 10th"
      />,
    );
    const sheet = screen.getByRole('article', { name: 'Max Gold' });
    expect(sheet).toHaveAttribute('data-card-sheet');
    expect(sheet).toHaveAttribute('data-money', 'card-teal');
    expect(screen.getByText('Bills on the 10th')).toHaveAttribute('data-slot', 'mark');
    expect(screen.getByText(/4821/).closest('p')).toHaveClass('font-light');
  });

  it('never shows more than the last 4 digits', () => {
    renderWithProviders(<CardSheet moneyKey="neutral" name="Old card" lastDigits="5555666677778888" />);
    expect(screen.getByRole('article').textContent).not.toContain('5555');
  });

  it('swaps sides from sheet to sheet, and is 124px tall on a phone, 108px in a wide board main', () => {
    renderWithProviders(<CardSheet moneyKey="neutral" name="A" />);
    expect(screen.getByRole('article')).toHaveClass(
      '[&:nth-child(even_of_[data-card-sheet])]:flex-row-reverse',
      'min-h-31',
      '@board/main:min-h-27',
      'rounded-sheet-s',
    );
  });

  it('holds its month’s spend as a numeral, which a card sheet bleeds at half depth', () => {
    /* Numeral (Task 14) is not in this checkout yet: a stand-in carrying its data hook. */
    const { container } = renderWithProviders(
      <CardSheet moneyKey="issuer-max" name="Max" figure={<span data-numeral="">2,040</span>} />,
    );
    expect(container.querySelector('[data-card-sheet] [data-numeral]')).not.toBeNull();
  });

  it('gives its figure the free width, at the far side, and takes a heading level', () => {
    const { container } = renderWithProviders(
      <CardSheet moneyKey="issuer-max" name="Max" as="h2" figure={<span>fig</span>} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Max' })).toBeInTheDocument();
    const figure = container.querySelector('[data-slot="card-sheet-figure"]');
    expect(figure?.className).toMatch(/flex-1/);
    expect(container.firstElementChild?.className).toMatch(/@board\/main:min-h-27/);
  });
});

describe('CardSheet that opens', () => {
  it('opens its card from anywhere on it, keeps its menu reachable, and shows when it is the one chosen', async () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <CardSheet
        moneyKey="issuer-max"
        name="Max"
        onOpen={onOpen}
        openLabel="Details of Max"
        selected
        menu={<button type="button">Options</button>}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Details of Max' }));
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Details of Max' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument();
  });
});
