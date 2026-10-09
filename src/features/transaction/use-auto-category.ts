import { useCallback, useEffect, useRef, useState } from 'react';

import { accountController } from '@/app/account';
import { db } from '@/db/db';
import { merchantHistory, type MerchantHistory } from '@/db/repos/transactions';
import { replaceableMcc } from '@/domain/mcc';
import { chooseExpenseCategory, pickMcc, type MccPick } from '@/domain/mcc-categories';
import { categoriesFor } from '@/domain/tx-options';
import type { Suggestion } from '@/services/supabase/categorize';
import type { Category } from '@/types/domain';
import type { Kind } from '@/types/money';

/** How long typing has to pause before the name is looked at. */
const SETTLE_MS = 600;

export type AutoCategoryStatus = 'idle' | 'thinking' | 'chosen';

/** The form's business type as it stands: its code ('' for none) and where it came from ('' for none). */
export type FormMcc = { readonly code: string; readonly source: string };

/** Whether the auto step may fill the business type: there is none, or the step put it there itself. */
const fillable = (current: FormMcc): boolean => current.code === '' || replaceableMcc(current.source);

/**
 * The category and the business type, chosen from what the person typed
 * ("Claude Max Plan").
 *
 * First what history says about that name - where they filed it, and its
 * business type - which costs nothing; then, for what history leaves open,
 * Claude, through the account (account.ts `suggestCategory`): one call
 * answers both. The category follows spec §3 (`chooseExpenseCategory`), only
 * among their categories of that kind, and only until they choose one
 * themselves: from then on the field is theirs, and a guess arriving late
 * never overrides it. An edit starts out theirs, so opening a saved row never
 * moves it.
 *
 * The business type is filled while it is empty or was put there by this
 * step, an import or history - never over the person's own. Opening an edit
 * that has none looks it up from history only: Claude is asked when the name
 * is typed, never just because a row was opened.
 *
 * Driven from the change handlers, not an effect on the name: the guess is an
 * answer to typing, and an effect would also put a setState in its body.
 */
export function useAutoCategory({
  categories,
  translate,
  choose,
  chosenByPerson,
  currentMcc,
  chooseMcc,
  opening,
}: {
  readonly categories: readonly Category[];
  readonly translate: (category: Category) => string;
  readonly choose: (categoryId: string) => void;
  readonly chosenByPerson: boolean;
  /** The form's business type, read when an answer arrives: the person may have picked one meanwhile. */
  readonly currentMcc: () => FormMcc;
  /** Sets the business type found, or clears one this step put there that the new name no longer has. */
  readonly chooseMcc: (pick: MccPick | undefined) => void;
  /** An edit being opened: its name and kind, to look its business type up from history once. */
  readonly opening?: { readonly name: string; readonly kind: Kind };
}) {
  const [status, setStatus] = useState<AutoCategoryStatus>('idle');
  const manual = useRef(chosenByPerson);
  /** Held by the transaction's type (`typeChosen`) rather than guessed from the name. */
  const byType = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Each look-up's number: only the latest one may set the fields. */
  const latest = useRef(0);
  const opened = useRef(false);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  // An edit with no business type: history may know it. Free and local; Claude is not asked.
  useEffect(() => {
    if (opening === undefined || opened.current) return;
    opened.current = true;
    if (opening.kind !== 'expense' || currentMcc().code !== '') return;
    const ask = ++latest.current;
    void merchantHistory(db, opening.kind, opening.name).then(
      (history) => {
        if (ask !== latest.current || currentMcc().code !== '') return;
        const pick = pickMcc(
          { kind: opening.kind, description: opening.name },
          { history: history.mcc },
          categories,
        );
        if (pick !== undefined) chooseMcc(pick);
      },
      () => undefined,
    );
  }, [opening, currentMcc, chooseMcc, categories]);

  const run = useCallback(
    async (name: string, kind: Kind): Promise<void> => {
      const ask = ++latest.current;
      const wantsCategory = !manual.current;
      const wantsMcc = kind === 'expense' && fillable(currentMcc());
      if (!wantsCategory && !wantsMcc) return;
      if (wantsCategory) setStatus('thinking');
      const choices = categoriesFor(categories, kind);
      const fits = (id: string | undefined): id is string =>
        id !== undefined && choices.some((category) => category.id === id);
      const row = { kind, description: name };

      const history = await merchantHistory(db, kind, name).catch((): MerchantHistory => ({}));
      let pick = wantsMcc ? pickMcc(row, { history: history.mcc }, categories) : undefined;
      // The business type the category goes by: the one found, or the person's own.
      const typeOf = (): string | undefined => (wantsMcc ? pick?.mcc : currentMcc().code || undefined);
      let id = chooseExpenseCategory(row, { history: history.categoryId, mcc: typeOf() }, categories);
      if ((wantsCategory && !fits(id)) || (wantsMcc && pick === undefined)) {
        const answer = await suggest(
          name,
          kind,
          choices.map((category) => ({ id: category.id, name: translate(category) })),
        );
        if (wantsMcc && pick === undefined) pick = pickMcc(row, { ai: answer.mcc }, categories);
        id = chooseExpenseCategory(
          row,
          { history: history.categoryId, mcc: typeOf(), claude: answer.categoryId },
          categories,
        );
      }
      if (ask !== latest.current) return;
      // Never over a business type the person picked while this was on its way.
      if (wantsMcc && fillable(currentMcc())) chooseMcc(pick);
      if (!wantsCategory || manual.current) return;
      if (fits(id)) {
        choose(id);
        setStatus('chosen');
      } else {
        setStatus('idle');
      }
    },
    [categories, translate, choose, chooseMcc, currentMcc],
  );

  /** The name changed: look at it once typing pauses. */
  const nameChanged = useCallback(
    (name: string, kind: Kind): void => {
      clearTimeout(timer.current);
      // A type that says what it is (a loan) holds the category, and the name is not looked at.
      if (byType.current) return;
      if (manual.current && !(kind === 'expense' && fillable(currentMcc()))) return;
      latest.current++;
      if (name.trim().length < 2) {
        if (!manual.current) setStatus('idle');
        return;
      }
      timer.current = setTimeout(() => {
        void run(name.trim(), kind);
      }, SETTLE_MS);
    },
    [run, currentMcc],
  );

  /**
   * The person picked a category themselves: it is theirs from here on. A look-up
   * already waiting or on its way is left alone: `run` reads `manual` before it
   * sets the category, so it only goes on to fill the business type.
   */
  const choseManually = useCallback((): void => {
    manual.current = true;
    setStatus('idle');
  }, []);

  /** Whether the category is the person's own: picked by hand, or an edit's. Read in event handlers. */
  const categoryByPerson = useCallback((): boolean => manual.current, []);

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

  return { status, nameChanged, choseManually, typeChosen, categoryByPerson };
}

/** Claude's answer through the account, or none: offline, signed out, a build without accounts. */
async function suggest(
  name: string,
  kind: Kind,
  choices: readonly { id: string; name: string }[],
): Promise<Suggestion> {
  try {
    return await accountController().suggestCategory(name, kind, choices);
  } catch {
    return {};
  }
}
