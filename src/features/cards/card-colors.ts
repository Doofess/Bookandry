import type { CardIssuer, PaymentMethod } from '@/types/domain';

/**
 * The colours a card can be given, as gradients for its face. Every one dark
 * enough at its light end to keep white type readable on it.
 *
 * Stored by key in `PaymentMethod.color`, never as a colour value, so a
 * shade can be adjusted later without touching anybody's data.
 */
export const CARD_COLORS = [
  { key: 'black', gradient: 'from-[#141414] to-[#3d3d3d]' },
  { key: 'silver', gradient: 'from-[#454c56] to-[#737d8a]' },
  { key: 'blue', gradient: 'from-[#1f3a68] to-[#3b6bb0]' },
  { key: 'teal', gradient: 'from-[#0f5c56] to-[#2a8a7e]' },
  { key: 'green', gradient: 'from-[#173f26] to-[#2f7d4b]' },
  { key: 'gold', gradient: 'from-[#5c4310] to-[#94742a]' },
  { key: 'orange', gradient: 'from-[#6e2e0e] to-[#b8602c]' },
  { key: 'red', gradient: 'from-[#5e1520] to-[#b8323f]' },
  { key: 'rose', gradient: 'from-[#7a2a4a] to-[#c4577c]' },
  { key: 'purple', gradient: 'from-[#5b1f63] to-[#b03a7a]' },
] as const;

export type CardColor = (typeof CARD_COLORS)[number]['key'];

/** Issuer tints: a hint of whose card it is, never their artwork - for a card not given a colour. */
const ISSUER_TINTS: Record<CardIssuer, string> = {
  isracard: 'from-[#1f3a68] to-[#3b6bb0]',
  cal: 'from-[#0f5c56] to-[#2a9083]',
  max: 'from-[#5b1f63] to-[#b03a7a]',
  amex: 'from-[#1d4f7a] to-[#4a8cc4]',
  diners: 'from-[#2b2b2b] to-[#5a5a5a]',
  other: 'from-[#2f3b35] to-[#5b6d63]',
};

/** A card company's tint, for a card left to its company's colour. */
export function issuerTint(issuer: CardIssuer | undefined): string {
  return ISSUER_TINTS[issuer ?? 'other'];
}

/** The face of a card: the colour it was given, else its company's tint. */
export function cardGradient(method: Pick<PaymentMethod, 'color' | 'card'>): string {
  return CARD_COLORS.find((c) => c.key === method.color)?.gradient ?? issuerTint(method.card?.issuer);
}
