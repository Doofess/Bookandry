/** DELETE or מחיקה, in either language, whatever the case or the spaces around it. */
export function matchesWord(input: string): boolean {
  const word = input.trim().toLocaleLowerCase();
  return word === 'delete' || word === 'מחיקה';
}
