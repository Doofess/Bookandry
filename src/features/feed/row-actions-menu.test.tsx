import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, type Mock, vi } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY, skip } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, Override, Recurrence } from '@/types/domain';

import { RowActionsMenu, type RowAction, type RowMenuTarget } from './row-actions-menu';

const TODAY = d('2026-09-15');

beforeAll(async () => {
  await initTestI18n();
});

/** The anchors each test put on the page; the rendered tree is RTL's to clean up. */
const anchors: HTMLElement[] = [];

afterEach(() => {
  for (const anchor of anchors.splice(0)) anchor.remove();
});

function occurrence(recurrence: Recurrence, overrides: readonly Override[] = []): Occurrence {
  const tx = makeTx({ id: 'rent', date: d('2026-09-10'), recurrence, money: MONEY }, overrides);
  const found = expandOccurrences(tx, overrides, d('2026-09-01'), d('2026-09-30'), {
    today: TODAY,
    includeSkipped: true,
  })[0];
  if (found === undefined) throw new Error('no occurrence');
  return found;
}

/** The row's ⋯ button, which the menu is anchored to. */
function anchorButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'more';
  document.body.append(button);
  anchors.push(button);
  return button;
}

type Split = 'offer' | 'needs_billing_day' | undefined;
type OnAction = (action: RowAction, occurrence: Occurrence) => void;

const render = (
  occurrence: Occurrence | undefined,
  {
    split,
    onAction = vi.fn<OnAction>(),
    onClose = vi.fn<() => void>(),
  }: { split?: Split; onAction?: Mock<OnAction>; onClose?: Mock<() => void> } = {},
) => {
  const target: RowMenuTarget | undefined =
    occurrence === undefined ? undefined : { occurrence, anchor: anchorButton() };
  const result = renderWithProviders(
    <RowActionsMenu target={target} split={split} onClose={onClose} onAction={onAction} />,
  );
  return { ...result, onAction, onClose, target };
};

/** The screen's own wiring: closing the menu clears its target. */
function Screen({ initial, onClose }: { readonly initial: RowMenuTarget; readonly onClose: () => void }) {
  const [target, setTarget] = useState<RowMenuTarget | undefined>(initial);
  return (
    <RowActionsMenu
      target={target}
      onClose={() => {
        onClose();
        setTarget(undefined);
      }}
      onAction={() => {
        setTarget(undefined);
      }}
    />
  );
}

/*
 * The two deletes are told apart by their HINT, not by the word "Delete".
 *
 * Each item's accessible name is its label run together with its hint, and
 * the hint is the assertion worth making anyway: it is the half that tells the
 * user which of the two they are about to do.
 */
const SERIES_DELETE = /every occurrence, past and future/i;
/* Not merely "recoverable for 24 hours" - BOTH hints say that, so a matcher
   built on it matches the series delete too and proves nothing. */
const SINGLE_DELETE = /24 hours from settings/i;

describe('what a series offers', () => {
  const series = () => occurrence({ type: 'monthly', dayOfMonth: 10 });

  it('offers edit, skip and delete-the-whole-series', async () => {
    render(series());

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: /skip this one/i })).toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: SERIES_DELETE })).toBeInTheDocument();
  });

  it('says the delete takes the WHOLE series', async () => {
    // Silently deleting one occurrence under a label that reads "delete" is
    // how a year of rent disappears - and the reverse is worse.
    render(series());
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: SINGLE_DELETE })).not.toBeInTheDocument();
  });

  it('offers RESTORE instead of skip once an occurrence is skipped', async () => {
    const skipped = occurrence({ type: 'monthly', dayOfMonth: 10 }, [skip('rent', d('2026-09-10'))]);

    render(skipped);

    expect(await screen.findByRole('menuitem', { name: /bring this one back/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /skip this one/i })).not.toBeInTheDocument();
  });
});

describe('what a one-time transaction offers', () => {
  const single = () => occurrence({ type: 'one_time' });

  it('does NOT offer skip', async () => {
    /*
     * For a one-time transaction "skip" and "delete" are the same act, and
     * offering both invites the user to pick the one that is NOT recoverable
     * from Settings.
     */
    render(single());
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /skip this one/i })).not.toBeInTheDocument();
  });

  it('offers a plain delete, recoverable from Settings', async () => {
    render(single());

    expect(await screen.findByRole('menuitem', { name: SINGLE_DELETE })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: SERIES_DELETE })).not.toBeInTheDocument();
  });
});

describe('choosing an action', () => {
  it('reports the action and the occurrence it was chosen for', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'monthly', dayOfMonth: 10 });
    const { onAction } = render(target);

    await user.click(await screen.findByRole('menuitem', { name: /skip this one/i }));

    expect(onAction).toHaveBeenCalledWith('skip', target);
  });

  it('renders nothing when closed', () => {
    render(undefined);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument();
  });
});

describe('splitting a purchase from its menu', () => {
  it('is offered only when the row’s card can split it', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'one_time' });
    const { onAction, unmount } = render(target);
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: /^Split into payments$/ })).not.toBeInTheDocument();
    unmount();

    render(target, { split: 'offer', onAction });
    await user.click(await screen.findByRole('menuitem', { name: /^Split into payments$/ }));
    expect(onAction).toHaveBeenCalledWith('split', target);
  });

  it('on a card without a billing day, shows the split disabled, with the reason', async () => {
    const user = userEvent.setup();
    const { onAction } = render(occurrence({ type: 'one_time' }), { split: 'needs_billing_day' });

    const item = await screen.findByRole('menuitem', { name: /^Split into payments/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText("To split this purchase into payments, set the card's billing day first."),
    ).toBeInTheDocument();

    await user.click(item);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('says so in Hebrew', async () => {
    await initTestI18n('he');
    try {
      render(occurrence({ type: 'one_time' }), { split: 'needs_billing_day' });
      expect(
        await screen.findByText('כדי לפרוס את העסקה לתשלומים, הגדירו קודם את מועד החיוב של הכרטיס.'),
      ).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });
});

describe('the menu itself', () => {
  const labels = () =>
    screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('[data-slot="popup-item-label"]')?.textContent);

  it('offers Edit, Duplicate, Skip, a divider, then Delete, in that order, for a series', async () => {
    render(occurrence({ type: 'monthly', dayOfMonth: 10 }));
    await screen.findByRole('menu');

    expect(labels()).toEqual(['Edit', 'Duplicate', 'Skip this one', 'Delete the whole series']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('puts Split after Duplicate and before Skip', async () => {
    render(occurrence({ type: 'monthly', dayOfMonth: 10 }), { split: 'offer' });
    await screen.findByRole('menu');

    expect(labels()).toEqual([
      'Edit',
      'Duplicate',
      'Split into payments',
      'Skip this one',
      'Delete the whole series',
    ]);
  });

  it('offers Duplicate for a one-time row too, and reports it', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'one_time' });
    const { onAction } = render(target);

    await user.click(await screen.findByRole('menuitem', { name: /^duplicate$/i }));
    expect(onAction).toHaveBeenCalledWith('duplicate', target);
  });

  it('is anchored to the row with an arrow, and every item clears 44px on a phone', async () => {
    render(occurrence({ type: 'one_time' }));
    const menu = await screen.findByRole('menu');

    expect(menu.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();
    for (const item of screen.getAllByRole('menuitem')) expect(item).toHaveClass('min-h-11');
  });

  it('gives focus back to the row button on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const target = { occurrence: occurrence({ type: 'one_time' }), anchor: anchorButton() };
    renderWithProviders(<Screen initial={target} onClose={onClose} />);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    await expect.poll(() => screen.queryByRole('menu')).toBeNull();
    expect(target.anchor).toHaveFocus();
  });

  it('closes when the virtualiser unmounts the row it is anchored to', async () => {
    const { target, onClose } = render(occurrence({ type: 'one_time' }));
    await screen.findByRole('menu');

    act(() => {
      target?.anchor.remove();
    });
    await expect.poll(() => onClose.mock.calls.length).toBeGreaterThan(0);
  });
});
