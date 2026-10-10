import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

/** A place's label: its first span, without a count or "(current)". */
const label = (link: HTMLElement) => link.querySelector('span')?.textContent ?? '';
const places = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .filter((link) => link.querySelector('[data-slot="app-mark"]') === null);

describe('AppShell (§4)', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is one primary navigation: the rail’s places, four of them the phone’s tabs', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    // Where anchored pop-outs find the phone's tab bar, to keep clear of it.
    expect(nav).toHaveAttribute('data-slot', 'tab-bar');
    const shown = places(nav);
    shown.forEach((link) => {
      expect(link).toHaveAttribute('data-slot', 'nav-place');
    });
    const phone = shown.filter((link) => link.closest('[class~="lg:hidden"]') !== null);
    const rail = shown.filter((link) => link.closest('[class~="lg:hidden"]') === null);
    expect(phone.map(label)).toEqual(['Feed', 'Chart', 'Cards', 'Cash']);
    expect(rail.map(label)).toEqual([
      'Overview',
      'Cards',
      'Bank accounts',
      'Cash box',
      'Chart',
      'Categories',
      'Commitments',
      'Settings',
    ]);
  });

  it('draws text pills with no icons, the current one filled with ink', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a svg')).toHaveLength(0);
    const feed = screen.getAllByRole('link', { name: /^Feed/ })[0]!;
    expect(feed).toHaveAttribute('aria-current', 'page');
    expect(feed).toHaveClass(
      'aria-[current=page]:bg-press',
      'aria-[current=page]:text-on-press',
      'min-h-11',
      'lg:min-h-12',
    );
  });

  it('keeps the account menu at the rail’s foot, and account linking out of the places', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('button', { name: /Account and settings/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Household|Account linking/ })).not.toBeInTheDocument();
  });

  it('makes main a size container, with a content box of at most 1680px and no pad on the far side', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(main).toHaveClass('@container/main', 'lg:ps-64');
    expect(main.className).not.toMatch(/pe-56/);
    expect(main.querySelector('[data-slot="content-box"]')).toHaveClass(
      'mx-auto',
      'max-w-[105rem]',
      'lg:p-6',
    );
  });

  it('puts Add at the top of the rail on a desktop, and nowhere in the bar on a phone', () => {
    const { unmount } = renderShell();
    expect(screen.queryByTestId('rail-add')).not.toBeInTheDocument();
    unmount();

    // jsdom has no matchMedia, so there is nothing to spy on: stub it (unstubbed after the test).
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(min-width: 64rem)',
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    renderShell();
    expect(screen.getByTestId('rail-add')).toHaveAccessibleName('Add');
  });

  it('marks which way a move goes, for the route transition', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getAllByRole('link', { name: /^Chart/ })[0]!);
    expect(document.documentElement).toHaveAttribute('data-nav-dir', 'forward');
    await user.click(screen.getAllByRole('link', { name: /^Feed/ })[0]!);
    expect(document.documentElement).toHaveAttribute('data-nav-dir', 'back');
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
    expect(screen.getByRole('link', { name: /^חשבונות בנק/ })).toBeInTheDocument();
    await initTestI18n('en');
  });
});
