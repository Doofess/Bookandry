import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import i18n from 'i18next';
import { type ReactElement, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';

import { TodayProvider } from '@/app/today-provider';
import { DirectionProvider } from '@/components/ui/direction';
import { NAMESPACES, resources } from '@/i18n';
import { fixedClock } from '@/lib/clock';

let ready = false;

export async function initTestI18n(lng: 'en' | 'he' = 'en'): Promise<void> {
  if (!ready) {
    await i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: [...NAMESPACES],
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    ready = true;
  } else {
    await i18n.changeLanguage(lng);
  }
}

/**
 * The date every component test sees.
 *
 * Frozen, and injected rather than mocked: `today` is an argument everywhere in
 * the domain, and a suite that reads the ambient clock passes in September and
 * fails on the 1st of a month, on 29 February, and in March.
 */
export const TEST_NOW = new Date('2026-09-15T10:00:00.000Z');

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
): RenderResult {
  const dir = i18n.resolvedLanguage === 'he' ? 'rtl' : 'ltr';

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <DirectionProvider direction={dir}>
          <TodayProvider clock={fixedClock(TEST_NOW)}>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </TodayProvider>
        </DirectionProvider>
      </I18nextProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
