/**
 * Length limits on user-supplied names.
 *
 * The spec set no limit anywhere. A 200-character category name breaks the chip
 * grid, the feed row, the chart tooltip, the stat card and the type-to-confirm
 * delete dialog - five separate visual defects from one missing constraint, all
 * of which look like CSS bugs.
 */
export const NAME_MAX_LENGTH = 40;

export class InvalidNameError extends Error {
  constructor(readonly reason: 'empty' | 'too_long') {
    super(
      reason === 'empty'
        ? 'Name cannot be empty'
        : `Name cannot exceed ${String(NAME_MAX_LENGTH)} characters`,
    );
    this.name = 'InvalidNameError';
  }
}

/**
 * Trim first, then measure.
 *
 * Trimming after the length check lets "   " pass as 3 characters and land in
 * the database as an invisible name that no list can render.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count += 1;
  return count;
}

export function normalizeName(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new InvalidNameError('empty');
  // Graphemes, not `.length`. A flag emoji is one character to the user, two
  // code points, and four UTF-16 units, so `.length` would reject a name of
  // eleven of them as 44 characters.
  if (graphemeLength(trimmed) > NAME_MAX_LENGTH) throw new InvalidNameError('too_long');
  return trimmed;
}
