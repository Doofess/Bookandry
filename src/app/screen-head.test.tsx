import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { HeroSheet, ScreenHead, ScreenSheet } from './screen-head';
import { SettingsProvider } from './settings-provider';

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-09-15T10:00:00.000Z')) };

const render = (ui: ReactElement) =>
  renderWithProviders(<SettingsProvider value={SETTINGS}>{ui}</SettingsProvider>);

describe('ScreenHead (§7.7)', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('names the screen as the page’s h1: Karantina on a phone, the 38px title pair from lg', () => {
    render(<ScreenHead title="Cards" subtitle="three of them" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cards three of them' });
    expect(h1).toHaveClass(
      'font-display',
      'text-(length:--text-screen-name)',
      'lg:text-(length:--text-title-screen)',
      'lg:font-semibold',
    );
  });

  it('carries the mark home and the account menu on a phone; from lg both are in the rail', () => {
    const { container } = render(<ScreenHead title="Cards" />);
    const head = container.querySelector<HTMLElement>('[data-slot="screen-head"]');
    if (head === null) throw new Error('no head');
    const home = within(head).getByRole('link', { name: /Bookandry/ });
    expect(home).toHaveAttribute('href', '/');
    expect(home.parentElement).toHaveClass('lg:hidden');
    // A 44px target around the picture.
    expect(within(head).getByRole('button', { name: 'Account and settings' })).toHaveClass('size-11');
  });

  it('puts the screen’s one action beside its name', () => {
    render(<ScreenHead title="Cards" actions={<Button variant="pill">Add a card</Button>} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.parentElement).toContainElement(screen.getByRole('button', { name: 'Add a card' }));
  });

  it('can be the mark and the menu alone, for a page that names itself', () => {
    render(<ScreenHead />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account and settings' })).toBeInTheDocument();
  });

  it('draws the hero as the ink sheet, and a screen’s body as a rounded paper body', () => {
    render(
      <>
        <HeroSheet>pills</HeroSheet>
        <ScreenSheet>body</ScreenSheet>
      </>,
    );
    expect(screen.getByText('pills')).toHaveAttribute('data-sheet', 'night');
    expect(screen.getByText('pills')).toHaveClass('rounded-sheet');
    expect(screen.getByText('body')).toHaveClass('rounded-sheet', 'bg-card', 'mbs-sheet');
    expect(screen.getByText('body')).not.toHaveAttribute('data-sheet');
  });

  it('sets a pill given as the action 44px on a phone (§9.6)', () => {
    const { container } = render(
      <ScreenHead title="Cards" actions={<Button variant="pill-solid">New</Button>} />,
    );
    const wrapper = screen.getByRole('button', { name: 'New' }).parentElement;
    expect(wrapper?.className).toContain('max-lg:[&_[data-variant^=pill]]:min-h-11');
    expect(container).toBeTruthy();
  });
});
