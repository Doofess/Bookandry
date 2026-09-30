/**
 * The addresses Google and Apple send people back to. On their own, with no
 * imports, because the Cloudflare Worker (src/services/cloudflare/worker.ts)
 * is bundled separately from the app and shares only this.
 *
 * Both are registered with the providers (see the README's checklist):
 * changing either one breaks signing in until they are re-registered.
 */

/** Where Google (directly) and Apple (through the Worker) send the person back. */
export const CALLBACK_PATH = '/auth/callback';
/** Where Apple posts its answer. Handled by the Worker, not by the app. */
export const APPLE_RETURN_PATH = '/auth/apple';
