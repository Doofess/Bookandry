import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAccount } from './account';

/** This device was cleared by someone else's erase: say so, once for each. */
export function useWipeNotice(): void {
  const { t } = useTranslation();
  const view = useAccount();
  const notice = view.status === 'signed_in' ? view.wipeNotice : undefined;
  const shown = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (notice === undefined || shown.current === notice.at) return;
    shown.current = notice.at;
    toast(notice.by !== undefined ? t('wipe.notice', { name: notice.by }) : t('wipe.noticeAnon'));
  }, [notice, t]);
}
