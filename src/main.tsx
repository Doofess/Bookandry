import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Greenback</h1>
      <p className="mt-2 text-sm text-muted-foreground">scaffold</p>
      <p className="tabular mt-4 text-4xl font-bold tracking-tighter text-[var(--income)]">1,234.56</p>
    </div>
  </StrictMode>,
);
