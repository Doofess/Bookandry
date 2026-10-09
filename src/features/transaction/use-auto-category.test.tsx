import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

const history = vi.hoisted(() => ({ answer: undefined as string | undefined }));
const claude = vi.hoisted(() => ({
  suggestCategory:
    vi.fn<
      (
        name: string,
        kind: string,
        choices: readonly { id: string; name: string }[],
      ) => Promise<string | undefined>
    >(),
}));

vi.mock('@/db/repos/transactions', () => ({
  merchantHistory: () => Promise.resolve({ categoryId: history.answer }),
}));
vi.mock('@/app/account', () => ({ accountController: () => claude }));

const { useAutoCategory } = await import('./use-auto-category');

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
  category('cat.salary', 'income'),
];

function setup(chosenByPerson = false) {
  const choose = vi.fn<(id: string) => void>();
  const hook = renderHook(() =>
    useAutoCategory({ categories: CATEGORIES, translate: (c) => c.id, choose, chosenByPerson }),
  );
  return { choose, hook };
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  history.answer = undefined;
  claude.suggestCategory.mockReset().mockResolvedValue('cat.aiSoftware');
});
afterEach(() => {
  vi.useRealTimers();
});

describe('choosing the category from the name', () => {
  it('asks once typing pauses, offering only that kind of category, and fills it in', async () => {
    const { choose, hook } = setup();
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
    ]);
    expect(choose).toHaveBeenCalledWith('cat.aiSoftware');
    expect(hook.result.current.status).toBe('chosen');
  });

  it('goes by where the name was filed before, without asking', async () => {
    history.answer = 'cat.subscriptions';
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
  });

  it('never overrides a category the person chose, even with an answer already on its way', async () => {
    let answer: (id: string) => void = () => undefined;
    claude.suggestCategory.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    act(() => {
      hook.result.current.choseManually();
    });
    await act(async () => {
      answer('cat.aiSoftware');
      await Promise.resolve();
    });

    expect(choose).not.toHaveBeenCalled();
    act(() => {
      hook.result.current.nameChanged('Something else', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
  });

  it('files a loan under Loans, and holds it there while it stays a loan', async () => {
    claude.suggestCategory.mockResolvedValue('cat.subscriptions');
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
      hook.result.current.typeChosen(undefined, 'Car loan from the bank', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
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

  it('leaves a saved row alone, and takes nothing it was not offered', async () => {
    const editing = setup(true);
    act(() => {
      editing.hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).not.toHaveBeenCalled();

    claude.suggestCategory.mockResolvedValue('cat.salary');
    const adding = setup();
    act(() => {
      adding.hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(adding.choose).not.toHaveBeenCalled();
    expect(adding.hook.result.current.status).toBe('idle');
  });
});
