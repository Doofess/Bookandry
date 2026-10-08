import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY, skip } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, Override, Recurrence } from '@/types/domain';

import { RowActionsSheet } from './row-actions-sheet';

const TODAY = d('2026-09-15');

beforeAll(async () => {
  await initTestI18n();
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

const render = (target: Occurrence | undefined, onAction = vi.fn()) => {
  const result = renderWithProviders(
    <RowActionsSheet occurrence={target} onOpenChange={vi.fn()} onAction={onAction} />,
  );
  return { ...result, onAction };
};

/*
 * The two deletes are told apart by their HINT, not by the word "Delete".
 *
 * Each button's accessible name is its label run together with its hint, and
 * the hint is the assertion worth making anyway: it is the half that tells the
 * user which of the two they are about to do.
 */
const SERIES_DELETE = /every occurrence, past and future/i;
/* Not merely "recoverable for 24 hours" - BOTH hints say that, so a matcher
   built on it matches the series delete too and proves nothing. */
const SINGLE_DELETE = /24 hours from settings/i;

describe('what a series offers', () => {
  const series = () => occurrence({ type: 'monthly', dayOfMonth: 10 });

  it('offers edit, skip and delete-the-whole-series', () => {
    render(series());

    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip this one/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SERIES_DELETE })).toBeInTheDocument();
  });

  it('says the delete takes the WHOLE series', () => {
    // Silently deleting one occurrence under a label that reads "delete" is
    // how a year of rent disappears - and the reverse is worse.
    render(series());

    expect(screen.queryByRole('button', { name: SINGLE_DELETE })).not.toBeInTheDocument();
  });

  it('offers RESTORE instead of skip once an occurrence is skipped', () => {
    const skipped = occurrence({ type: 'monthly', dayOfMonth: 10 }, [skip('rent', d('2026-09-10'))]);

    render(skipped);

    expect(screen.getByRole('button', { name: /bring this one back/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip this one/i })).not.toBeInTheDocument();
  });
});

describe('what a one-time transaction offers', () => {
  const single = () => occurrence({ type: 'one_time' });

  it('does NOT offer skip', () => {
    /*
     * For a one-time transaction "skip" and "delete" are the same act, and
     * offering both invites the user to pick the one that is NOT recoverable
     * from Settings.
     */
    render(single());

    expect(screen.queryByRole('button', { name: /skip this one/i })).not.toBeInTheDocument();
  });

  it('offers a plain delete, recoverable from Settings', () => {
    render(single());

    expect(screen.getByRole('button', { name: SINGLE_DELETE })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SERIES_DELETE })).not.toBeInTheDocument();
  });
});

describe('choosing an action', () => {
  it('reports the action and the occurrence it was chosen for', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'monthly', dayOfMonth: 10 });
    const { onAction } = render(target);

    await user.click(screen.getByRole('button', { name: /skip this one/i }));

    expect(onAction).toHaveBeenCalledWith('skip', target);
  });

  it('renders nothing when closed', () => {
    render(undefined);

    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });
});

describe('splitting a purchase from its menu', () => {
  it('is offered only when the row’s card can split it', async () => {
    const target = occurrence({ type: 'one_time' });
    const { onAction, unmount } = render(target);
    expect(screen.queryByRole('button', { name: 'Split into payments' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <RowActionsSheet occurrence={target} split="offer" onOpenChange={vi.fn()} onAction={onAction} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Split into payments' }));
    expect(onAction).toHaveBeenCalledWith('split', target);
  });

  it('on a card without a billing day, says to set it instead of offering the split', () => {
    renderWithProviders(
      <RowActionsSheet
        occurrence={occurrence({ type: 'one_time' })}
        split="needs_billing_day"
        onOpenChange={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Split into payments' })).not.toBeInTheDocument();
    expect(
      screen.getByText("To split this purchase into payments, set the card's billing day first."),
    ).toBeInTheDocument();
  });

  it('says so in Hebrew', async () => {
    await initTestI18n('he');
    try {
      renderWithProviders(
        <RowActionsSheet
          occurrence={occurrence({ type: 'one_time' })}
          split="needs_billing_day"
          onOpenChange={vi.fn()}
          onAction={vi.fn()}
        />,
      );
      expect(
        screen.getByText('כדי לפרוס את העסקה לתשלומים, הגדירו קודם את מועד החיוב של הכרטיס.'),
      ).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });
});
