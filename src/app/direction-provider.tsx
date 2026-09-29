import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { DirectionProvider } from '@/components/ui/direction';
import { applyLanguage, dirFor, type Language } from '@/i18n/boot';

/**
 * Base UI's DirectionProvider is NOT optional.
 *
 * Logical CSS alone does not fix direction: Select, DropdownMenu, Tabs,
 * ScrollArea and ToggleGroup read direction from this context for roving-focus
 * arrow-key order and for flipping `align="start"/"end"`. Without it those are
 * inverted in Hebrew on an otherwise perfectly logical page — and no amount of
 * ps-/pe- hygiene fixes it, because it is primitive logic, not CSS.
 *
 * Language only. The theme is the boot script's and the theme picker's: this
 * once re-applied a theme read at startup on every language change, turning a
 * person who had since picked Light back to dark.
 */
export function AppDirection({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'en') as Language;
  const dir = dirFor(lang);

  useEffect(() => {
    applyLanguage(lang);
  }, [lang]);

  return <DirectionProvider direction={dir}>{children}</DirectionProvider>;
}
