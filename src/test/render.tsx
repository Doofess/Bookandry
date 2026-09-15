import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import i18n from 'i18next';
import { type ReactElement, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';

import { DirectionProvider } from '@/components/ui/direction';
import { resources } from '@/i18n';

let ready = false;

export async function initTestI18n(lng: 'en' | 'he' = 'en'): Promise<void> {
  if (!ready) {
    await i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    ready = true;
  } else {
    await i18n.changeLanguage(lng);
  }
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
): RenderResult {
  const dir = i18n.resolvedLanguage === 'he' ? 'rtl' : 'ltr';

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <DirectionProvider direction={dir}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </DirectionProvider>
      </I18nextProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
