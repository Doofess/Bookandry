import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { cardKey } from '@/domain/money-key';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { CardFace, lastFour } from './card-face';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('lastFour (gate:pci, §7.1)', () => {
  it('keeps the digits only, and never more than four', () => {
    expect(lastFour('4821')).toBe('4821');
    expect(lastFour('1234 5678 9012 3456')).toBe('3456');
    expect(lastFour('')).toBeUndefined();
    expect(lastFour(undefined)).toBeUndefined();
  });
});

describe('CardFace (§7.2)', () => {
  it('is named "<issuer> ending <last4>", with its parts hidden behind that name', () => {
    renderWithProviders(
      <CardFace moneyKey="issuer-isracard" issuerName="Isracard" holder="Dana" lastDigits="4821" />,
    );
    const face = screen.getByRole('img', { name: 'Isracard ending 4821' });
    expect(face).toHaveAttribute('data-sheet', 'money');
    expect(face).toHaveAttribute('data-money', 'issuer-isracard');
  });

  it('shows four digits at most, whatever it is given', () => {
    renderWithProviders(<CardFace moneyKey="issuer-cal" issuerName="Cal" lastDigits="1234567890123456" />);
    const face = screen.getByRole('img', { name: 'Cal ending 3456' });
    expect(face.textContent).not.toContain('1234');
  });

  it('takes its company’s colour when the card’s own is one this build does not know', () => {
    renderWithProviders(
      <CardFace
        moneyKey={cardKey({ color: '#bad', card: { issuer: 'cal' } })}
        issuerName="Cal"
        lastDigits="1"
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('data-money', 'issuer-cal');
  });

  it('tilts −4° as a preview and lies flat in details, and cross-fades its colour for everyone', () => {
    renderWithProviders(
      <>
        <CardFace moneyKey="issuer-max" issuerName="Max" variant="preview" />
        <CardFace moneyKey="issuer-max" issuerName="Diners" variant="details" />
      </>,
    );
    const [preview, details] = screen.getAllByRole('img');
    expect(preview).toHaveClass('-rotate-4', 'aspect-[1.586]', 'rounded-face', 'transition-colors');
    expect(details).not.toHaveClass('-rotate-4');
  });

  it('is named by its issuer alone when there are no digits', () => {
    renderWithProviders(<CardFace moneyKey="neutral" issuerName="A card" />);
    expect(screen.getByRole('img', { name: 'A card' })).toBeInTheDocument();
  });
});
