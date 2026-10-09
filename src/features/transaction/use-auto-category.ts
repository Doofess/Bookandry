import { useCallback, useEffect, useRef, useState } from 'react';

import { accountController } from '@/app/account';
import { db } from '@/db/db';
import { merchantHistory } from '@/db/repos/transactions';
import { categoriesFor } from '@/domain/tx-options';
import type { Category } from '@/types/domain';
import type { Kind } from '@/types/money';

/** How long typing has to pause before the name is looked at. */
const SETTLE_MS = 600;

export type AutoCategoryStatus = 'idle' | 'thinking' | 'chosen';

/**
 * The category, chosen from what the person typed ("Claude Max Plan").
 *
 * First where they filed that name before - their own correction is the best
 * answer there is, and costs nothing - then by asking Claude through the
 * account (account.ts `suggestCategory`). Only ever among their categories of
 * that kind, and only until they choose one themselves: from then on the
 * field is theirs, and a guess arriving late never overrides it. An edit
 * starts out theirs, so opening a saved row never moves it.
 *
 * Driven from the change handlers, not an effect on the name: the guess is an
 * answer to typing, and an effect would also put a setState in its body.
 */
export function useAutoCategory({
  categories,
  translate,
  choose,
  chosenByPerson,
}: {
  readonly categories: readonly Category[];
  readonly translate: (category: Category) => string;
  readonly choose: (categoryId: string) => void;
  readonly chosenByPerson: boolean;
}) {
  const [status, setStatus] = useState<AutoCategoryStatus>('idle');
  const manual = useRef(chosenByPerson);
  /** Held by the transaction's type (`typeChosen`) rather than guessed from the name. */
  const byType = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Each look-up's number: only the latest one may set the field. */
  const latest = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(
    async (name: string, kind: Kind): Promise<void> => {
      const ask = ++latest.current;
      setStatus('thinking');
      const choices = categoriesFor(categories, kind);
      const fits = (id: string | undefined): id is string =>
        id !== undefined && choices.some((category) => category.id === id);

      let id = await merchantHistory(db, kind, name)
        .then((history) => history.categoryId)
        .catch(() => undefined);
      if (!fits(id)) {
        id = await suggest(
          name,
          kind,
          choices.map((category) => ({ id: category.id, name: translate(category) })),
        );
      }
      if (ask !== latest.current || manual.current) return;
      if (fits(id)) {
        choose(id);
        setStatus('chosen');
      } else {
        setStatus('idle');
      }
    },
    [categories, translate, choose],
  );

  /** The name changed: look at it once typing pauses. */
  const nameChanged = useCallback(
    (name: string, kind: Kind): void => {
      clearTimeout(timer.current);
      if (manual.current || byType.current) return;
      latest.current++;
      if (name.trim().length < 2) {
        setStatus('idle');
        return;
      }
      timer.current = setTimeout(() => {
        void run(name.trim(), kind);
      }, SETTLE_MS);
    },
    [run],
  );

  /** The person picked a category themselves: it is theirs from here on. */
  const choseManually = useCallback((): void => {
    manual.current = true;
    clearTimeout(timer.current);
    latest.current++;
    setStatus('idle');
  }, []);

  /**
   * The type says what it is (a loan is Loans): taken over any guess from the
   * name, and held while that type stays chosen - "Car loan" is still a loan -
   * but never over the person's own pick, and only if they still have it.
   * Undefined lets go, and the name is looked at again.
   */
  const typeChosen = useCallback(
    (categoryId: string | undefined, name: string, kind: Kind): void => {
      if (manual.current) return;
      if (categoryId === undefined) {
        if (!byType.current) return;
        byType.current = false;
        nameChanged(name, kind);
        return;
      }
      if (!categories.some((category) => category.id === categoryId && category.isArchived === 0)) return;
      byType.current = true;
      clearTimeout(timer.current);
      latest.current++;
      choose(categoryId);
      setStatus('chosen');
    },
    [categories, choose, nameChanged],
  );

  return { status, nameChanged, choseManually, typeChosen };
}

/** Claude's answer through the account, or none: offline, signed out, a build without accounts. */
async function suggest(
  name: string,
  kind: Kind,
  choices: readonly { id: string; name: string }[],
): Promise<string | undefined> {
  try {
    return await accountController().suggestCategory(name, kind, choices);
  } catch {
    return undefined;
  }
}
