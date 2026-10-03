/**
 * New versions arrive by themselves.
 *
 * The service worker (vite-plugin-pwa, `skipWaiting`) activates a new version
 * as soon as it has downloaded it. A page already open is still running the
 * old one, and after a deploy the old one's files are gone from the server -
 * so the page reloads into the new version, at a moment that loses nothing:
 *
 * - at once, when nothing is in progress on it (no dialog open, nothing typed
 *   into a field) - the front door a moment after it opened, say;
 * - otherwise the next time it goes out of sight (another tab, the phone's
 *   home screen), so whoever comes back finds the new version waiting.
 *
 * Without this, a version waited until every tab of the app was closed - on a
 * phone, where tabs stay open for days, that meant days of an old app.
 */
export function keepUpToDate(registration: ServiceWorkerRegistration, doc: Document = document): void {
  const container = navigator.serviceWorker;
  // A page the worker did not control when it loaded is current already:
  // gaining a controller (the very first install) is no reason to reload.
  const hadController = container.controller !== null;
  let reloading = false;
  const reload = (): void => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  container.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (doc.visibilityState === 'hidden' || nothingInProgress(doc)) {
      reload();
      return;
    }
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') reload();
    });
  });

  // The browser checks for a new version on navigation; an app left open
  // checks again whenever it comes back into view.
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') void registration.update().catch(() => undefined);
  });
}

/** Nothing on the page that a reload would throw away. */
export function nothingInProgress(doc: Document): boolean {
  if (doc.querySelector('[role="dialog"], [role="alertdialog"]') !== null) return false;
  const fields = doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  for (const field of fields) {
    if (field.type === 'hidden' || field.type === 'checkbox' || field.type === 'radio') continue;
    if (field.value !== '') return false;
  }
  return true;
}
