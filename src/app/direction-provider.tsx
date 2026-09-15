import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { DirectionProvider } from '@/components/ui/direction';
import { applyDocumentChrome, dirFor, type Language, type Theme } from '@/i18n/boot';

/**
 * Base UI's DirectionProvider is NOT optional.
 *
 * Logical CSS alone does not fix direction: Select, DropdownMenu, Tabs,
 * ScrollArea and ToggleGroup read direction from this context for roving-focus
 * arrow-key order and for flipping `align="start"/"end"`. Without it those are
 * inverted in Hebrew on an otherwise perfectly logical page — and no amount of
 * ps-/pe- hygiene fixes it, because it is primitive logic, not CSS.
 */
export function AppDirection({ theme, children }: { theme: Theme; children: ReactNode }) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'en') as Language;
  const dir = dirFor(lang);

  useEffect(() => {
    applyDocumentChrome({ lang, theme });
  }, [lang, theme]);

  return <DirectionProvider direction={dir}>{children}</DirectionProvider>;
}
