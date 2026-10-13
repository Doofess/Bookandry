import type { TFunction } from 'i18next';

import type { PaymentMethod } from '@/types/domain';

/** A card's company as the concept writes it on a chip or a sheet; the card's own label when there is none. */
export function issuerLabel(card: PaymentMethod, t: TFunction<'cards'>): string {
  const issuer = card.card?.issuer;
  return issuer === undefined || issuer === 'other' ? card.label : t(`issuer.${issuer}`);
}
