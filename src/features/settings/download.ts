import type { IsoInstant } from '@/types/money';

/**
 * Hand a JSON file to the user.
 *
 * Shared by the Data card and the reconvert dialog, which both force the same
 * backup. Two copies would drift on the one detail that matters: the object URL
 * is revoked immediately, because leaving it alive pins the whole export in
 * memory for the life of the document - and an export of a few thousand
 * transactions is not small.
 *
 * In `features/` rather than `lib/`, which is barred from touching the DOM.
 */
export function downloadJson(envelope: unknown, now: IsoInstant): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bookandry-${now.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
