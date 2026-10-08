import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';
import type { PaymentMethod } from '@/types/domain';

import { CardMenu, type CardMenuTarget } from './card-menu';

const card = (linked: boolean): PaymentMethod =>
  ({
    id: 'card-1',
    type: 'credit_card',
    label: 'Max Gold',
    profileId: 'p1',
    card: linked
      ? { issuer: 'max', catalog: { issuer: 'max', bank: '20', tier: 'gold', version: 1 } }
      : { issuer: 'max' },
  }) as unknown as PaymentMethod;

/** The anchors each test put on the page; the rendered tree is RTL's to clean up. */
const anchors: HTMLElement[] = [];

/** The card's ⋯, which the menu is anchored to. */
function anchorButton(): HTMLButtonElement {
  const anchor = document.createElement('button');
  anchor.textContent = '⋯';
  document.body.append(anchor);
  anchors.push(anchor);
  return anchor;
}

function renderMenu(linked: boolean, aiAvailable = true) {
  const anchor = anchorButton();
  const props = { onAction: vi.fn(), onClose: vi.fn() };
  renderWithProviders(
    <CardMenu target={{ card: card(linked), anchor }} aiAvailable={aiAvailable} {...props} />,
  );
  return { ...props, anchor };
}

/** The screen's own wiring: closing the menu clears its target. */
function Screen({ initial }: { readonly initial: CardMenuTarget }) {
  const [target, setTarget] = useState<CardMenuTarget | undefined>(initial);
  return (
    <CardMenu
      target={target}
      aiAvailable
      onClose={() => {
        setTarget(undefined);
      }}
      onAction={() => {
        setTarget(undefined);
      }}
    />
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});
afterEach(() => {
  for (const anchor of anchors.splice(0)) anchor.remove();
});

describe('CardMenu', () => {
  it('offers edit, the interest table, transactions, import, then archive, for a linked card', async () => {
    renderMenu(true);
    const items = await screen.findAllByRole('menuitem');

    expect(items.map((i) => i.textContent)).toEqual([
      'Edit card',
      'Interest table',
      'Transactions on this card',
      'Import a statement',
      'Archive',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    for (const item of items) expect(item).toHaveClass('min-h-11');
  });

  it('hides the interest table for a card not linked to the catalog', async () => {
    renderMenu(false);
    await screen.findAllByRole('menuitem');

    expect(screen.queryByRole('menuitem', { name: 'Interest table' })).not.toBeInTheDocument();
  });

  it.each([
    ['Edit card', 'edit'],
    ['Interest table', 'rates'],
    ['Transactions on this card', 'transactions'],
    ['Import a statement', 'import'],
    ['Archive', 'archive'],
  ] as const)('%s reports %s', async (name, action) => {
    const user = userEvent.setup();
    const { onAction } = renderMenu(true);

    await user.click(await screen.findByRole('menuitem', { name }));
    expect(onAction).toHaveBeenCalledWith(action, expect.objectContaining({ id: 'card-1' }));
  });

  it('disables import when there is no account server, and says why', async () => {
    renderMenu(true, false);

    expect(await screen.findByRole('menuitem', { name: /Import a statement/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('Needs a Bookandry account')).toBeInTheDocument();
  });

  it('draws an arrow at what was pressed, and leaves the page free to scroll', async () => {
    renderMenu(true);
    const menu = await screen.findByRole('menu');

    expect(menu.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();
    // A modal menu locks the page with overflow: hidden on the body.
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('gives focus back to the ⋯ on Escape', async () => {
    const user = userEvent.setup();
    const anchor = anchorButton();
    renderWithProviders(<Screen initial={{ card: card(true), anchor }} />);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    await expect.poll(() => screen.queryByRole('menu')).toBeNull();
    expect(anchor).toHaveFocus();
  });

  it('says it in Hebrew', async () => {
    await initTestI18n('he');
    try {
      renderMenu(true);
      expect(await screen.findByRole('menuitem', { name: 'טבלת הריביות' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'העברה לארכיון' })).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });
});
