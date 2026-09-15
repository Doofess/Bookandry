import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { EmptyState } from './empty-state';

const MONTH = d('2026-09-01');

beforeAll(async () => {
  await initTestI18n('en');
});

describe('EmptyState', () => {
  it('tells a brand-new install what to do next', () => {
    renderWithProviders(<EmptyState reason="no_data" month={MONTH} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText(/Add your first income or expense/)).toBeInTheDocument();
  });

  it('names the month when the month is the empty thing', () => {
    // So the user can tell "I am looking at the wrong month" from "I have no
    // data at all" - two different situations that "Nothing here" conflates.
    renderWithProviders(<EmptyState reason="empty_month" month={MONTH} />);
    expect(screen.getByText('Nothing in September 2026')).toBeInTheDocument();
  });

  it('offers a way back out of a filter', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EmptyState reason="no_results" month={MONTH} onClearFilters={onClear} />);

    expect(screen.getByText('No matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('offers no Clear button where there is nothing to clear', () => {
    renderWithProviders(<EmptyState reason="empty_month" month={MONTH} onClearFilters={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('gives each reason a distinct message', () => {
    const texts = new Set<string>();
    for (const reason of ['no_data', 'empty_month', 'no_results'] as const) {
      const { container, unmount } = renderWithProviders(<EmptyState reason={reason} month={MONTH} />);
      texts.add(container.textContent);
      unmount();
    }
    // One message for three situations is a message for none of them.
    expect(texts.size).toBe(3);
  });
});
