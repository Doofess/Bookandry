import { createContext, use } from 'react';

import type { Settings } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * Contexts and their hooks, in a module with no components in it.
 *
 * Not a style preference: Vite's Fast Refresh can only hot-swap a module whose
 * every export is a component, so a provider file that also exports its hook
 * forces a full reload on every edit - and during Phase 3's virtualisation work
 * a full reload means losing the scroll position being debugged.
 */

export const TodayContext = createContext<LocalDate | undefined>(undefined);
export const SettingsContext = createContext<Settings | undefined>(undefined);

/**
 * Today, recomputed at local midnight and on `visibilitychange`.
 *
 * Read from context rather than computed per component so the feed, the summary
 * cards and the chart all flip on the SAME render - otherwise, for one frame,
 * the balance disagrees with the rows it is the sum of.
 */
export function useToday(): LocalDate {
  const today = use(TodayContext);
  if (today === undefined) throw new Error('useToday must be used inside <TodayProvider>');
  return today;
}

/**
 * Settings, guaranteed to exist.
 *
 * `useLiveQuery` returns `undefined` on its first render, so every consumer
 * would otherwise write `settings?.defaultCurrency ?? 'USD'` - and one frame of
 * money in the wrong currency is not a harmless flash: the summary card's
 * count-up ANIMATES from that number, making the wrong figure the thing the eye
 * follows. Resolving it once in the boot gate makes the field non-nullable
 * everywhere below, so that `??` never gets written.
 */
export function useSettings(): Settings {
  const settings = use(SettingsContext);
  if (settings === undefined) throw new Error('useSettings must be used inside <SettingsProvider>');
  return settings;
}

/** The currency every stored `baseAmountMinor` is denominated in. */
export function useBaseCurrency(): string {
  return useSettings().defaultCurrency;
}
