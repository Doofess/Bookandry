import { screen, within } from '@testing-library/react';
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

  it('renders one primary navigation landmark with its four tabs', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav).toBeInTheDocument();
    // Where anchored pop-outs find the phone's tab bar, to keep clear of it.
    expect(nav).toHaveAttribute('data-slot', 'tab-bar');
    // The rail's mark goes home too; every other link in the bar is a tab.
    const tabs = within(nav)
      .getAllByRole('link')
      .filter((link) => link.textContent !== 'Bookandry');
    expect(tabs.map((tab) => tab.textContent.replace('(current)', ''))).toEqual([
      'Feed',
      'Chart',
      'Cards',
      'Cash',
    ]);
  });

  it('has no tab for account linking: it is a page in Settings', () => {
    renderShell();
    expect(screen.queryByRole('link', { name: /Household|Account linking/ })).not.toBeInTheDocument();
  });

  it('keeps settings out of the tabs, and leaves the account menu to each screen panel', () => {
    renderShell();
    expect(screen.queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument();
    // The phone header is gone: the panel at the top of every screen carries the menu.
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('makes the desktop rail the deep panel, with the active tab a light pill', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const active = screen.getByRole('link', { name: /Feed/ });

    expect(nav).toHaveClass('lg:bg-brand-deep', 'lg:text-brand-deep-foreground');
    expect(nav.querySelector('svg.engraving')).not.toBeNull();
    expect(active).toHaveClass('text-primary-ink', 'lg:bg-white/15');
    // On a phone the active icon sits on the soft accent pill.
    expect(active.querySelector('[data-slot="tab-pill"]')).toHaveClass('bg-accent');
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
