import { renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CatalogModule from '@/data/card-catalog';
import { loadCatalog } from '@/data/card-catalog';
import { resolveCard } from '@/data/card-catalog/resolve';
import { db } from '@/db/db';
import { chargeDate } from '@/domain/cards';
import { nextReset } from '@/domain/long-credit';
import { expandOccurrences } from '@/domain/occurrences';
import { splitSchedule } from '@/domain/split-purchase';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { requestDatePrincipal } from '@/lib/money';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod, Transaction } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { SplitPurchaseSheet } from './split-purchase';
import { useSplitOffer, type SplitOffer } from './use-split-offer';

// The catalog as it is, unless a test makes it fail to load.
const catalog = vi.hoisted(() => ({ fail: false }));
vi.mock('@/data/card-catalog', async (importOriginal) => {
  const real = await importOriginal<typeof CatalogModule>();
  return {
    ...real,
    loadCatalog: () => (catalog.fail ? Promise.reject(new Error('offline')) : real.loadCatalog()),
  };
});

const LINK = { issuer: 'max', bank: '20', tier: 'international', version: 1 };
const max = {
  id: 'max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card: { billingDay: 10, catalog: LINK },
  isArchived: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as PaymentMethod;

const ils = (amountMinor: number) => ({
  ...MONEY,
  currency: 'ILS',
  baseCurrency: 'ILS',
  amountMinor,
  baseAmountMinor: amountMinor,
});
const purchase = (date: string, amountMinor = 120_000): Transaction =>
  makeTx({
    id: 'tv',
    date: d(date),
    recurrence: { type: 'one_time' },
    money: ils(amountMinor),
    paymentMethodId: 'max',
    note: 'Television',
  });
const occurrenceOf = (tx: Transaction): Occurrence => {
  const [found] = expandOccurrences(tx, [], tx.date, tx.date, { today: tx.date });
  if (found === undefined) throw new Error('no occurrence');
  return found;
};

async function offerFor(tx: Transaction): Promise<SplitOffer> {
  const resolved = resolveCard(await loadCatalog(), LINK);
  const rule = resolved?.deals.find((x) => x.kind === 'split_purchase');
  if (resolved === undefined || rule === undefined) throw new Error('Max splits purchases');
  return { occurrence: occurrenceOf(tx), method: max, resolved, rule, billingDay: 10 };
}

async function open(tx: Transaction, today: LocalDate) {
  await db.transactions.put(tx);
  const onDone = vi.fn<(date: LocalDate) => void>();
  renderWithProviders(
    <SplitPurchaseSheet offer={await offerFor(tx)} today={today} onOpenChange={vi.fn()} onDone={onDone} />,
  );
  return { onDone, user: userEvent.setup() };
}

const countField = () => screen.getByLabelText('Number of payments');
const rateField = () => screen.getByLabelText('Annual interest');
const splitIt = () => screen.getByRole('button', { name: 'Split it' });

async function plan() {
  const rows = await db.transactions.toArray();
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (row === undefined) throw new Error('no row');
  const overrides = await db.overrides.toArray();
  return {
    row,
    payments: expandOccurrences(row, overrides, d('2026-01-01'), d('2028-12-31'), { today: row.date }),
  };
}

beforeAll(async () => {
  await initTestI18n();
});
beforeEach(async () => {
  catalog.fail = false;
  await db.transactions.clear();
  await db.overrides.clear();
});
afterAll(async () => {
  await db.transactions.clear();
  await db.overrides.clear();
});

describe('splitting a purchase', () => {
  it('refuses a split whose first bill has been charged since the sheet opened', async () => {
    // Opened on the 8th; the device sleeps, and the save comes on the 11th, after the bill on the 10th.
    const { onDone, user } = await open(purchase('2026-09-20'), d('2026-10-08'));
    await user.type(rateField(), '12');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    try {
      await user.click(splitIt());
      await waitFor(() => {
        expect(splitIt()).toBeEnabled();
      });
    } finally {
      vi.useRealTimers();
    }
    expect(onDone).not.toHaveBeenCalled();
    expect((await db.transactions.get('tv'))?.recurrence).toEqual({ type: 'one_time' });
  });

  it('not yet billed: the same purchase becomes the plan, first paid on its own bill', async () => {
    const { onDone, user } = await open(purchase('2026-09-20'), d('2026-10-08'));
    expect(screen.getByRole('heading', { name: 'Split this purchase' })).toBeInTheDocument();
    // Max does not publish its split rate: nothing to split at until it is given.
    expect(rateField()).toHaveValue('');
    expect(screen.getByText("Enter this card's Split a purchase rate first.")).toBeInTheDocument();
    expect(splitIt()).toBeDisabled();

    await user.type(rateField(), '12');
    expect(screen.getByTestId('deal-schedule')).toHaveTextContent('3 payments of');
    expect(screen.getByText(/Oct 10, 2026/)).toBeInTheDocument();
    await user.click(splitIt());

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('2026-09-20');
    });
    const { row, payments } = await plan();
    expect(row).toMatchObject({
      id: 'tv',
      note: 'Television',
      recurrence: { type: 'monthly', installments: 3, plan: 'credit', creditAnnualRate: '12' },
    });
    expect(payments).toHaveLength(3);
    expect(chargeDate(payments[0]!.date, 10)).toBe('2026-10-10');
    // More than the purchase: the interest from today is in it.
    expect(payments.reduce((sum, o) => sum + o.money.amountMinor, 0)).toBeGreaterThan(120_000);
  });

  it('already billed: the first payment is the bill after next', async () => {
    const { onDone, user } = await open(purchase('2026-08-20'), d('2026-10-08'));
    await user.type(rateField(), '12');
    expect(screen.getByText(/Nov 10, 2026/)).toBeInTheDocument();
    await user.click(splitIt());

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('2026-10-20');
    });
    const { row, payments } = await plan();
    expect(row).toMatchObject({ id: 'tv', date: '2026-10-20' });
    expect(chargeDate(payments[0]!.date, 10)).toBe('2026-11-10');
  });

  it('shows the card’s rules it breaks, as warnings', async () => {
    const { user } = await open(purchase('2026-09-20', 5_000), d('2026-10-08'));
    expect(screen.getByText(/Split a purchase on this card needs at least/)).toBeInTheDocument();

    await user.clear(countField());
    await user.type(countField(), '40');
    expect(screen.getByText('Split a purchase on this card is 3 to 36 payments.')).toBeInTheDocument();
  });

  it('asks for ₪50 a payment from payment 19 on', async () => {
    const { user } = await open(purchase('2026-09-20', 90_000), d('2026-10-08'));
    expect(screen.queryByText(/Each payment must be at least/)).not.toBeInTheDocument();
    await user.clear(countField());
    await user.type(countField(), '20');
    expect(screen.getByText(/Each payment must be at least/)).toHaveTextContent('50');
  });

  it('records prime at the split where the plan reaches payment 19', async () => {
    const { onDone, user } = await open(purchase('2026-09-20'), d('2026-10-08'));
    await user.clear(countField());
    await user.type(countField(), '24');
    await user.type(rateField(), '12');
    expect(screen.getByTestId('deal-schedule')).toHaveTextContent('From payment 19');
    await user.click(splitIt());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    const { row } = await plan();
    // Priced on what the purchase owes a month before its first payment: two days of interest.
    const principalMinor = requestDatePrincipal(120_000, '12', 2, 360);
    expect(row.recurrence).toMatchObject({ reset: { atPayment: 19, principalMinor } });
    // Re-priced at the prime it was split at, payment 19 is the one the sheet showed.
    const reset = row.recurrence.type === 'monthly' ? row.recurrence.reset : undefined;
    const shown = splitSchedule({
      principalMinor: 120_000,
      rate: '12',
      count: 24,
      today: d('2026-10-08'),
      firstCharge: d('2026-10-10'),
      dayCount: '30/360',
      compounding: 12,
      resetAt: 19,
      primeRate: reset?.primeAtPurchase ?? '',
    });
    expect(nextReset(row, reset?.primeAtPurchase ?? '', d('2026-10-08'))?.paymentMinor).toBe(
      shown?.reset?.afterMinor,
    );
  });

  it('says it in Hebrew', async () => {
    await initTestI18n('he');
    try {
      await open(purchase('2026-09-20', 5_000), d('2026-10-08'));
      expect(screen.getByRole('heading', { name: 'פריסת העסקה' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'לפרוס' })).toBeInTheDocument();
      expect(screen.getByText(/חלוקת עסקה/, { selector: 'li span' })).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });
});

describe('useSplitOffer', () => {
  const methods = new Map([['max', max]]);

  it('offers a one-time purchase on a linked card once the catalog has loaded', async () => {
    const { result } = renderHook(() => useSplitOffer(occurrenceOf(purchase('2026-09-20')), methods));
    expect(result.current).toBeUndefined();
    await waitFor(() => {
      expect(result.current).toMatchObject({
        kind: 'offer',
        offer: { billingDay: 10, rule: { kind: 'split_purchase' } },
      });
    });
  });

  it('on a linked card without a billing day, says to set it rather than offering the split', async () => {
    const noDay = new Map([['max', { ...max, card: { catalog: LINK } }]]);
    const { result } = renderHook(() => useSplitOffer(occurrenceOf(purchase('2026-08-20')), noDay));
    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'needs_billing_day' });
    });
  });

  it('offers nothing when the catalog cannot be loaded', async () => {
    catalog.fail = true;
    const { result } = renderHook(() => useSplitOffer(occurrenceOf(purchase('2026-09-20')), methods));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeUndefined();
  });

  it('offers nothing for a plan, or a card not linked', async () => {
    const plain = new Map([['max', { ...max, card: { billingDay: 10 } }]]);
    const series = makeTx({
      id: 'rent',
      date: d('2026-09-20'),
      recurrence: { type: 'monthly', dayOfMonth: 20 },
      paymentMethodId: 'max',
    });
    const a = renderHook(() => useSplitOffer(occurrenceOf(purchase('2026-09-20')), plain));
    const b = renderHook(() => useSplitOffer(occurrenceOf(series), methods));
    const c = renderHook(() => useSplitOffer(undefined, methods));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect([a.result.current, b.result.current, c.result.current]).toEqual([undefined, undefined, undefined]);
  });
});
