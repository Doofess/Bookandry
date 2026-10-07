import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAccount } from './account';

/** How long the notice waits for the requester's name before it goes without. */
export const NAME_WAIT_MS = 3_000;

/**
 * This device was cleared by someone else's erase: say so, once for each.
 * While who asked is still being looked up, it waits a moment for the name,
 * then says it either way: one toast, named when known.
 */
export function useWipeNotice(): void {
  const { t } = useTranslation();
  const view = useAccount();
  const notice = view.status === 'signed_in' ? view.wipeNotice : undefined;
  const shown = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (notice === undefined || shown.current === notice.at) return;
    const say = (): void => {
      shown.current = notice.at;
      toast(notice.by !== undefined ? t('wipe.notice', { name: notice.by }) : t('wipe.noticeAnon'));
    };
    if (notice.by !== undefined || notice.naming !== true) {
      say();
      return;
    }
    const timer = setTimeout(say, NAME_WAIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice, t]);
}
