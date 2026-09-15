import type { Currency } from '@/types/money';

/**
 * Currency exponents, frozen, from ISO 4217 Table A.1.
 *
 * These are NOT read from `Intl` at runtime, deliberately.
 * `Intl.NumberFormat().resolvedOptions().maximumFractionDigits` returns CLDR
 * minor units, which vary with the browser's ICU build and diverge from ISO
 * (CLDR gives MGA and MRU 0 digits where ISO says 2).
 *
 * `amountMinor` is STORAGE. If two browsers disagree about the exponent, the
 * same stored integer denotes two different amounts - a silent data-corruption
 * vector with no error anywhere. Currency NAMES and SYMBOLS do come from `Intl`
 * at render time; only the exponent is pinned.
 */
export const DEFAULT_EXPONENT = 2;

const EXPONENTS: Readonly<Record<string, number>> = Object.freeze({
  // Zero-decimal
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // Three-decimal
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // Four-decimal
  CLF: 4,
  UYW: 4,
  // Everything else defaults to 2, including USD, EUR and ILS.
});

export function exponentOf(currency: Currency): number {
  return EXPONENTS[currency] ?? DEFAULT_EXPONENT;
}

/** Exposed so a test can assert the table is frozen and complete. */
export const CURRENCY_EXPONENTS = EXPONENTS;
