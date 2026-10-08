import type { ResolvedCard } from '@/data/card-catalog/resolve';
import type { CardDetails } from '@/types/domain';

/**
 * A card's type (tier) as the viewer reads it. While the card is linked and
 * its catalog entry has loaded, the catalog's name in the viewer's language:
 * the stored text is in the language of whoever linked it, which on a shared
 * card may not be this viewer's. Otherwise, the stored text.
 */
export function tierName(
  details: CardDetails | undefined,
  resolved: ResolvedCard | undefined,
  language: string,
): string | undefined {
  const lang = language.startsWith('he') ? 'he' : 'en';
  const id = details?.catalog?.tier;
  const named = id === undefined ? undefined : resolved?.issuer.tiers.find((x) => x.id === id)?.name[lang];
  return named ?? details?.tier;
}
