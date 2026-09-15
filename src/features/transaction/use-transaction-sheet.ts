import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Whether the transaction sheet is open, held in the URL.
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
const PARAM = 'add';

export type TransactionSheetApi = {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  /** For `onOpenChange`, which a backdrop click or Escape also drives. */
  readonly setOpen: (open: boolean) => void;
};

export function useTransactionSheet(): TransactionSheetApi {
  const [params, setParams] = useSearchParams();

  const isOpen = params.get(PARAM) === '1';

  const setOpen = useCallback(
    (next: boolean) => {
      const updated = new URLSearchParams(params);
      if (next) updated.set(PARAM, '1');
      else updated.delete(PARAM);
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
      setParams(updated, { replace: !next });
    },
    [params, setParams],
  );

  return useMemo(
    () => ({
      isOpen,
      open: () => {
        setOpen(true);
      },
      close: () => {
        setOpen(false);
      },
      setOpen,
    }),
    [isOpen, setOpen],
  );
}
