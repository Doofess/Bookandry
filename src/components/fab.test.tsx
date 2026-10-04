import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { Fab } from './fab';

describe('Fab', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is a real button with an accessible name', async () => {
    await initTestI18n('en');
    renderWithProviders(<Fab onClick={() => undefined} />);
    // Icon-only, so the name has to come from aria-label or it is unusable
    // with a screen reader.
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('calls onClick', async () => {
    await initTestI18n('en');
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Fab onClick={onClick} />);

    await user.click(screen.getByTestId('fab'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    await initTestI18n('en');
    const onClick = vi.fn();
    renderWithProviders(<Fab onClick={onClick} disabled />);
    expect(screen.getByTestId('fab')).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is reachable and operable by keyboard', async () => {
    await initTestI18n('en');
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Fab onClick={onClick} />);

    await user.tab();
    expect(screen.getByTestId('fab')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });

  it('uses the FAB tokens rather than ad-hoc colours', () => {
    renderWithProviders(<Fab onClick={() => undefined} />);
    const cls = screen.getByTestId('fab').className;
    expect(cls).toContain('bg-fab');
    expect(cls).toContain('text-fab-foreground');
    // The rim is what makes the disc perceivable on a white page (SC 1.4.11).
    expect(cls).toContain('ring-fab-rim');
  });

  it('never flips the plus icon, which is non-directional', () => {
    renderWithProviders(<Fab onClick={() => undefined} />);
    const icon = screen.getByTestId('fab').querySelector('svg');
    expect(icon?.getAttribute('class') ?? '').not.toContain('rtl:rotate-180');
  });

  it('positions itself with logical offsets so it mirrors in RTL', async () => {
    await initTestI18n('he');
    renderWithProviders(<Fab onClick={() => undefined} />);
    const cls = screen.getByTestId('fab').className;
    // `lg:end-6`, not `lg:right-6`: in Hebrew the button belongs on the left.
    expect(cls).toContain('lg:end-6');
    expect(cls).not.toContain('lg:right-6');
    await initTestI18n('en');
  });

  it('is labelled in Hebrew when the language is he', async () => {
    await initTestI18n('he');
    renderWithProviders(<Fab onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'הוספת תנועה' })).toBeInTheDocument();
    await initTestI18n('en');
  });
});

describe('Fab geometry', () => {
  it('declares equal width and height so it renders a CIRCLE, not an oval', () => {
    // Regression: `w-max` alongside the size class overrode the width and produced a
    // visibly squashed oval. Caught in a screenshot, pinned here.
    renderWithProviders(<Fab onClick={() => undefined} />);
    const cls = screen.getByTestId('fab').className;
    expect(cls).toContain('size-12');
    expect(cls).toContain('rounded-full');
    expect(cls).not.toMatch(/(^|\s)w-(max|min|fit|auto|\d)/);
    expect(cls).not.toMatch(/(^|\s)h-(max|min|fit|auto|\d)/);
  });
});
