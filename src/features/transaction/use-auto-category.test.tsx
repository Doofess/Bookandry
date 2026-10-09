import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MccPick } from '@/domain/mcc-categories';
import type { Suggestion } from '@/services/supabase/categorize';
import type { Category } from '@/types/domain';
import type { IsoInstant, Kind } from '@/types/money';

const history = vi.hoisted(() => ({ answer: {} }));
const claude = vi.hoisted(() => ({
  suggestCategory:
    vi.fn<
      (name: string, kind: string, choices: readonly { id: string; name: string }[]) => Promise<Suggestion>
    >(),
}));

vi.mock('@/db/repos/transactions', () => ({
  merchantHistory: () => Promise.resolve(history.answer),
}));
vi.mock('@/app/account', () => ({ accountController: () => claude }));

const { useAutoCategory } = await import('./use-auto-category');
type FormMcc = { readonly code: string; readonly source: string };

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const category = (id: string, kind: 'income' | 'expense' = 'expense', sortOrder = 0): Category => ({
  id,
  kind,
  icon: 'Circle',
  sortOrder,
  isArchived: 0,
  source: 'builtin',
  nameKey: id,
  createdAt: NOW,
  updatedAt: NOW,
});
const CATEGORIES = [
  category('cat.subscriptions', 'expense', 1),
  category('cat.aiSoftware', 'expense', 2),
  category('cat.loans', 'expense', 3),
  category('cat.dining', 'expense', 4),
  category('cat.salary', 'income'),
];

function setup(
  options: {
    chosenByPerson?: boolean;
    categories?: readonly Category[];
    mcc?: FormMcc;
    opening?: { readonly name: string; readonly kind: Kind };
  } = {},
) {
  const choose = vi.fn<(id: string) => void>();
  let current: FormMcc = options.mcc ?? { code: '', source: '' };
  const chooseMcc = vi.fn((pick: MccPick | undefined) => {
    current = { code: pick?.mcc ?? '', source: pick?.source ?? '' };
  });
  const hook = renderHook(() =>
    useAutoCategory({
      categories: options.categories ?? CATEGORIES,
      translate: (c) => c.id,
      choose,
      chosenByPerson: options.chosenByPerson ?? false,
      currentMcc: () => current,
      chooseMcc,
      ...(options.opening === undefined ? {} : { opening: options.opening }),
    }),
  );
  return { choose, chooseMcc, hook, mcc: () => current };
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  history.answer = {};
  claude.suggestCategory.mockReset().mockResolvedValue({ categoryId: 'cat.aiSoftware', mcc: '7372' });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('choosing the category and the business type from the name', () => {
  it('asks once typing pauses, offering only that kind of category, and fills both in', async () => {
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude', 'expense');
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(claude.suggestCategory).toHaveBeenCalledWith('Claude Max Plan', 'expense', [
      { id: 'cat.subscriptions', name: 'cat.subscriptions' },
      { id: 'cat.aiSoftware', name: 'cat.aiSoftware' },
      { id: 'cat.loans', name: 'cat.loans' },
      { id: 'cat.dining', name: 'cat.dining' },
    ]);
    expect(choose).toHaveBeenCalledWith('cat.aiSoftware');
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
    expect(hook.result.current.status).toBe('chosen');
  });

  it('goes by history without asking, when it has both the category and the business type', async () => {
    history.answer = { categoryId: 'cat.subscriptions', mcc: '5968' };
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '5968', source: 'history' });
  });

  it('asks Claude for the business type alone when history has only the category, which still wins', async () => {
    history.answer = { categoryId: 'cat.subscriptions' };
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
  });

  it('files by the business type before Claude’s category', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.subscriptions', mcc: '5812' });
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Cafe Nero', 'expense');
    });
    await settle();
    expect(choose).toHaveBeenCalledWith('cat.dining');
  });

  it('lets a business type that only falls through to Other decide nothing, and asks Claude (final review C1)', async () => {
    const categories = [...CATEGORIES, category('cat.arnona'), category('cat.otherExpense')];
    // History knows the code, 9311 (tax payments), which no range names.
    history.answer = { mcc: '9311' };
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.arnona', mcc: '9311' });
    const arnona = setup({ categories });
    act(() => {
      arnona.hook.result.current.nameChanged('ארנונה עיריית תל אביב', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(arnona.choose).toHaveBeenCalledWith('cat.arnona');
    expect(arnona.chooseMcc).toHaveBeenCalledWith({ mcc: '9311', source: 'history' });

    // 6012 (financial institutions) does not beat the loan rule.
    history.answer = { mcc: '6012' };
    const loan = setup({ categories });
    act(() => {
      loan.hook.result.current.nameChanged('פירעון הלוואה', 'expense');
    });
    await settle();
    expect(loan.choose).toHaveBeenCalledWith('cat.loans');
  });

  it('drops a business type that a name rule says is wrong (Review Focus 2)', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.dining', mcc: '5411' });
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Netflix', 'expense');
    });
    await settle();
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
    expect(chooseMcc).not.toHaveBeenCalledWith(expect.objectContaining({ mcc: '5411' }));
  });

  it('never replaces the person’s own business type, and files by it', async () => {
    const { choose, chooseMcc, hook } = setup({ mcc: { code: '5812', source: 'user' } });
    act(() => {
      hook.result.current.nameChanged('Somewhere new', 'expense');
    });
    await settle();
    expect(chooseMcc).not.toHaveBeenCalled();
    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledWith('cat.dining');
  });

  it('never overrides a category the person chose, even with an answer on its way, but still fills the business type', async () => {
    let answer: (s: Suggestion) => void = () => undefined;
    claude.suggestCategory.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    act(() => {
      hook.result.current.choseManually();
    });
    expect(hook.result.current.categoryByPerson()).toBe(true);
    await act(async () => {
      answer({ categoryId: 'cat.aiSoftware', mcc: '7372' });
      await Promise.resolve();
    });
    expect(choose).not.toHaveBeenCalled();
    expect(chooseMcc).toHaveBeenCalledTimes(1);
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
    expect(hook.result.current.status).toBe('idle');
  });

  it('still looks the business type up when the category is picked within the typing pause', async () => {
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    act(() => {
      hook.result.current.choseManually();
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
    expect(hook.result.current.status).toBe('idle');
  });

  it('files a loan under Loans, and holds it there while it stays a loan', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.subscriptions' });
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.typeChosen('cat.loans', 'Car loan', 'expense');
    });
    expect(choose).toHaveBeenLastCalledWith('cat.loans');
    expect(hook.result.current.status).toBe('chosen');

    // "Car loan" is still a loan: the name does not get a say.
    act(() => {
      hook.result.current.nameChanged('Car loan from the bank', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).not.toHaveBeenCalled();

    // No longer a loan: the name is looked at again.
    act(() => {
      hook.result.current.typeChosen(undefined, 'Netflix', 'expense');
    });
    await settle();
    expect(choose).toHaveBeenLastCalledWith('cat.subscriptions');
  });

  it('never moves a category the person picked, for the type either', () => {
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.choseManually();
      hook.result.current.typeChosen('cat.loans', '', 'expense');
    });
    expect(choose).not.toHaveBeenCalled();

    // Nor to a category that is not there to choose.
    const fresh = setup();
    act(() => {
      fresh.hook.result.current.typeChosen('cat.gone', '', 'expense');
    });
    expect(fresh.choose).not.toHaveBeenCalled();
  });

  it('takes nothing it was not offered, and looks for no business type on income', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.salary', mcc: '9999' });
    const adding = setup();
    act(() => {
      adding.hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(adding.choose).not.toHaveBeenCalled();
    expect(adding.mcc()).toEqual({ code: '', source: '' });
    expect(adding.hook.result.current.status).toBe('idle');

    const income = setup();
    act(() => {
      income.hook.result.current.nameChanged('Refund from Amazon', 'income');
    });
    await settle();
    expect(income.chooseMcc).not.toHaveBeenCalled();
  });
});

describe('an edit', () => {
  it('opening one with no business type looks it up from history only, and leaves the category alone', async () => {
    history.answer = { categoryId: 'cat.subscriptions', mcc: '5812' };
    const { choose, chooseMcc } = setup({
      chosenByPerson: true,
      opening: { name: 'Cafe Nero', kind: 'expense' },
    });
    await settle();
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '5812', source: 'history' });
    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
  });

  it('opening one that has a business type, or is income, looks nothing up', async () => {
    history.answer = { mcc: '5812' };
    const kept = setup({
      chosenByPerson: true,
      mcc: { code: '5411', source: 'ai' },
      opening: { name: 'Cafe', kind: 'expense' },
    });
    const income = setup({ chosenByPerson: true, opening: { name: 'Cafe', kind: 'income' } });
    await settle();
    expect(kept.chooseMcc).not.toHaveBeenCalled();
    expect(income.chooseMcc).not.toHaveBeenCalled();
  });

  it('typing a new name asks Claude for the business type only', async () => {
    const { choose, chooseMcc, hook } = setup({ chosenByPerson: true });
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
    expect(hook.result.current.status).toBe('idle');
  });
});
