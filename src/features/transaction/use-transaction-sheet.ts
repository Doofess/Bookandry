import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { loadCatalog } from '@/data/card-catalog';
import { resolveCard, type ResolvedCard } from '@/data/card-catalog/resolve';
import { db } from '@/db/db';
import { expandOccurrences } from '@/domain/occurrences';
import { isLocalDate, maxDate, minDate } from '@/lib/dates';
import type { CardCatalogLink, Occurrence, Override, PaymentMethod, Transaction } from '@/types/domain';
import type { Kind, LocalDate } from '@/types/money';

/** The add form: `expense` or `income`. `1` (older links) and anything unknown mean an expense. */
const ADD = 'add';
const EDIT = 'edit';
/** The ORIGINAL slot date - the Override key, not the moved date. */
const AT = 'at';
/** Duplicate: the transaction the add form is prefilled from; its slot is AT. */
const FROM = 'from';
/** "Smart import": `1`, or `shared` when files arrived from the phone's Share menu. */
const IMPORT = 'import';
/** Files shared to the app, waiting in the service worker's cache under this id. */
const SHARED_ID = 'id';
/** The found transaction being edited inside the import sheet, by its index. */
const ROW = 'row';
/** The found card or bank account being filled in inside the import sheet, by its id. */
const CARD = 'card';
/** An edit opened from "A different amount…": `amount`, the field the form puts the caret in. */
const FOCUS = 'focus';

export type SheetTarget =
  | { readonly mode: 'closed' }
  | {
      readonly mode: 'add';
      readonly kind: Kind;
      /** Duplicate: the row the form is prefilled from. */
      readonly from?: { readonly transactionId: string; readonly at: LocalDate };
    }
  | {
      readonly mode: 'edit';
      readonly transactionId: string;
      readonly at: LocalDate;
      /** Opened from "not counted yet" to change the amount: the form focuses it. */
      readonly focus?: 'amount';
    }
  | {
      readonly mode: 'import';
      /** The share's id when files came from the Share menu. */
      readonly sharedId?: string;
      /** A found transaction open for editing, so Back returns to the list. */
      readonly row?: number;
      /** A found card or account open in its editor, likewise. */
      readonly card?: string;
    };

export type TransactionSheetApi = {
  readonly target: SheetTarget;
  readonly openAdd: (kind?: Kind) => void;
  readonly openEdit: (occurrence: Occurrence, options?: { readonly focus?: 'amount' }) => void;
  /** The add form, prefilled from this row (see `duplicateFormValues`). */
  readonly openDuplicate: (occurrence: Occurrence) => void;
  readonly openImport: (sharedId?: string) => void;
  /** Open one found transaction inside the import sheet, or `undefined` to go back to the list. */
  readonly openImportRow: (row: number | undefined) => void;
  /** Open one found card or account in its editor inside the import sheet, or go back to the list. */
  readonly openImportCard: (card: string | undefined) => void;
  readonly close: () => void;
  /** For `onOpenChange`, which a backdrop click or Escape also drives. */
  readonly setOpen: (open: boolean) => void;
};

/**
 * Which transaction sheet is open, held in the URL.
 *
 * The plan calls for pushing a history entry when a sheet opens and closing it
 * on `popstate` - otherwise Android's hardware back button inside a standalone
 * PWA closes the APP and takes a half-filled form with it. That is exactly
 * right, and this is that mechanism expressed through the router rather than
 * behind its back: `useSearchParams` with `replace: false` pushes precisely one
 * entry, and back pops it.
 *
 * Doing it with a raw `history.pushState` would work too, right up until React
 * Router's own popstate listener sees a state object it did not write. It also
 * needs a flag to tell "the user pressed back" from "we closed the sheet and
 * are now unwinding our own entry", and that flag is the bug farm.
 *
 * Deliberately different from the filters, which use `replace: true`: a filter
 * chip is not somewhere you navigated to, but an open sheet is.
 */
export function useTransactionSheet(): TransactionSheetApi {
  const [params, setParams] = useSearchParams();

  const target = useMemo<SheetTarget>(() => {
    const adding = params.get(ADD);
    if (adding !== null) {
      const kind = adding === 'income' ? 'income' : 'expense';
      const fromId = params.get(FROM);
      const fromAt = params.get(AT);
      // Both halves or neither, as for an edit: without its slot the source
      // row cannot be found, and the form is a plain add.
      return fromId !== null && fromId !== '' && fromAt !== null && isLocalDate(fromAt)
        ? { mode: 'add', kind, from: { transactionId: fromId, at: fromAt } }
        : { mode: 'add', kind };
    }
    const importing = params.get(IMPORT);
    if (importing === '1' || importing === 'shared') {
      const sharedId = importing === 'shared' ? (params.get(SHARED_ID) ?? undefined) : undefined;
      const row = Number(params.get(ROW) ?? '');
      const card = params.get(CARD) ?? '';
      return {
        mode: 'import',
        ...(sharedId === undefined || sharedId === '' ? {} : { sharedId }),
        ...(params.get(ROW) !== null && Number.isInteger(row) && row >= 0 ? { row } : {}),
        ...(card === '' ? {} : { card }),
      };
    }
    const transactionId = params.get(EDIT);
    const at = params.get(AT);
    // Both halves or neither: an edit target without its slot cannot be
    // resolved to an occurrence, and guessing one would open the wrong row.
    if (transactionId !== null && at !== null && isLocalDate(at)) {
      return {
        mode: 'edit',
        transactionId,
        at,
        ...(params.get(FOCUS) === 'amount' ? { focus: 'amount' as const } : {}),
      };
    }
    return { mode: 'closed' };
  }, [params]);

  const write = useCallback(
    (next: SheetTarget, replace = next.mode === 'closed') => {
      const updated = new URLSearchParams(params);
      updated.delete(ADD);
      updated.delete(EDIT);
      updated.delete(AT);
      updated.delete(FROM);
      updated.delete(IMPORT);
      updated.delete(SHARED_ID);
      updated.delete(ROW);
      updated.delete(CARD);
      updated.delete(FOCUS);

      if (next.mode === 'add') {
        updated.set(ADD, next.kind);
        if (next.from !== undefined) {
          updated.set(FROM, next.from.transactionId);
          updated.set(AT, next.from.at);
        }
      }
      if (next.mode === 'import') {
        updated.set(IMPORT, next.sharedId === undefined ? '1' : 'shared');
        if (next.sharedId !== undefined) updated.set(SHARED_ID, next.sharedId);
        if (next.row !== undefined) updated.set(ROW, String(next.row));
        if (next.card !== undefined) updated.set(CARD, next.card);
      }
      if (next.mode === 'edit') {
        updated.set(EDIT, next.transactionId);
        updated.set(AT, next.at);
        if (next.focus !== undefined) updated.set(FOCUS, next.focus);
      }

      /*
       * Push on open, REPLACE on close.
       *
       * Closing by pushing another entry would leave the open state behind us
       * in history, so back would REOPEN the sheet the user just dismissed -
       * and a second back would close it again, forever.
       *
       * The accepted cost: dismissing with Cancel replaces the pushed entry,
       * so the entry underneath is now an identical closed feed and the next
       * back press appears to do nothing. `navigate(-1)` would avoid that but
       * walks out of the app entirely when the sheet was reached by a direct
       * link, which is the worse failure of the two.
       */
      setParams(updated, { replace });
    },
    [params, setParams],
  );

  return useMemo(
    () => ({
      target,
      openAdd: (kind: Kind = 'expense') => {
        write({ mode: 'add', kind });
      },
      openEdit: (occurrence: Occurrence, options: { readonly focus?: 'amount' } = {}) => {
        // Keyed on the ORIGINAL slot, not the visible date: that is what the
        // Override row is keyed on, so a moved occurrence still finds itself.
        write({
          mode: 'edit',
          transactionId: occurrence.transaction.id,
          at: occurrence.originalDate,
          ...options,
        });
      },
      openDuplicate: (occurrence: Occurrence) => {
        write({
          mode: 'add',
          kind: occurrence.transaction.kind,
          from: { transactionId: occurrence.transaction.id, at: occurrence.originalDate },
        });
      },
      openImport: (sharedId?: string) => {
        write({ mode: 'import', ...(sharedId === undefined ? {} : { sharedId }) });
      },
      openImportRow: (row: number | undefined) => {
        if (target.mode !== 'import') return;
        const { row: _open, card: _card, ...rest } = target;
        // Back to the list replaces, like closing does, so Back never reopens the row.
        if (row === undefined) write(rest, true);
        else write({ ...rest, row });
      },
      openImportCard: (card: string | undefined) => {
        if (target.mode !== 'import') return;
        const { row: _row, card: open, ...rest } = target;
        // From one card straight to the next replaces too: Back goes to the list, not the last card.
        if (card === undefined) write(rest, true);
        else write({ ...rest, card }, open !== undefined);
      },
      close: () => {
        write({ mode: 'closed' });
      },
      setOpen: (open: boolean) => {
        if (!open) write({ mode: 'closed' });
      },
    }),
    [target, write],
  );
}

export type EditTarget = {
  readonly transaction: Transaction;
  readonly overrides: readonly Override[];
  readonly occurrence: Occurrence;
};

export type EditTargetState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  /** The row was deleted elsewhere - another tab, or the sweeper. */
  | { readonly status: 'gone' }
  | { readonly status: 'ready'; readonly target: EditTarget };

/**
 * Load the occurrence the URL names.
 *
 * A live query rather than a one-shot read, because the plan requires an open
 * sheet to notice that its record was deleted in another tab - a PWA people
 * leave open in two places. Without it, saving would resurrect a row the user
 * deleted somewhere else.
 *
 * `includeSkipped` is on: a skipped occurrence is still editable, and it is the
 * only way to reach one at all.
 */
export function useEditTarget(target: SheetTarget, today: LocalDate): EditTargetState {
  const state = useLiveQuery(async (): Promise<EditTargetState> => {
    if (target.mode !== 'edit') return { status: 'idle' };

    const transaction = await db.transactions.get(target.transactionId);
    if (transaction === undefined || transaction.isDeleted === 1) return { status: 'gone' };

    const overrides = await db.overrides.where('transactionId').equals(transaction.id).toArray();

    /*
     * The window has to cover where the occurrence WENT, not only where its
     * slot is.
     *
     * `expandOccurrences` filters on the EFFECTIVE date - deliberately, so a
     * moved occurrence appears on the day it was moved to and nowhere else - so
     * asking for the single day `at` returns nothing at all once someone has
     * moved that occurrence. Widening to span both dates finds it either way,
     * and `originalDate` is still what identifies it.
     */
    const own = overrides.find((o) => o.occurrenceDate === target.at);
    const moved = own?.action === 'modify' ? own.patch.date : undefined;
    const from = moved === undefined ? target.at : minDate(target.at, moved);
    const to = moved === undefined ? target.at : maxDate(target.at, moved);

    const occurrence = expandOccurrences(transaction, overrides, from, to, {
      today,
      includeSkipped: true,
    }).find((o) => o.originalDate === target.at);

    // A slot that no longer exists: the rule was changed elsewhere so this day
    // is no longer one of its occurrences.
    if (occurrence === undefined) return { status: 'gone' };

    return { status: 'ready', target: { transaction, overrides, occurrence } };
  }, [
    target.mode,
    target.mode === 'edit' ? target.transactionId : '',
    target.mode === 'edit' ? target.at : '',
    today,
  ]);

  return state ?? { status: 'loading' };
}

/** A credit card's catalog link, or undefined: only a credit card is linked. */
function linkOf(method: PaymentMethod): CardCatalogLink | undefined {
  return method.type === 'credit_card' ? method.card?.catalog : undefined;
}

const linkKey = (link: CardCatalogLink) => `${link.issuer}|${link.bank}|${link.tier}|${link.club ?? ''}`;

const NO_CARDS: ReadonlyMap<string, ResolvedCard> = new Map();

/**
 * The catalog entry of every card linked to it, by payment method id, so the
 * purchase form can offer the chosen card's own deals the moment it is chosen.
 *
 * The catalog arrives through `loadCatalog()` and nowhere else, so none of it
 * is in the main chunk. Until it has loaded - or if it cannot be had - the map
 * is empty and the form is what it always was: a card it does not know is a
 * card not linked, and nothing waits on it.
 */
export function useResolvedCards(methods: readonly PaymentMethod[]): ReadonlyMap<string, ResolvedCard> {
  return useResolvedCardsState(methods).cards;
}

/**
 * `useResolvedCards`, and whether the catalog has answered for these cards:
 * false while it is still loading, true once it has loaded, or failed to. A
 * linked card is "not resolved yet" only while `settled` is false.
 */
export function useResolvedCardsState(methods: readonly PaymentMethod[]): {
  readonly cards: ReadonlyMap<string, ResolvedCard>;
  readonly settled: boolean;
} {
  const linked = methods.flatMap((m) => {
    const link = linkOf(m);
    return link === undefined ? [] : [{ id: m.id, link }];
  });
  // The links' parts, not the methods' identity: every live-query tick hands over new objects.
  const key = linked.map(({ id, link }) => `${id}=${linkKey(link)}`).join(',');
  const [found, setFound] = useState<{ key: string; cards: ReadonlyMap<string, ResolvedCard> } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (key === '') return undefined;
    let live = true;
    loadCatalog().then(
      (catalog) => {
        if (!live) return;
        const cards = new Map<string, ResolvedCard>();
        for (const { id, link } of linked) {
          const resolved = resolveCard(catalog, link);
          if (resolved !== undefined) cards.set(id, resolved);
        }
        setFound({ key, cards });
      },
      () => {
        // Cannot be had: the form is what it always was, for a card not linked.
        if (live) setFound({ key, cards: NO_CARDS });
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === '') return { cards: NO_CARDS, settled: true };
  return found?.key === key ? { cards: found.cards, settled: true } : { cards: NO_CARDS, settled: false };
}

/** One card's catalog entry, for a card just saved; undefined when it is not linked or cannot be had. */
export async function resolveMethodCard(method: PaymentMethod): Promise<ResolvedCard | undefined> {
  const link = linkOf(method);
  if (link === undefined) return undefined;
  try {
    return resolveCard(await loadCatalog(), link);
  } catch {
    return undefined;
  }
}
