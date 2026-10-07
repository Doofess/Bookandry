import { rememberPendingInvite } from '@/features/household/pending-invite';
import { rememberPendingWipe } from '@/features/household/pending-wipe';

import { LINKED_ROUTES } from './routes';

/**
 * An emailed link's token (/link?t=… or /wipe?t=…), kept for the visit at
 * boot, before any gate decides what to show.
 *
 * Signed out, the welcome screen shows instead of the page the link opens, so
 * that page never mounts to keep it; signing in with Google then leaves the
 * page altogether. Kept here, it survives both, and useReturnToInvite brings
 * the person back to it once signed in. A malformed token is not kept.
 */
export function capturePendingLinks(location: Pick<Location, 'pathname' | 'search'> = window.location): void {
  const token = new URLSearchParams(location.search).get('t');
  if (token === null) return;
  const path = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : location.pathname;
  if (path === LINKED_ROUTES.link) rememberPendingInvite(token);
  else if (path === LINKED_ROUTES.wipe) rememberPendingWipe(token);
}
