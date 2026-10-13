import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { MethodReviewItem } from '@/domain/import-cards';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { LocalDate } from '@/types/money';

vi.mock('@/app/account', () => ({
  useAccount: () => ({ status: 'signed_out' }),
  accountController: () => ({ extractTransactions: () => Promise.resolve({ ok: false, error: 'upstream' }) }),
}));

const { ImportPreview } = await import('./import-steps');
const { importStep } = await import('./import-stage');
const { ImportSheet } = await import('./import-sheet');

beforeAll(async () => {
  await initTestI18n('en');
});

describe('importStep', () => {
  it('maps the stages onto the three steps', () => {
    expect(importStep('picker')).toBe(0);
    expect(importStep('reading')).toBe(0);
    expect(importStep('review')).toBe(1);
    expect(importStep('methods')).toBe(2);
  });
});

describe('the import pop-out', () => {
  it('has three steps, the kind switch in the body and the preview pane', async () => {
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        onOpenCard={() => undefined}
        profiles={[]}
        categories={[]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={() => undefined}
      />,
    );
    const steps = await screen.findByRole('list', { name: 'Steps' });
    const items = steps.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]?.querySelector('[aria-current="step"]')).not.toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'What to import' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(document.querySelector('[data-slot="popout-preview"]')).not.toBeNull();
    expect(screen.getByText('A card found in the files shows here.')).toBeInTheDocument();
  });
});

describe('ImportPreview', () => {
  it('says what shows here when no card was found', () => {
    renderWithProviders(<ImportPreview found={undefined} language="en" />);
    expect(screen.getByText('A card found in the files shows here.')).toBeInTheDocument();
  });

  it('draws the found card as a card face with a sample row', () => {
    const found = {
      kind: 'card',
      id: 'f1',
      found: { id: 'f1', file: 0, label: 'Max', lastDigits: '5555', issuer: 'max', flags: [] },
    } as unknown as MethodReviewItem;
    renderWithProviders(<ImportPreview found={found} language="en" />);
    expect(screen.getByRole('img', { name: /Max/ })).toHaveAttribute('data-money', 'issuer-max');
    expect(document.querySelector('[data-slot="hue-pill"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="chip"]')).not.toBeNull();
  });
});
