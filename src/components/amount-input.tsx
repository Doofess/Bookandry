import { cn } from 'cn';
import { useId, useState, type ClipboardEvent } from 'react';

import { CurrencyBadge } from '@/components/currency-select';
import { Input } from '@/components/ui/input';
import { exponentOf } from '@/lib/currency-meta';
import { normalizeAmountInput, toDecimalString, toMinor } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

/**
 * An amount field, in minor units.
 *
 * The value that leaves here is ALWAYS an integer. No float ever exists: the
 * text goes to `toMinor`, which is BigInt rational arithmetic, and comes back
 * through `toDecimalString`. `gate:money` enforces that nothing else tries.
 *
 * The paste contract is the interesting half, and it is a specified contract
 * rather than a nicety - people paste amounts constantly, from bank SMS, from
 * statements, from a browser:
 *
 *   "$1,234.56"      grouping and a symbol
 *   "1.234,56"       a European statement, where the separators swap roles
 *   "‏1,234.50 ‏₪"   our own he-IL output, bidi marks and all
 *   "1.2345"         more decimals than USD has -> ROUNDS to 1.23, never truncates
 *
 * Typing is capped at the currency's exponent instead of rounded: you cannot
 * type a digit that will not survive, so the field never silently changes a
 * number under the cursor. A paste is different - the value already exists and
 * the honest thing is to round it.
 */
export type AmountInputProps = {
  /** Minor units, or undefined for an empty field. */
  readonly value: Minor | undefined;
  readonly onChange: (minor: Minor | undefined) => void;
  readonly currency: Currency;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Extra classes for the field itself (the wrapper takes `className`). */
  readonly inputClassName?: string;
  /**
   * Opening balances only. Transaction amounts are `> 0` by invariant - `kind`
   * carries the sign - but a Israeli current account in מינוס is an ordinary
   * negative balance and refusing it would make the wizard unusable.
   */
  readonly allowNegative?: boolean;
  readonly placeholder?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
};

/** Cap the fraction to what the currency can hold, without rounding. */
function capWhileTyping(text: string, exponent: number, allowNegative: boolean): string {
  const negative = allowNegative && text.trimStart().startsWith('-');
  const body = text.replace(/[+-]/g, '');
  const dot = body.indexOf('.');

  if (exponent === 0 || dot === -1) {
    const whole = dot === -1 ? body : body.slice(0, dot);
    return `${negative ? '-' : ''}${whole.replace(/\./g, '')}`;
  }

  const whole = body.slice(0, dot);
  const fraction = body
    .slice(dot + 1)
    .replace(/\./g, '')
    .slice(0, exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function parse(text: string, currency: Currency): Minor | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '.') return undefined;
  try {
    return toMinor(trimmed, currency);
  } catch {
    // Unparseable input leaves the previous value alone rather than clearing
    // it: a half-typed amount is not a request to delete what was there.
    return undefined;
  }
}

export function AmountInput({
  value,
  onChange,
  currency,
  id,
  disabled,
  className,
  inputClassName,
  allowNegative = false,
  placeholder,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: AmountInputProps) {
  const exponent = exponentOf(currency);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const [text, setText] = useState<string>(() =>
    value === undefined ? '' : toDecimalString(value, currency),
  );
  // Re-sync when the value changes from outside (a currency switch, a reset)
  // without fighting the user mid-keystroke.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const next = value === undefined ? '' : toDecimalString(value, currency);
    if (parse(text, currency) !== value) setText(next);
  }

  const commit = (next: string): void => {
    setText(next);
    const minor = parse(next, currency);
    setLastValue(minor);
    onChange(minor);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const pasted = event.clipboardData.getData('text');
    if (pasted.trim() === '') return;
    event.preventDefault();

    try {
      // toMinor ROUNDS a longer fraction rather than truncating it, which is
      // the whole difference between a paste and a keystroke.
      const minor = toMinor(pasted, currency);
      const signed = allowNegative ? minor : Math.abs(minor);
      setText(toDecimalString(signed, currency));
      setLastValue(signed);
      onChange(signed);
    } catch {
      /* Not an amount. Leave the field exactly as it was. */
    }
  };

  return (
    <div className={cn('relative', className)}>
      <CurrencyBadge
        code={currency}
        className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2"
      />
      <Input
        id={inputId}
        // An amount is a mathematical run and reads the same way in every
        // script; inherited RTL would move the minus to the far end.
        dir="ltr"
        // 'decimal' shows a keypad WITH a separator; 'numeric' does not, which
        // is exactly right for JPY and the other exponent-0 currencies.
        inputMode={exponent === 0 ? 'numeric' : 'decimal'}
        autoComplete="off"
        // `type="number"` is deliberately avoided: it rejects grouped paste,
        // scrolls the value on a wheel event, and its validity rules vary by
        // locale in ways nothing here can control.
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={text}
        onPaste={onPaste}
        onChange={(event) => {
          commit(capWhileTyping(normalizeAmountInput(event.target.value), exponent, allowNegative));
        }}
        onBlur={() => {
          const minor = parse(text, currency);
          setText(minor === undefined ? '' : toDecimalString(minor, currency));
        }}
        className={cn('tabular h-11 ps-15 text-end text-base', inputClassName)}
      />
    </div>
  );
}
