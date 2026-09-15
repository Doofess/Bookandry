import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { Segmented } from './segmented';

beforeAll(async () => {
  await initTestI18n();
});

type Fruit = 'apple' | 'pear' | 'plum';

const OPTIONS = [
  { value: 'apple' as const, label: 'Apple' },
  { value: 'pear' as const, label: 'Pear' },
  { value: 'plum' as const, label: 'Plum' },
];

function render(value: Fruit, onChange = vi.fn(), dir: 'ltr' | 'rtl' = 'ltr') {
  const result = renderWithProviders(
    <div dir={dir}>
      <span id="fruit">Fruit</span>
      <Segmented<Fruit> value={value} onChange={onChange} options={OPTIONS} labelledBy="fruit" />
    </div>,
  );
  return { ...result, onChange };
}

describe('the group', () => {
  it('is a named radiogroup, not a pile of buttons', () => {
    // A radiogroup with no accessible name announces as "group", and its
    // options lose their "1 of 3".
    render('apple');

    expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks exactly one option checked', () => {
    render('pear');

    expect(screen.getByRole('radio', { name: 'Pear' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Apple' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('roving tabindex', () => {
  it('makes the whole group ONE tab stop', () => {
    /*
     * The ARIA radio pattern. Leaving every option tabbable turns a four-option
     * repeat control into four tab stops on the way to the Save button, which
     * is how a form becomes unusable by keyboard without anything looking wrong.
     */
    render('pear');

    expect(screen.getByRole('radio', { name: 'Apple' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'Pear' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Plum' })).toHaveAttribute('tabindex', '-1');
  });

  it('puts the tab stop on the selected option, wherever it is', () => {
    render('plum');

    expect(screen.getByRole('radio', { name: 'Plum' })).toHaveAttribute('tabindex', '0');
  });
});

describe('keyboard', () => {
  it('selects as it moves, which is what makes it a radio group', async () => {
    // In a radio group, moving focus IS choosing. A toolbar moves focus without
    // selecting; keyboard users rely on the difference.
    const user = userEvent.setup();
    const { onChange } = render('apple');

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('pear');
  });

  it('wraps at both ends', async () => {
    const user = userEvent.setup();
    const { onChange } = render('apple');

    await user.tab();
    await user.keyboard('{ArrowLeft}');

    expect(onChange).toHaveBeenCalledWith('plum');
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    const { onChange } = render('pear');

    await user.tab();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('plum');

    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('treats ArrowDown as forward, for a wrapped group', async () => {
    const user = userEvent.setup();
    const { onChange } = render('apple');

    await user.tab();
    await user.keyboard('{ArrowDown}');

    expect(onChange).toHaveBeenCalledWith('pear');
  });
});

describe('reading direction', () => {
  it('makes ArrowRight go BACKWARD in an RTL group', async () => {
    /*
     * ArrowRight means "next in reading order", which in Hebrew is to the left.
     * Hard-coding right = forward inverts the control for the second locale,
     * and the direction is read off the ELEMENT rather than off the language -
     * `dir` can be set per subtree, as the chart's LTR plot island is.
     */
    const user = userEvent.setup();
    const { onChange } = render('pear', vi.fn(), 'rtl');

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('makes ArrowLeft go forward in an RTL group', async () => {
    const user = userEvent.setup();
    const { onChange } = render('pear', vi.fn(), 'rtl');

    await user.tab();
    await user.keyboard('{ArrowLeft}');

    expect(onChange).toHaveBeenCalledWith('plum');
  });
});

describe('pointer', () => {
  it('selects on click', async () => {
    const user = userEvent.setup();
    const { onChange } = render('apple');

    await user.click(screen.getByRole('radio', { name: 'Plum' }));

    expect(onChange).toHaveBeenCalledWith('plum');
  });
});
