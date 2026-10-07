import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { pendingInvite } from '@/features/household/pending-invite';
import { pendingWipe } from '@/features/household/pending-wipe';

import { useAccount } from './account';
import { LINKED_ROUTES } from './routes';

/**
 * Back from signing in (or from the first-run steps) with an invitation, or a
 * request to delete everyone's data, still waiting: straight back to it.
 * The invitation goes first; the request waits for its turn, so the two never
 * send each other back and forth.
 */
export function useReturnToInvite(): void {
  const signedIn = useAccount().status === 'signed_in';
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!signedIn) return;
    if (pendingInvite() !== undefined) {
      if (pathname !== LINKED_ROUTES.link) void navigate(LINKED_ROUTES.link, { replace: true });
    } else if (pendingWipe() !== undefined && pathname !== LINKED_ROUTES.wipe) {
      void navigate(LINKED_ROUTES.wipe, { replace: true });
    }
  }, [signedIn, pathname, navigate]);
}
