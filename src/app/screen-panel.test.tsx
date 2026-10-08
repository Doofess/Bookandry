import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { ScreenPanel, ScreenTitle } from './screen-panel';
import { SettingsProvider } from './settings-provider';

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-09-15T10:00:00.000Z')) };

function renderPanel(title?: string) {
  return renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <ScreenPanel>{title === undefined ? null : <ScreenTitle>{title}</ScreenTitle>}</ScreenPanel>
    </SettingsProvider>,
  );
}

describe('ScreenPanel', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('holds the page title as the page h1, in the display face', () => {
    renderPanel('Cards');
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cards' });

    expect(h1).toHaveClass('font-display', 'text-[2rem]');
    expect(h1.closest('[data-slot="brand-panel"]')).not.toBeNull();
  });

  it('carries the account menu and, on a phone, the mark that goes home', () => {
    const { container } = renderPanel('Cards');
    const panel = container.querySelector<HTMLElement>('[data-slot="brand-panel"]');
    if (panel === null) throw new Error('no panel');

    expect(within(panel).getByRole('button', { name: 'Account and settings' })).toBeInTheDocument();
    const home = within(panel).getByRole('link', { name: /Bookandry/ });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveClass('lg:hidden');
  });

  it('has a square foot on desktop, so the sheet rises into it as on a phone', () => {
    const { container } = renderPanel('Cards');

    expect(container.querySelector('[data-slot="brand-panel"]')).toHaveClass(
      'lg:rounded-3xl',
      'lg:rounded-b-none',
    );
  });

  it('gives the account menu a 44px target', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Account and settings' })).toHaveClass('size-11');
  });
});
