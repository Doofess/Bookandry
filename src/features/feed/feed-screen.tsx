import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Fab } from '@/components/fab';

export function FeedScreen() {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.feed')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('app.tagline')}</p>

      {/* Placeholder until Phase 3 brings the real feed. The FAB is wired to a
          counter purely so the button is demonstrably live. */}
      <p className="tabular mt-6 text-sm text-muted-foreground">
        FAB pressed: <span className="font-semibold text-foreground">{count}</span>
      </p>

      <Fab
        onClick={() => {
          setCount((c) => c + 1);
        }}
      />
    </section>
  );
}
