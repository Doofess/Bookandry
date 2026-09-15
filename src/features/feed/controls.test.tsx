import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { defaultFilters } from '@/domain/feed-filters';
import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Profile } from '@/types/domain';

import { FilterBar } from './filter-bar';
import { ProfileSwitcher } from './profile-switcher';

const DEFAULTS = { profileId: 'all', today: d('2026-09-15') };

const profile = (id: string, name: string, color: string): Profile => ({
  id,
  name,
  avatar: 'fox',
  color,
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: '2026-01-01T00:00:00.000Z' as Profile['createdAt'],
  updatedAt: '2026-01-01T00:00:00.000Z' as Profile['updatedAt'],
});

beforeAll(async () => {
  await initTestI18n('en');
});

describe('ProfileSwitcher', () => {
  it('renders nothing for a single profile', () => {
    const { container } = renderWithProviders(
      <ProfileSwitcher profiles={[profile('p1', 'Dana', '#16794a')]} active="p1" onSelect={vi.fn()} />,
    );
    // A segmented control with one segment is not a choice; it costs a row of
    // vertical space on a 375px screen to teach nothing.
    expect(container).toBeEmptyDOMElement();
  });

  it('offers All plus each profile once there are two', () => {
    renderWithProviders(
      <ProfileSwitcher
        profiles={[profile('p1', 'Dana', '#16794a'), profile('p2', 'Yossi', '#0369a1')]}
        active="all"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['All', 'Dana', 'Yossi']);
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  });

  it('is a named radiogroup, not a row of loose buttons', () => {
    const { container } = renderWithProviders(
      <ProfileSwitcher
        profiles={[profile('p1', 'Dana', '#16794a'), profile('p2', 'Yossi', '#0369a1')]}
        active="all"
        onSelect={vi.fn()}
      />,
    );
    const group = container.querySelector('[role="radiogroup"]');
    expect(group).toHaveAttribute('aria-label', 'Profile');
    for (const radio of container.querySelectorAll('[role="radio"]')) {
      expect(radio.closest('[role="radiogroup"]')).toBe(group);
    }
  });

  it('reports the selected profile id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileSwitcher
        profiles={[profile('p1', 'Dana', '#16794a'), profile('p2', 'Yossi', '#0369a1')]}
        active="all"
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    expect(onSelect).toHaveBeenCalledWith('p2');
  });
});

describe('FilterBar', () => {
  const filters = defaultFilters(DEFAULTS);

  it('writes the search term straight out, with no debounce of its own', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<FilterBar filters={filters} onChange={onChange} onClear={vi.fn()} />);

    await user.type(screen.getByRole('searchbox'), 'p');
    // useDeferredValue in the feed keeps typing at input priority; a debounce
    // here would delay the result even when there is time to spare.
    expect(onChange).toHaveBeenCalledWith({ query: 'p' });
  });

  it('switches the kind filter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<FilterBar filters={filters} onChange={onChange} onClear={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Income' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'income' });
  });

  it('offers Clear only when something is actually filtered', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <FilterBar filters={filters} onChange={vi.fn()} onClear={onClear} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    rerender(<FilterBar filters={{ ...filters, query: 'pizza' }} onChange={vi.fn()} onClear={onClear} />);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('does not treat the month or profile as a filter to clear', () => {
    // Changing either is navigation; offering to "clear" them would take the
    // user somewhere they did not ask to go.
    renderWithProviders(
      <FilterBar
        filters={{ ...filters, profileId: 'p1', month: d('2026-01-01') }}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
