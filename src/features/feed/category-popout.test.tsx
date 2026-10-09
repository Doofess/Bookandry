import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Occurrence, Recurrence } from '@/types/domain';

import { CategoryPopout, type CategoryTarget } from './category-popout';

/** True while a test wants the frequent categories still loading. */
const frequent = vi.hoisted(() => ({ loading: false }));

vi.mock('./use-frequent-categories', () => ({
  useFrequentCategories: (_kind: string, _current: string, categories: readonly Category[]) =>
    frequent.loading ? undefined : categories.filter((c) => c.kind === 'expense').slice(0, 7),
}));

const TODAY = d('2026-09-15');
const cat = (id: string, sortOrder: number): Category =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder,
    isArchived: 0,
    source: 'custom',
    name: id,
  }) as unknown as Category;
const CATEGORIES = new Map(
  ['rent', 'food', 'fuel', 'gym', 'kids', 'pets', 'fun', 'misc'].map((id, i) => [id, cat(id, i)]),
);

function occurrence(recurrence: Recurrence): Occurrence {
  const tx = makeTx({ id: 'rent', date: d('2026-09-10'), recurrence, money: MONEY });
  const found = expandOccurrences({ ...tx, categoryId: 'rent' }, [], d('2026-09-01'), d('2026-09-30'), {
    today: TODAY,
  })[0];
  if (found === undefined) throw new Error('no occurrence');
  return found;
}

/** The anchors each test put on the page; the rendered tree is RTL's to clean up. */
const anchors: HTMLElement[] = [];

/** The row's chip, which the pop-out is anchored to. */
function chip(): HTMLButtonElement {
  const anchor = document.createElement('button');
  anchor.textContent = 'chip';
  document.body.append(anchor);
  anchors.push(anchor);
  return anchor;
}

function renderPopout(target: Occurrence) {
  const anchor = chip();
  const onChange = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <CategoryPopout
      target={{ occurrence: target, anchor }}
      categories={CATEGORIES}
      today={TODAY}
      onClose={onClose}
      onChange={onChange}
    />,
  );
  return { onChange, onClose, anchor };
}

/** The screen's own wiring: closing the pop-out clears its target. */
function Screen({ initial, onClose }: { readonly initial: CategoryTarget; readonly onClose: () => void }) {
  const [target, setTarget] = useState<CategoryTarget | undefined>(initial);
  return (
    <CategoryPopout
      target={target}
      categories={CATEGORIES}
      today={TODAY}
      onClose={() => {
        onClose();
        setTarget(undefined);
      }}
      onChange={() => {
        setTarget(undefined);
      }}
    />
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});
beforeEach(() => {
  // More's list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});
afterEach(() => {
  for (const anchor of anchors.splice(0)) anchor.remove();
  frequent.loading = false;
});

describe('CategoryPopout', () => {
  it('is a dialog named Category', async () => {
    renderPopout(occurrence({ type: 'one_time' }));

    expect(await screen.findByRole('dialog', { name: 'Category' })).toBeInTheDocument();
  });

  it('shows seven categories and More in a 4×2 grid, the current one filled sapphire', async () => {
    renderPopout(occurrence({ type: 'one_time' }));
    const grid = await screen.findByRole('group', { name: 'Category' });
    const cells = within(grid).getAllByRole('button');

    expect(cells).toHaveLength(8);
    expect(grid).toHaveClass('grid-cols-4');
    expect(cells.at(-1)).toHaveTextContent('More');
    expect(within(grid).getByRole('button', { name: /rent/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByRole('button', { name: /rent/ })).toHaveClass('bg-primary');
    for (const cell of cells) expect(cell).toHaveClass('min-h-16');
  });

  it('holds seven same-size places while the frequent ones load, so it opens at its full size', async () => {
    // Only "More" while loading, the arrowed pop-out grew once they came, and could flip.
    frequent.loading = true;
    renderPopout(occurrence({ type: 'one_time' }));
    const grid = await screen.findByRole('group', { name: 'Category' });
    const places = grid.querySelectorAll('[data-slot="category-placeholder"]');

    expect(places).toHaveLength(7);
    for (const place of places) {
      expect(place).toHaveClass('min-h-16');
      expect(place).toHaveAttribute('aria-hidden', 'true');
    }
    expect(within(grid).getAllByRole('button')).toHaveLength(1);
  });

  it('changes a one-time row at once', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'one_time' });
    const { onChange } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /food/ }));
    expect(onChange).toHaveBeenCalledWith(target, 'food', 'one');
  });

  it('does nothing, and stays open, for the category the row already has', async () => {
    const user = userEvent.setup();
    const { onChange, onClose } = renderPopout(occurrence({ type: 'monthly', dayOfMonth: 10 }));

    await user.click(await screen.findByRole('button', { name: /rent/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Category' })).toBeInTheDocument();
  });

  it('asks a series "only this time" or "from now on", in place', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'monthly', dayOfMonth: 10 });
    const { onChange } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /food/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Change it to food for…')).toBeInTheDocument();
    const once = screen.getByRole('button', { name: 'Only this time' });
    expect(once).toHaveFocus();
    expect(screen.getByRole('button', { name: 'From now on' })).toHaveClass('min-h-11');
    expect(screen.queryByRole('button', { name: 'Every payment' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'From now on' }));
    expect(onChange).toHaveBeenCalledWith(target, 'food', 'future');
  });

  it('asks a plan "only this time" or "every payment", never "from now on"', async () => {
    // A plan is one agreement: the domain never splits it, so "from now on"
    // would recolour the payments already made too. The edit form offers the same two.
    const user = userEvent.setup();
    const target = occurrence({ type: 'monthly', dayOfMonth: 10, installments: 12 });
    const { onChange } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /food/ }));
    expect(screen.getByRole('button', { name: 'Only this time' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'From now on' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Every payment' }));
    expect(onChange).toHaveBeenCalledWith(target, 'food', 'all');
  });

  it('opens the full picker from More', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'one_time' });
    const { onChange } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('option', { name: /misc/ }));
    expect(onChange).toHaveBeenCalledWith(target, 'misc', 'one');
  });

  it('gives focus back to the chip on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const target = { occurrence: occurrence({ type: 'one_time' }), anchor: chip() };
    renderWithProviders(<Screen initial={target} onClose={onClose} />);
    await screen.findByRole('group', { name: 'Category' });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(target.anchor).toHaveFocus();
  });
});
