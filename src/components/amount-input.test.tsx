import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n } from '@/test/render';
import type { Currency, Minor } from '@/types/money';

import { AmountInput } from './amount-input';

function Harness({
  currency = 'USD',
  allowNegative = false,
  onValue,
}: {
  currency?: Currency;
  allowNegative?: boolean;
  onValue?: (minor: Minor | undefined) => void;
}) {
  const [value, setValue] = useState<Minor | undefined>(undefined);
  return (
    <AmountInput
      value={value}
      currency={currency}
      allowNegative={allowNegative}
      onChange={(minor) => {
        setValue(minor);
        onValue?.(minor);
      }}
    />
  );
}

const field = () => screen.getByRole('textbox');

/** Paste is a clipboard event, which userEvent only fires with a real clipboard. */
async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(field());
  await user.paste(text);
}

beforeAll(async () => {
  await initTestI18n('en');
});

describe('AmountInput — typing', () => {
  it('emits integer minor units, never a float', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);

    await user.type(field(), '12.34');
    expect(onValue).toHaveBeenLastCalledWith(1234);
    expect(Number.isInteger(onValue.mock.lastCall?.[0])).toBe(true);
  });

  it('caps the fraction at the currency exponent while typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // You cannot type a digit that will not survive, so the field never
    // silently changes a number under the cursor.
    await user.type(field(), '1.2345');
    expect(field()).toHaveValue('1.23');
  });

  it('offers no decimals at all for an exponent-0 currency', async () => {
    const user = userEvent.setup();
    render(<Harness currency="JPY" />);

    expect(field()).toHaveAttribute('inputmode', 'numeric');
    await user.type(field(), '1234.56');
    expect(field()).toHaveValue('123456');
  });

  it('keeps three decimals for KWD', async () => {
    const user = userEvent.setup();
    render(<Harness currency="KWD" />);
    await user.type(field(), '1.2345');
    expect(field()).toHaveValue('1.234');
  });

  it('refuses a negative unless asked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '-50');
    expect(field()).toHaveValue('50');
  });

  it('allows a negative opening balance', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    // An Israeli current account in מינוס is an ordinary negative balance.
    render(<Harness allowNegative onValue={onValue} />);

    await user.type(field(), '-50');
    expect(onValue).toHaveBeenLastCalledWith(-5000);
  });

  it('reports undefined for an empty or half-typed field', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);

    await user.type(field(), '.');
    expect(onValue).toHaveBeenLastCalledWith(undefined);
  });

  it('normalises the display on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '7.5');
    await user.tab();
    expect(field()).toHaveValue('7.50');
  });

  it('is an LTR island, so the minus stays in front', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('dir', 'ltr');
  });

  it('is not a number input', () => {
    // type="number" rejects grouped paste and scrolls its value on a wheel.
    render(<Harness />);
    expect(field()).toHaveAttribute('type', 'text');
  });
});

describe('AmountInput — the paste contract', () => {
  it.each([
    ['$1,234.56', 'USD', 123_456, '1234.56'],
    // A European bank statement, where the separators swap roles.
    ['1.234,56', 'USD', 123_456, '1234.56'],
    ['1 234,56', 'USD', 123_456, '1234.56'],
    ['₪1,234.50', 'ILS', 123_450, '1234.50'],
    ['1234.50 ₪', 'ILS', 123_450, '1234.50'],
    ['12', 'USD', 1200, '12.00'],
  ])('accepts %s', async (pasted, currency, expected, display) => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness currency={currency} onValue={onValue} />);

    await paste(user, pasted);

    expect(onValue).toHaveBeenLastCalledWith(expected);
    expect(field()).toHaveValue(display);
  });

  it('accepts our own Hebrew output, bidi marks and all', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness currency="ILS" onValue={onValue} />);

    // Exactly what Intl emits for he-IL: RLM, NBSP, RLM, symbol.
    await paste(user, '‏1,234.50 ‏₪');

    expect(onValue).toHaveBeenLastCalledWith(123_450);
  });

  it('ROUNDS a longer fraction rather than truncating it', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);

    // The difference between a paste and a keystroke: the value already
    // exists, so the honest thing is to round it. Truncation would give 123.
    await paste(user, '1.235');

    expect(onValue).toHaveBeenLastCalledWith(124);
  });

  it('rounds half away from zero, matching the stored arithmetic', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    await paste(user, '0.005');
    expect(onValue).toHaveBeenLastCalledWith(1);
  });

  it('rounds a JPY paste to whole yen', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness currency="JPY" onValue={onValue} />);
    await paste(user, '1,234.6');
    expect(onValue).toHaveBeenLastCalledWith(1235);
  });

  it('leaves the field untouched when the paste is not an amount', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(field(), '42');
    await paste(user, 'lunch with Dana');

    // A bad paste is not a request to delete what was there.
    expect(field()).toHaveValue('42');
  });

  it('drops the sign on a pasted negative when negatives are not allowed', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    await paste(user, '-25.00');
    expect(onValue).toHaveBeenLastCalledWith(2500);
  });

  it('keeps a pasted negative for an opening balance', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness allowNegative onValue={onValue} />);
    await paste(user, '-1,250.00');
    expect(onValue).toHaveBeenLastCalledWith(-125_000);
  });
});
