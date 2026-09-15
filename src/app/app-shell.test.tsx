import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AppShell } from './app-shell';

/**
 * Canary for the `dom` project: proves jsdom + i18next + the router + Base UI's
 * DirectionProvider all compose, before Phase 3 depends on it.
 */
describe('AppShell', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('renders one primary navigation landmark with all four routes', () => {
    renderWithProviders(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav).toBeInTheDocument();
    for (const label of ['Feed', 'Chart', 'Profiles', 'Settings']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('exposes a main landmark and a skip link', () => {
    renderWithProviders(<AppShell />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });

  it('renders Hebrew strings when the language is he', async () => {
    await initTestI18n('he');
    renderWithProviders(<AppShell />);
    expect(screen.getByRole('navigation', { name: 'ניווט ראשי' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /תנועות/ })).toBeInTheDocument();
    await initTestI18n('en');
  });
});
