/** The import's stages: choosing and reading are the first step, checking what was found the second, finishing a found card the third. */
export type ImportStage = 'picker' | 'reading' | 'review' | 'methods';

/** The three steps of the pop-out (0-based). */
export function importStep(stage: ImportStage): 0 | 1 | 2 {
  if (stage === 'review') return 1;
  if (stage === 'methods') return 2;
  return 0;
}
