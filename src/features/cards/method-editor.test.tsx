import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';
import type { PaymentMethod } from '@/types/domain';

import { MethodEditor } from './method-editor';

const card = {
  id: 'card-1',
  type: 'credit_card',
  label: 'Max Gold',
  profileId: 'p1',
  card: { issuer: 'max', billingDay: 10 },
  isArchived: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as PaymentMethod;

const rates = () => document.querySelector<HTMLElement>('[data-section="rates"]');

beforeAll(async () => {
  await initTestI18n('en');
});

describe('MethodEditor', () => {
  it('opened on the rates, puts them in view and focus', async () => {
    const scrolled = vi.fn();
    const proto = HTMLElement.prototype as unknown as { scrollIntoView: () => void };
    const was = proto.scrollIntoView;
    proto.scrollIntoView = scrolled;
    try {
      renderWithProviders(
        <MethodEditor target={card} section="rates" profiles={[]} onOpenChange={vi.fn()} />,
      );
      await screen.findByRole('dialog');

      await expect.poll(() => document.activeElement).toBe(rates());
      expect(rates()).not.toBeNull();
      expect(scrolled).toHaveBeenCalled();
    } finally {
      proto.scrollIntoView = was;
    }
  });

  it('opened plainly, leaves focus where the sheet puts it', async () => {
    renderWithProviders(<MethodEditor target={card} profiles={[]} onOpenChange={vi.fn()} />);
    await screen.findByRole('dialog');

    await expect.poll(() => screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(rates()).not.toBeNull();
    expect(document.activeElement).not.toBe(rates());
  });
});
