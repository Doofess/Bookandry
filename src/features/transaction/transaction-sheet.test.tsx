import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { materialize } from '@/db/materialize';
import { findCandidates } from '@/db/repos/transactions';
import { expandOccurrences } from '@/domain/occurrences';
import { makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import {
  CASH_METHOD_ID,
  SHARED_OWNER,
  type Category,
  type Occurrence,
  type PaymentMethod,
  type Profile,
} from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { TransactionSheet } from './transaction-sheet';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const TODAY = '2026-10-08' as LocalDate;

const groceries: Category = {
  id: 'cat.groceries',
  kind: 'expense',
  icon: 'Circle',
  sortOrder: 0,
  isArchived: 0,
  source: 'builtin',
  nameKey: 'categories:builtin.groceries',
  createdAt: NOW,
  updatedAt: NOW,
};
const profile = {
  id: 'p1',
  name: 'Dana',
  color: '#16794a',
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'ILS',
  openingBalanceDate: '2026-01-01',
  createdAt: NOW,
  updatedAt: NOW,
} as Profile;

/** A Max International card through Mizrahi-Tefahot: its קרדיט rate is published, its קרדיט פלוס rate is not. */
const maxCard: PaymentMethod = {
  id: 'pm.max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card: { billingDay: 10, catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 } },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
};
const plainCard: PaymentMethod = {
  ...maxCard,
  id: 'pm.plain',
  label: 'Plain',
  card: { billingDay: 10, creditPrimeMargin: '9' },
};

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  // The pickers' list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  await db.transactions.clear();
  await db.paymentMethods.clear();
  await db.overrides.clear();
});

function open(methods: readonly PaymentMethod[] = [maxCard, plainCard]) {
  const onSaved = vi.fn();
  renderWithProviders(
    <TransactionSheet
      target={{ mode: 'add', kind: 'expense' }}
      onOpenChange={() => undefined}
      profiles={[profile]}
      categories={[groceries]}
      paymentMethods={methods}
      activeProfileId="p1"
      baseCurrency="ILS"
      today={TODAY}
      onSaved={onSaved}
    />,
  );
  return { onSaved, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string, card: string) {
  await user.type(screen.getByLabelText('Amount'), amount);
  await user.click(screen.getByRole('combobox', { name: /Paid with/ }));
  await user.click(await screen.findByRole('option', { name: new RegExp(card) }));
}

const save = () => screen.getByRole('button', { name: 'Save' });

describe('a purchase on a card linked to the catalog', () => {
  it('offers the card’s own deals once the catalog has loaded, and today’s on a card not linked', async () => {
    const { user } = open();
    await fill(user, '3000', 'Max');
    expect(await screen.findByRole('radio', { name: 'Credit Plus' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /Paid with/ }));
    await user.click(await screen.findByRole('option', { name: /Plain/ }));
    expect(screen.queryByRole('radio', { name: 'Credit Plus' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Credit installment' })).toBeInTheDocument();
  });

  it('fills a קרדיט from the bank’s published rate', async () => {
    const { user } = open();
    await fill(user, '3000', 'Max');
    await user.click(await screen.findByRole('radio', { name: 'Credit' }));
    // Mizrahi: prime + 10.75 = 15.5.
    expect(screen.getByLabelText('Annual interest')).toHaveValue('15.5');
  });

  it('holds the save of a קרדיט פלוס until its rate is given, then saves the plan with prime at purchase', async () => {
    const { user, onSaved } = open();
    await fill(user, '3000', 'Max');
    await user.click(await screen.findByRole('radio', { name: 'Credit Plus' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Enter this card's Credit Plus rate first.");
    expect(screen.getByRole('button', { name: 'Open the card' })).toBeInTheDocument();
    expect(save()).toBeDisabled();

    const count = screen.getByLabelText('Number of payments');
    await user.clear(count);
    await user.type(count, '24');
    await user.type(screen.getByLabelText('Annual interest'), '15.5');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save()).toBeEnabled();
    await user.click(save());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.recurrence).toMatchObject({
      type: 'monthly',
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
      reset: { atPayment: 19, primeAtPurchase: '4.75' },
    });
  });

  it('opens the card to give the rate, and comes back with it filled in, the purchase unsaved', async () => {
    await db.paymentMethods.put(maxCard);
    const { user, onSaved } = open();
    await fill(user, '3000', 'Max');
    await user.click(await screen.findByRole('radio', { name: 'Credit Plus' }));
    await user.click(screen.getByRole('button', { name: 'Open the card' }));

    // The card's rate table, its קרדיט פלוס row asking for the rate.
    const row = within(await screen.findByTestId('rate-long_credit'));
    await user.type(row.getByRole('textbox'), '10.75');
    const cardSheet = screen.getByRole('dialog', { name: 'Edit payment method' });
    await user.click(within(cardSheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Annual interest')).toHaveValue('15.5');
    });
    expect((await db.paymentMethods.get('pm.max'))?.card?.overrides).toEqual({
      long_credit: { basis: 'prime', margin: '10.75' },
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(await db.transactions.count()).toBe(0);
  });

  it('saves a 30+ purchase a month later, with its month of interest and its rate', async () => {
    const { user, onSaved } = open();
    await fill(user, '1000', 'Max');
    await user.click(await screen.findByRole('radio', { name: '30 Plus' }));
    await user.type(screen.getByLabelText('Annual interest'), '15.5');
    await user.click(save());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.recurrence).toEqual({ type: 'one_time' });
    expect(saved?.money.amountMinor).toBe(101_292);
    expect(saved?.deferral).toEqual({ rate: '15.5' });
  });
});

describe('editing a 30+ purchase', () => {
  const ils = {
    ...MONEY,
    amountMinor: 101_292,
    baseAmountMinor: 101_292,
    currency: 'ILS',
    baseCurrency: 'ILS',
  };
  const tx = (deferral?: { rate: string }) =>
    makeTx({
      id: 'later',
      date: '2026-10-05' as LocalDate,
      recurrence: { type: 'one_time' },
      paymentMethodId: 'pm.max',
      categoryId: 'cat.groceries',
      money: ils,
      ...(deferral === undefined ? {} : { deferral }),
    });

  function edit() {
    renderWithProviders(
      <TransactionSheet
        target={{ mode: 'edit', transactionId: 'later', at: '2026-10-05' as LocalDate }}
        onOpenChange={() => undefined}
        profiles={[profile]}
        categories={[groceries]}
        paymentMethods={[maxCard]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={() => undefined}
      />,
    );
  }

  it('says it is charged on the bill after next, where an ordinary purchase is on the next', async () => {
    await db.transactions.put(tx({ rate: '15.5' }));
    edit();
    expect(await screen.findByTestId('card-charge-note')).toHaveTextContent('Dec 10, 2026');
  });

  it('says the next bill for a purchase that is not 30+', async () => {
    await db.transactions.put(tx());
    edit();
    expect(await screen.findByTestId('card-charge-note')).toHaveTextContent('Nov 10, 2026');
  });
});

describe('editing a payment of a plan', () => {
  function edit(id: string, at: string) {
    renderWithProviders(
      <TransactionSheet
        target={{ mode: 'edit', transactionId: id, at: at as LocalDate }}
        onOpenChange={() => undefined}
        profiles={[profile]}
        categories={[groceries]}
        paymentMethods={[maxCard]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={() => undefined}
      />,
    );
  }

  it('offers this one or the whole plan, never "this and future", which would restart its count', async () => {
    await db.transactions.put(
      makeTx({
        id: 'plus',
        date: '2026-06-08' as LocalDate,
        paymentMethodId: 'pm.max',
        recurrence: {
          type: 'monthly',
          dayOfMonth: 8,
          installments: 36,
          plan: 'credit',
          creditAnnualRate: '15.5',
          reset: { atPayment: 19, primeAtPurchase: '4.75', principalMinor: 300_000 },
        },
      }),
    );
    edit('plus', '2026-10-08');
    expect(await screen.findByRole('radio', { name: 'Only this one' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'The whole series' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'This and future' })).not.toBeInTheDocument();
  });

  it('moves one payment past the series’ end and still counts it, in its new month', async () => {
    await db.transactions.put(
      materialize(
        makeTx({
          id: 'rent',
          profileId: 'p1',
          date: '2026-06-08' as LocalDate,
          recurrence: { type: 'monthly', dayOfMonth: 8, endDate: '2026-10-08' as LocalDate },
          // In the base currency: no rate to look up, here or over the network.
          money: {
            ...MONEY,
            currency: 'ILS',
            baseCurrency: 'ILS',
            amountMinor: 4_500,
            baseAmountMinor: 4_500,
          },
        }),
      ),
    );
    const user = userEvent.setup();
    edit('rent', '2026-10-08');
    await user.click(await screen.findByRole('radio', { name: 'Only this one' }));
    const date = screen.getByPlaceholderText(/YYYY/);
    await user.clear(date);
    await user.type(date, date.getAttribute('placeholder') === 'MM/DD/YYYY' ? '11/05/2026' : '05/11/2026');
    await user.tab();
    await user.click(save());

    const november = { profileId: 'p1', from: '2026-11-01' as LocalDate, to: '2026-11-30' as LocalDate };
    await waitFor(async () => {
      expect(await db.overrides.count()).toBe(1);
    });
    expect((await findCandidates(db, november)).map((t) => t.id)).toEqual(['rent']);
  });

  it('still offers "this and future" on a series that is not a plan', async () => {
    await db.transactions.put(
      makeTx({
        id: 'rent',
        date: '2026-06-08' as LocalDate,
        recurrence: { type: 'monthly', dayOfMonth: 8 },
      }),
    );
    edit('rent', '2026-10-08');
    expect(await screen.findByRole('radio', { name: 'This and future' })).toBeInTheDocument();
  });
});

describe('adding', () => {
  const salary: Category = {
    ...groceries,
    id: 'cat.salary',
    kind: 'income',
    nameKey: 'categories:builtin.salary',
  };

  const yossi = { ...profile, id: 'p2', name: 'Yossi' } as Profile;
  /** Yossi's own card: not Dana's to pay with. */
  const yossiCard: PaymentMethod = { ...plainCard, id: 'pm.yossi', profileId: 'p2', label: 'Yossi Visa' };

  function add(
    target: Parameters<typeof TransactionSheet>[0]['target'],
    { profiles = [profile], methods = [maxCard] }: { profiles?: Profile[]; methods?: PaymentMethod[] } = {},
  ) {
    const onSaved = vi.fn();
    renderWithProviders(
      <TransactionSheet
        target={target}
        onOpenChange={() => undefined}
        profiles={profiles}
        categories={[groceries, salary]}
        paymentMethods={methods}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={onSaved}
      />,
    );
    return { onSaved, user: userEvent.setup() };
  }

  const yossisPurchase = () =>
    makeTx({
      id: 'bike',
      profileId: 'p2',
      date: '2026-09-10' as LocalDate,
      recurrence: { type: 'one_time' },
      paymentMethodId: 'pm.yossi',
      note: 'Bike',
      money: { ...MONEY, amountMinor: 90_000, baseAmountMinor: 90_000, currency: 'ILS', baseCurrency: 'ILS' },
    });
  const duplicateBike = {
    mode: 'add',
    kind: 'expense',
    from: { transactionId: 'bike', at: '2026-09-10' as LocalDate },
  } as const;

  it('starts on income, in an income category, when the Add menu chose income', () => {
    add({ mode: 'add', kind: 'income' });

    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: /Category/ })).toHaveAccessibleName(/Salary/);
  });

  it('duplicates a row: its amount, card and name, dated today and one-time', async () => {
    await db.transactions.put(
      makeTx({
        id: 'sofa',
        date: '2026-03-10' as LocalDate,
        recurrence: { type: 'monthly', dayOfMonth: 10, installments: 12 },
        paymentMethodId: 'pm.max',
        note: 'Sofa',
        money: {
          ...MONEY,
          amountMinor: 45_000,
          baseAmountMinor: 45_000,
          currency: 'ILS',
          baseCurrency: 'ILS',
        },
      }),
    );
    add({ mode: 'add', kind: 'expense', from: { transactionId: 'sofa', at: '2026-09-10' as LocalDate } });

    expect(await screen.findByDisplayValue('Sofa')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('450.00');
    expect(screen.getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Max/);
    // "Regular transaction", or "Regular" once the card's catalog deals have loaded.
    expect(screen.getByRole('radio', { name: /^Regular/ })).toBeChecked();
  });

  it('falls back to a plain add form when the row it names is gone', async () => {
    add({ mode: 'add', kind: 'expense', from: { transactionId: 'nowhere', at: '2026-09-10' as LocalDate } });

    expect(await screen.findByLabelText('Amount')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
  });

  it('duplicates a row for the person it was, on their own card, whoever is being looked at', async () => {
    await db.transactions.put(yossisPurchase());
    add(duplicateBike, { profiles: [profile, yossi], methods: [maxCard, yossiCard] });

    expect(await screen.findByDisplayValue('Bike')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yossi' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Yossi Visa/);
  });

  it('cannot save a card the person it starts on does not own, when the row’s person is gone', async () => {
    await db.transactions.put(yossisPurchase());
    // Yossi was removed from the household; his card is still in the list.
    const { onSaved, user } = add(duplicateBike, { methods: [maxCard, yossiCard] });

    expect(await screen.findByDisplayValue('Bike')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Paid with/ })).not.toHaveAccessibleName(/Yossi Visa/);
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const saved = (await db.transactions.toArray()).filter((tx) => tx.id !== 'bike');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ profileId: 'p1', note: 'Bike' });
    expect(saved[0]?.paymentMethodId).toBeUndefined();
  });

  it('lets go of a card when Whose? moves to someone who cannot pay with it', async () => {
    const { onSaved, user } = add(
      { mode: 'add', kind: 'expense' },
      { profiles: [profile, yossi], methods: [maxCard, yossiCard] },
    );
    await user.click(await screen.findByRole('radio', { name: 'Yossi' }));
    await fill(user, '120', 'Yossi Visa');
    expect(screen.getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Yossi Visa/);

    await user.click(screen.getByRole('radio', { name: 'Dana' }));
    expect(screen.getByRole('combobox', { name: /Paid with/ })).not.toHaveAccessibleName(/Yossi Visa/);
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ profileId: 'p1' });
    expect(saved?.paymentMethodId).toBeUndefined();
  });

  it('keeps a card both people can pay with when Whose? moves', async () => {
    const joint: PaymentMethod = {
      ...plainCard,
      id: 'pm.joint',
      profileId: SHARED_OWNER,
      label: 'Joint Visa',
    };
    const { onSaved, user } = add(
      { mode: 'add', kind: 'expense' },
      { profiles: [profile, yossi], methods: [maxCard, joint] },
    );
    await fill(user, '120', 'Joint Visa');
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ profileId: 'p2', paymentMethodId: 'pm.joint' });
  });
});

describe('what an edit hands back', () => {
  const lunch = () =>
    makeTx({
      id: 'lunch',
      date: '2026-10-20' as LocalDate,
      recurrence: { type: 'one_time' },
      categoryId: 'cat.groceries',
      money: MONEY,
      note: 'Lunch',
    });

  function edit() {
    const onSaved = vi.fn();
    renderWithProviders(
      <TransactionSheet
        target={{ mode: 'edit', transactionId: 'lunch', at: '2026-10-20' as LocalDate }}
        onOpenChange={() => undefined}
        profiles={[profile]}
        categories={[groceries]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="USD"
        today={TODAY}
        onSaved={onSaved}
      />,
    );
    return { onSaved, user: userEvent.setup() };
  }

  it('its undo, and that only the amount changed, when only the amount did', async () => {
    await db.transactions.put(lunch());
    const { onSaved, user } = edit();
    const amount = await screen.findByLabelText('Amount');

    await user.clear(amount);
    await user.type(amount, '60');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(
        '2026-10-20',
        expect.objectContaining({ undo: expect.any(Function) }),
        true,
      );
    });
  });

  it('that more than the amount changed, when the name did too', async () => {
    await db.transactions.put(lunch());
    const { onSaved, user } = edit();
    const amount = await screen.findByLabelText('Amount');

    await user.clear(amount);
    await user.type(amount, '60');
    const name = screen.getByLabelText('What was it?');
    await user.clear(name);
    await user.type(name, 'Dinner');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(
        '2026-10-20',
        expect.objectContaining({ undo: expect.any(Function) }),
        false,
      );
    });
  });
});

describe('where income goes', () => {
  const salary: Category = {
    ...groceries,
    id: 'cat.salary',
    kind: 'income',
    nameKey: 'categories:builtin.salary',
  };
  const yossi = { ...profile, id: 'p2', name: 'Yossi' } as Profile;
  const account = (id: string, label: string, over: Partial<PaymentMethod> = {}): PaymentMethod => ({
    id,
    profileId: 'p1',
    type: 'bank_account',
    label,
    account: { bank: '10', holding: 'personal' },
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });
  const cash: PaymentMethod = {
    id: CASH_METHOD_ID,
    profileId: SHARED_OWNER,
    type: 'cash',
    label: 'Cash',
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const leumi = account('pm.leumi', 'Leumi current');
  const discount = account('pm.discount', 'Discount savings');

  function add(
    target: Parameters<typeof TransactionSheet>[0]['target'],
    {
      profiles = [profile],
      methods = [maxCard, leumi, discount, cash],
      incomeHistory,
    }: { profiles?: Profile[]; methods?: PaymentMethod[]; incomeHistory?: readonly Occurrence[] } = {},
  ) {
    const onSaved = vi.fn();
    renderWithProviders(
      <TransactionSheet
        target={target}
        onOpenChange={() => undefined}
        profiles={profiles}
        categories={[groceries, salary]}
        paymentMethods={methods}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={onSaved}
        {...(incomeHistory === undefined ? {} : { incomeHistory })}
      />,
    );
    return { onSaved, user: userEvent.setup() };
  }
  const goesTo = () => screen.getByRole('combobox', { name: /Goes to/ });
  const historyTo = (destinationId: string, profileId = 'p1') =>
    expandOccurrences(
      makeTx({
        id: `pay-${profileId}`,
        kind: 'income',
        profileId,
        categoryId: 'cat.salary',
        date: '2026-07-01' as LocalDate,
        recurrence: { type: 'monthly', dayOfMonth: 1 },
        destinationId,
      }),
      [],
      '2026-04-08' as LocalDate,
      TODAY,
      { today: TODAY },
    );

  it('offers the person’s accounts, then cash, then not assigned, and never a card', async () => {
    const { user } = add({ mode: 'add', kind: 'income' });
    expect(screen.queryByRole('combobox', { name: /Paid with/ })).toBeNull();

    await user.click(goesTo());
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options[0]).toMatch(/^Discount savings/);
    expect(options[1]).toMatch(/^Leumi current/);
    expect(options[2]).toMatch(/^Cash/);
    expect(options[3]).toMatch(/^Not assigned/);
    expect(options.some((text) => text.includes('Max'))).toBe(false);
  });

  it('starts new income where this person’s income usually goes, or on not assigned', () => {
    const history = expandOccurrences(
      makeTx({
        id: 'pay',
        kind: 'income',
        categoryId: 'cat.salary',
        date: '2026-07-01' as LocalDate,
        recurrence: { type: 'monthly', dayOfMonth: 1 },
        destinationId: 'pm.leumi',
      }),
      [],
      '2026-04-08' as LocalDate,
      TODAY,
      { today: TODAY },
    );
    add({ mode: 'add', kind: 'income' }, { incomeHistory: history });
    expect(goesTo()).toHaveAccessibleName(/Leumi current/);
  });

  it('starts on not assigned with nothing to go by', () => {
    add({ mode: 'add', kind: 'income' });
    expect(goesTo()).toHaveAccessibleName(/Not assigned/);
  });

  it('saves where it went', async () => {
    const { onSaved, user } = add({ mode: 'add', kind: 'income' });
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Cash/ }));
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ kind: 'income', destinationId: CASH_METHOD_ID });
    expect(saved?.paymentMethodId).toBeUndefined();
  });

  it('lets go of an account the new person cannot use when Whose? moves, and keeps cash', async () => {
    const { user } = add({ mode: 'add', kind: 'income' }, { profiles: [profile, yossi] });
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Leumi current/ }));
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    expect(goesTo()).toHaveAccessibleName(/Not assigned/);

    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Cash/ }));
    await user.click(screen.getByRole('radio', { name: 'Dana' }));
    expect(goesTo()).toHaveAccessibleName(/Cash/);
  });

  it('opens a cash expense paid in cash, and cash income going to cash', () => {
    add({ mode: 'add', kind: 'expense', cash: true });
    expect(screen.getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Cash/);
  });

  it('opens cash income going to cash', () => {
    add({ mode: 'add', kind: 'income', cash: true });
    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked();
    expect(goesTo()).toHaveAccessibleName(/Cash/);
  });

  it('saves neither a destination nor a method when cash income is switched to an expense', async () => {
    const { onSaved, user } = add({ mode: 'add', kind: 'income', cash: true });
    await user.click(screen.getByRole('radio', { name: 'Expense' }));
    await user.type(screen.getByLabelText('Amount'), '80');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ kind: 'expense' });
    expect(saved).not.toHaveProperty('destinationId');
    expect(saved?.paymentMethodId).toBeUndefined();
  });

  it('does not save an account the new person cannot use', async () => {
    const { onSaved, user } = add({ mode: 'add', kind: 'income' }, { profiles: [profile, yossi] });
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Leumi current/ }));
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.profileId).toBe('p2');
    expect(saved?.destinationId ?? '').toBe('');
  });

  it('keeps cash through a change of person, saved', async () => {
    const { onSaved, user } = add({ mode: 'add', kind: 'income' }, { profiles: [profile, yossi] });
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Cash/ }));
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.destinationId).toBe(CASH_METHOD_ID);
  });

  it('applies the usual destination when a new row is switched to income', async () => {
    const { user } = add({ mode: 'add', kind: 'expense' }, { incomeHistory: historyTo('pm.leumi') });
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(goesTo()).toHaveAccessibleName(/Leumi current/);
  });

  it('keeps a destination picked by hand when switched to income and back', async () => {
    const { user } = add({ mode: 'add', kind: 'income' }, { incomeHistory: historyTo('pm.leumi') });
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Cash/ }));
    await user.click(screen.getByRole('radio', { name: 'Expense' }));
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(goesTo()).toHaveAccessibleName(/Cash/);
  });

  it('never applies the usual destination to a row being edited', async () => {
    await db.transactions.put(
      makeTx({
        id: 'old',
        kind: 'income',
        categoryId: 'cat.salary',
        date: '2026-10-01' as LocalDate,
        recurrence: { type: 'one_time' },
      }),
    );
    add(
      { mode: 'edit', transactionId: 'old', at: '2026-10-01' as LocalDate },
      { incomeHistory: historyTo('pm.leumi') },
    );
    expect(await screen.findByRole('combobox', { name: /Goes to/ })).toHaveAccessibleName(/Not assigned/);
  });

  it('still shows the name of an archived account an income went to', async () => {
    await db.transactions.put(
      makeTx({
        id: 'old',
        kind: 'income',
        categoryId: 'cat.salary',
        date: '2026-10-01' as LocalDate,
        recurrence: { type: 'one_time' },
        destinationId: 'pm.old',
      }),
    );
    add(
      { mode: 'edit', transactionId: 'old', at: '2026-10-01' as LocalDate },
      { methods: [maxCard, account('pm.old', 'Old savings', { isArchived: 1 }), cash] },
    );
    expect(await screen.findByRole('combobox', { name: /Goes to/ })).toHaveAccessibleName(/Old savings/);
  });

  it('starts the new person on their own usual destination when Whose? changes', async () => {
    const { user } = add(
      { mode: 'add', kind: 'income' },
      {
        profiles: [profile, yossi],
        methods: [maxCard, leumi, discount, cash, account('pm.yossi', 'Yossi current', { profileId: 'p2' })],
        incomeHistory: [...historyTo('pm.leumi'), ...historyTo('pm.yossi', 'p2')],
      },
    );
    expect(goesTo()).toHaveAccessibleName(/Leumi current/);
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    expect(goesTo()).toHaveAccessibleName(/Yossi current/);
  });
});
