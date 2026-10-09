import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { MoneyTile, MoneyTileGroup } from './money-tile';

beforeAll(async () => {
  await initTestI18n('en');
});

function Issuers({ onChange = vi.fn() }: { readonly onChange?: (value: string) => void }) {
  const [value, setValue] = useState('cal');
  const pick = (next: string) => {
    setValue(next);
    onChange(next);
  };
  return (
    <MoneyTileGroup legend="Who issues this card">
      <MoneyTile
        name="issuer"
        value="isracard"
        checked={value === 'isracard'}
        onChange={pick}
        moneyKey="issuer-isracard"
        label="Isracard"
        otherLabel="ישראכרט"
      />
      <MoneyTile
        name="issuer"
        value="cal"
        checked={value === 'cal'}
        onChange={pick}
        moneyKey="issuer-cal"
        label="Cal"
        otherLabel="כאל"
      />
      <MoneyTile
        name="issuer"
        value="other"
        checked={value === 'other'}
        onChange={pick}
        label="Not listed"
        notListed
      />
    </MoneyTileGroup>
  );
}

describe('MoneyTile (§7.3)', () => {
  it('is a radio in a named group, selected on activation', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Issuers onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Who issues this card' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('radio', { name: /^Isracard/ }));
    expect(onChange).toHaveBeenCalledWith('isracard');
    expect(screen.getByRole('radio', { name: /^Isracard/ })).toBeChecked();
  });

  it('says it is selected in words, in the box, not by colour alone', () => {
    renderWithProviders(<Issuers />);
    const tile = screen.getByRole('radio', { name: /^Cal/ }).closest('label');
    const mark = tile?.querySelector('[data-slot="mark"]');
    expect(mark).toHaveTextContent('Selected ✓');
    expect(mark).toHaveClass('hidden', 'group-has-checked:inline-block');
    expect(tile).toHaveClass('has-checked:shadow-[0_0_0_3px_var(--paper),0_0_0_6px_var(--ink)]');
  });

  it('is a money sheet in its colour, and "Not listed" is transparent with an ink edge', () => {
    renderWithProviders(<Issuers />);
    expect(screen.getByRole('radio', { name: /^Cal/ }).closest('label')).toHaveAttribute(
      'data-money',
      'issuer-cal',
    );
    const other = screen.getByRole('radio', { name: /^Not listed/ }).closest('label');
    expect(other).not.toHaveAttribute('data-sheet');
    expect(other).toHaveClass('inset-ring-2', 'inset-ring-ink');
  });

  it('is at least 70px tall on a phone and 96px from lg, presses only when motion is welcome, and focuses outside its rings', () => {
    renderWithProviders(<Issuers />);
    const tile = screen.getByRole('radio', { name: /^Cal/ }).closest('label');
    expect(tile).toHaveClass(
      'min-h-17.5',
      'lg:min-h-24',
      'motion-safe:active:scale-98',
      'has-focus-visible:outline-3',
      'has-focus-visible:outline-offset-9',
    );
  });
});
