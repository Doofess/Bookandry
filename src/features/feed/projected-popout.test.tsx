import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { materialize } from '@/db/materialize';
import { moveOccurrence } from '@/db/occurrence-actions';
import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { freshDb } from '@/test/db-harness';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod, Recurrence } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { ProjectedPopout, type ProjectedTarget } from './projected-popout';

const TODAY = d('2026-09-15');

function projected(recurrence: Recurrence, date = '2026-09-10', on = '2026-10-10'): Occurrence {
  const tx = makeTx({ id: 'rent', date: d(date), recurrence, money: MONEY });
  const found = expandOccurrences(tx, [], d(on), d(on), { today: TODAY })[0];
  if (found === undefined) throw new Error('no occurrence');
  return found;
}

/** The anchors each test put on the page; the rendered tree is RTL's to clean up. */
const anchors: HTMLElement[] = [];

/** The row's "not counted yet" chip, which the pop-out is anchored to. */
function chip(): HTMLButtonElement {
  const anchor = document.createElement('button');
  anchor.textContent = 'chip';
  document.body.append(anchor);
  anchors.push(anchor);
  return anchor;
}

function renderPopout(target: Occurrence) {
  const anchor = chip();
  const props = { onMove: vi.fn(), onAmount: vi.fn(), onClose: vi.fn() };
  renderWithProviders(<ProjectedPopout target={{ occurrence: target, anchor }} today={TODAY} {...props} />);
  return { ...props, anchor };
}

/** The screen's own wiring: closing the pop-out clears its target. */
function Screen({ initial }: { readonly initial: ProjectedTarget }) {
  const [target, setTarget] = useState<ProjectedTarget | undefined>(initial);
  return (
    <ProjectedPopout
      target={target}
      today={TODAY}
      onClose={() => {
        setTarget(undefined);
      }}
      onMove={vi.fn()}
      onAmount={vi.fn()}
    />
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});
afterEach(() => {
  for (const anchor of anchors.splice(0)) anchor.remove();
});

describe('ProjectedPopout', () => {
  it('is a dialog named Not counted yet', async () => {
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));

    expect(await screen.findByRole('dialog', { name: 'Not counted yet' })).toBeInTheDocument();
  });

  it('offers the three choices, each at least 44px', async () => {
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));

    for (const name of [/Charged today/, /A different amount/, /A different date/]) {
      expect(await screen.findByRole('button', { name })).toHaveClass('min-h-11');
    }
  });

  it('"Charged today" moves this occurrence to today', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onMove } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /Charged today/ }));
    expect(onMove).toHaveBeenCalledWith(target, '2026-09-15');
  });

  it('says "Charged today" counts it in the balance now, for a payment not on a card', async () => {
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));

    expect(await screen.findByRole('button', { name: /Charged today/ })).toHaveAccessibleName(
      /Count it in the balance now/,
    );
  });

  it('says "Charged today" goes on the card’s next bill, for a payment on a card with a billing day', async () => {
    const card: PaymentMethod = {
      id: 'pm.card',
      profileId: 'p1',
      type: 'credit_card',
      label: 'Max',
      card: { billingDay: 10 },
      isArchived: 0,
      createdAt: '2026-01-01T00:00:00.000Z' as IsoInstant,
      updatedAt: '2026-01-01T00:00:00.000Z' as IsoInstant,
    };
    const tx = makeTx({
      id: 'gym',
      date: d('2026-09-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      money: MONEY,
      paymentMethodId: card.id,
    });
    const target = expandOccurrences(tx, [], d('2026-10-10'), d('2026-10-10'), { today: TODAY })[0];
    if (target === undefined) throw new Error('no occurrence');
    renderWithProviders(
      <ProjectedPopout
        target={{ occurrence: target, anchor: chip() }}
        today={TODAY}
        methods={new Map([[card.id, card]])}
        onClose={vi.fn()}
        onMove={vi.fn()}
        onAmount={vi.fn()}
      />,
    );

    const today = await screen.findByRole('button', { name: /Charged today/ });
    expect(today).toHaveAccessibleName(/Moves to this card’s next bill/);
    expect(today).not.toHaveAccessibleName(/balance/);
  });

  it('"Charged today", wired as the feed wires it, writes a modify override dated today', async () => {
    // The dom project loads fake-indexeddb (src/test/setup.db.ts), so the real write runs here.
    const handle = freshDb();
    const tx = materialize({
      id: 'rent',
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.rent',
      money: MONEY,
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      date: d('2026-03-10'),
      seriesRootId: 'rent',
      createdAt: '2026-01-01T00:00:00.000Z' as IsoInstant,
      updatedAt: '2026-01-01T00:00:00.000Z' as IsoInstant,
    });
    await handle.db.transactions.add(tx);
    const target = expandOccurrences(tx, [], d('2026-10-10'), d('2026-10-10'), { today: TODAY })[0];
    if (target === undefined) throw new Error('no occurrence');

    const moved = new Promise<void>((resolve) => {
      renderWithProviders(
        <ProjectedPopout
          target={{ occurrence: target, anchor: chip() }}
          today={TODAY}
          onClose={vi.fn()}
          onAmount={vi.fn()}
          onMove={(occurrence, to) => {
            void moveOccurrence(handle.db, {
              occurrence,
              to,
              today: TODAY,
              now: '2026-09-15T10:00:00.000Z' as IsoInstant,
              newId: counterIdFactory('ov'),
            }).then(() => {
              resolve();
            });
          }}
        />,
      );
    });

    await userEvent.setup().click(await screen.findByRole('button', { name: /Charged today/ }));
    await moved;
    expect(await handle.db.overrides.toArray()).toEqual([
      expect.objectContaining({
        action: 'modify',
        occurrenceDate: '2026-10-10',
        patch: { date: '2026-09-15' },
      }),
    ]);
    await handle.dispose();
  });

  it('"A different amount…" opens the edit form', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onAmount } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /A different amount/ }));
    expect(onAmount).toHaveBeenCalledWith(target);
  });

  it('"A different date…" opens the calendar in place, and moves there', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onMove } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    await user.click(await screen.findByRole('button', { name: /October 3rd/ }));
    expect(onMove).toHaveBeenCalledWith(target, '2026-10-03');
  });

  it('puts focus on the row’s own day when the calendar opens', async () => {
    const user = userEvent.setup();
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    expect(await screen.findByRole('button', { name: /October 10th/ })).toHaveFocus();
  });

  it('disables "Charged today" for a series that has not started, and says why', async () => {
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }, '2026-10-10', '2026-10-10'));
    const today = await screen.findByRole('button', { name: /Charged today/ });

    expect(today).toBeDisabled();
    expect(today).toHaveTextContent(/The series starts on Oct 10, 2026/);
  });

  it('stops the calendar at the feed’s horizon, the last month › reaches', async () => {
    // Today is 2026-09-15: › stops at September 2027. A day past it is in no month the feed can show.
    const user = userEvent.setup();
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }, '2026-09-10', '2027-09-10'));

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    expect(await screen.findByRole('button', { name: /September 30th, 2027/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next month/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('closes without a move when the row’s own day is picked again', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onMove, onClose } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    await user.click(await screen.findByRole('button', { name: /October 10th/ }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('goes back from the calendar to the three choices', async () => {
    const user = userEvent.setup();
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(back).toHaveClass('min-h-11');
    // The chevron points back along the reading direction, so it flips in Hebrew.
    expect(back.querySelector('svg')).toHaveClass('rtl:rotate-180');

    await user.click(back);
    expect(await screen.findByRole('button', { name: /Charged today/ })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A different date/ })).toHaveFocus();
  });

  it('keeps a series from moving to before it starts in the calendar too', async () => {
    const user = userEvent.setup();
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }, '2026-10-10', '2026-10-10'));

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    expect(await screen.findByRole('button', { name: /October 9/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /October 10/ })).toBeEnabled();
  });

  it('lets a one-time row move to any day, today included', async () => {
    const target = projected({ type: 'one_time' }, '2026-10-10', '2026-10-10');
    renderPopout(target);

    expect(await screen.findByRole('button', { name: /Charged today/ })).toBeEnabled();
  });

  it('gives focus back to the chip on Escape', async () => {
    const user = userEvent.setup();
    const target = { occurrence: projected({ type: 'monthly', dayOfMonth: 10 }), anchor: chip() };
    renderWithProviders(<Screen initial={target} />);
    await screen.findByRole('button', { name: /Charged today/ });

    await user.keyboard('{Escape}');
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(target.anchor).toHaveFocus();
  });
});
