import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';
import type { CardNetwork } from '@/types/domain';

import { NetworkLogo } from './network-logo';

describe('NetworkLogo', () => {
  it.each<[CardNetwork, string]>([
    ['visa', 'Visa'],
    ['mastercard', 'Mastercard'],
    ['amex', 'Amex'],
    ['diners', 'Diners'],
  ])('draws %s as an image named for the network', async (network, name) => {
    await initTestI18n('en');
    renderWithProviders(<NetworkLogo network={network} />);
    const logo = screen.getByRole('img', { name });
    expect(logo.tagName.toLowerCase()).toBe('svg');
    expect(logo.getAttribute('data-network')).toBe(network);
  });

  it('names the mark in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<NetworkLogo network="mastercard" />);
    expect(screen.getByRole('img', { name: 'מאסטרקארד' })).toBeInTheDocument();
  });

  it('sets Isracard, which has no traced mark, in type', async () => {
    await initTestI18n('en');
    renderWithProviders(<NetworkLogo network="isracard" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Isracard')).toBeInTheDocument();
  });
});
