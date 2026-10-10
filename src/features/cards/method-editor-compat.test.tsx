import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { createPaymentMethod } from '@/db/repos/payment-methods';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { MethodForm } from './method-editor';

const NOW = '2026-10-10T10:00:00.000Z' as Parameters<typeof createPaymentMethod>[3];

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  await db.paymentMethods.clear();
});

describe('saving a card the editor does not fully understand', () => {
  it.each([
    ['debit', { funding: 'debit', accountId: 'acc-1', lastDigits: '1234', monthlyFeeMinor: 700 }],
    ['prepaid', { funding: 'prepaid', loadCardId: 'pm-c', loadFeeMinor: 350, lastDigits: '5678' }],
    ['gift', { funding: 'gift', issuer: 'other', issuerName: 'BuyMe', acceptedAt: 'Spa' }],
    ['future', { funding: 'crypto', someKeyFromLater: 'kept' }],
  ])('keeps every detail of a %s card when only its label changes', async (_, card) => {
    const method = await createPaymentMethod(
      db,
      'pm-d',
      { label: 'Old name', type: 'debit_card', profileId: '*', card: card as never },
      NOW,
    );
    const done = vi.fn();
    renderWithProviders(<MethodForm target={method} profiles={[]} onDone={done} />);
    const label = await screen.findByRole('textbox', { name: 'Label' });
    await userEvent.clear(label);
    await userEvent.type(label, 'New name');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalled();
    });
    const saved = await db.paymentMethods.get('pm-d');
    expect(saved?.label).toBe('New name');
    expect(saved?.card).toEqual(card);
  });
});
