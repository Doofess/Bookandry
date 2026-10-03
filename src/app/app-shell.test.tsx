import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { AppShell } from './app-shell';
import { SettingsProvider } from './settings-provider';

const INSTANT = instantFromMs(Date.parse('2026-09-15T10:00:00.000Z'));

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: INSTANT };

function renderShell() {
  return renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <AppShell />
    </SettingsProvider>,
  );
}

/**
 * Canary for the `dom` project: proves jsdom + i18next + the router + Base UI's
 * DirectionProvider all compose, before Phase 3 depends on it.
 */
describe('AppShell', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('renders one primary navigation landmark with its three routes', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav).toBeInTheDocument();
    for (const label of ['Feed', 'Chart', 'Profiles']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('keeps settings in the account menu at the top, not in the tabs', () => {
    renderShell();
    expect(screen.queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).toContainElement(
      screen.getByRole('button', { name: 'Account and settings' }),
    );
  });

  it('exposes a main landmark and a skip link', () => {
    renderShell();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });

  it('renders Hebrew strings when the language is he', async () => {
    await initTestI18n('he');
    renderShell();
    expect(screen.getByRole('navigation', { name: 'ניווט ראשי' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /תנועות/ })).toBeInTheDocument();
    await initTestI18n('en');
  });
});
