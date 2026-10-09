import { CARD_COLOR_KEYS, type CardColor } from '@/domain/money-key';

/**
 * The colours a card can be given, in the order the picker shows them.
 *
 * Stored by key in `PaymentMethod.color`, never as a colour value. Each key
 * is a solid money sheet (`--money-card-<key>` in index.css) with text in a
 * tint of its own hue. The gradients these keys used to name retired with the
 * Colour of money redesign; the keys did not change, so no stored card changes.
 */
export const CARD_COLORS: readonly { readonly key: CardColor }[] = CARD_COLOR_KEYS.map((key) => ({ key }));

export type { CardColor };
