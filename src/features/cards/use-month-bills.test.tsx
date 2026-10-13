import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx } from '@/domain/test-factories';
import type { PaymentMethod } from '@/types/domain';

import { useCardsData } from './use-cards-data';
import { useMonthBills } from './use-month-bills';

vi.mock('./use-cards-data', () => ({ useCardsData: vi.fn() }));

it('keeps an archived card’s final bill when it charged on the first day of the selected month', () => {
  const selected = d('2026-09-01');
  const today = d('2026-10-09');
  const archived = {
    id: 'archived',
    profileId: 'p',
    type: 'credit_card',
    label: 'Archived card',
    card: { issuer: 'max', billingDay: 1 },
    isArchived: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as PaymentMethod;
  const purchase = makeTx({
    date: d('2026-08-14'),
    recurrence: { type: 'one_time' },
    paymentMethodId: archived.id,
  });
  vi.mocked(useCardsData).mockReturnValue({
    cards: [],
    archived: [archived],
    owing: [],
    accounts: [],
    profiles: new Map(),
    occurrences: expandOccurrences(purchase, [], d('2026-08-01'), d('2026-09-30'), { today }),
  });
  const { result } = renderHook(() => useMonthBills(today, 'USD', 'p', selected));
  expect(result.current?.totalMinor).toBe(4500);
  expect(result.current?.days).toMatchObject([{ date: selected, charged: true }]);
  expect(useCardsData).toHaveBeenCalledWith(selected, 'USD');
});
