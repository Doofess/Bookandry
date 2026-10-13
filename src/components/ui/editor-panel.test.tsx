import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { Button } from './button';
import {
  EditorPanel,
  EditorPanelActions,
  EditorPanelBody,
  EditorPanelContent,
  EditorPanelDescription,
  EditorPanelHeader,
  EditorPanelTitle,
} from './editor-panel';

/** An add-transaction panel with the card editor that opens over it, as transaction-sheet.tsx nests them. */
function Harness() {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add
      </button>
      <EditorPanel open={open} onOpenChange={setOpen}>
        <EditorPanelContent>
          <EditorPanelHeader>
            <EditorPanelTitle>New transaction</EditorPanelTitle>
            <EditorPanelDescription>What it was, and how it was paid</EditorPanelDescription>
          </EditorPanelHeader>
          <label>
            Amount
            <input />
          </label>
          <button
            type="button"
            onClick={() => {
              setCard(true);
            }}
          >
            Edit card
          </button>
          <div data-slot="editor-actions">
            <button type="button">Cancel</button>
            <button type="submit">Save</button>
          </div>
          <EditorPanel open={card} onOpenChange={setCard}>
            <EditorPanelContent>
              <EditorPanelHeader>
                <EditorPanelTitle>Edit card</EditorPanelTitle>
              </EditorPanelHeader>
              <label>
                Label
                <input />
              </label>
            </EditorPanelContent>
          </EditorPanel>
        </EditorPanelContent>
      </EditorPanel>
    </>
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});

async function openPanel() {
  const user = userEvent.setup();
  renderWithProviders(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  return { user, panel: await screen.findByRole('dialog', { name: 'New transaction' }) };
}

describe('EditorPanel (§6.1)', () => {
  it('is a bottom sheet below lg and a floating panel at the inline end from lg, one popup by class', async () => {
    const { panel } = await openPanel();
    expect(panel).toHaveAttribute('data-slot', 'editor-panel');
    // Below lg: today's bottom sheet.
    expect(panel).toHaveClass('inset-be-0', 'start-0', 'end-0', 'max-h-[92dvh]', 'rounded-t-sheet');
    // From lg: 480px at the inline end, inset by the sheet gap, all four corners rounded.
    expect(panel).toHaveClass(
      'lg:end-sheet',
      'lg:start-auto',
      'lg:inset-bs-sheet',
      'lg:inset-be-sheet',
      'lg:w-120',
      'lg:rounded-sheet',
    );
  });

  it('moves only when motion is welcome: every translate is behind motion-safe', async () => {
    const { panel } = await openPanel();
    const moves = panel.className.split(/\s+/).filter((name) => /(^|:)-?translate-[xy]-/.test(name));
    expect(moves.length).toBeGreaterThan(0);
    for (const name of moves) expect(name).toMatch(/motion-safe:/);
  });

  it('has a round × in its header, named Close, and Escape closes it', async () => {
    const { user } = await openPanel();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('size-12', 'rounded-full');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New transaction' })).not.toBeInTheDocument();
    });
  });

  it('traps focus inside, and gives it back to the opener', async () => {
    const { user, panel } = await openPanel();
    expect(panel.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      await waitFor(() => {
        expect(panel.contains(document.activeElement)).toBe(true);
      });
    }
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
    });
  });

  it('keeps what was typed when the window crosses lg: it is the same popup', async () => {
    const { user } = await openPanel();
    const amount = screen.getByLabelText('Amount');
    await user.type(amount, '120');

    // The layout is CSS; a resize re-renders nothing that could remount the form.
    window.dispatchEvent(new Event('resize'));

    expect(screen.getByLabelText('Amount')).toBe(amount);
    expect(amount).toHaveValue('120');
  });

  it('pins the editor’s own Cancel and Save to its foot, at the inline end from lg', async () => {
    const { panel } = await openPanel();
    expect(panel).toHaveClass(
      '[&_[data-slot=editor-actions]]:sticky',
      '[&_[data-slot=editor-actions]]:inset-be-0',
      'lg:[&_[data-slot=editor-actions]]:justify-end',
    );
  });

  it('closes only the top panel of two, and the one underneath keeps its draft (Review Focus)', async () => {
    const { user } = await openPanel();
    await user.type(screen.getByLabelText('Amount'), '120');
    await user.click(screen.getByRole('button', { name: 'Edit card' }));
    await screen.findByRole('dialog', { name: 'Edit card' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit card' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('120');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit card' })).toHaveFocus();
    });
  });
  it('lines the header and the body up on one padding, with room under the title', () => {
    renderWithProviders(
      <EditorPanel open>
        <EditorPanelContent aria-label="Edit">
          <EditorPanelHeader>
            <EditorPanelTitle>Edit</EditorPanelTitle>
          </EditorPanelHeader>
          <EditorPanelBody>
            <input aria-label="Name" />
            <EditorPanelActions>
              <Button variant="pill">Cancel</Button>
              <Button variant="pill-solid">Save</Button>
            </EditorPanelActions>
          </EditorPanelBody>
        </EditorPanelContent>
      </EditorPanel>,
    );
    const header = document.querySelector('[data-slot="editor-panel-header"]');
    const body = document.querySelector('[data-slot="editor-panel-body"]');
    expect(header?.className).toMatch(/\bpx-5\b.*\blg:px-7\b/);
    expect(body?.className).toMatch(/\bpx-5\b.*\blg:px-7\b/);
    expect(header?.className).toMatch(/\bpb-4\b/);
    expect(
      screen.getByRole('button', { name: 'Save' }).closest('[data-slot="editor-actions"]'),
    ).not.toBeNull();
  });
});
