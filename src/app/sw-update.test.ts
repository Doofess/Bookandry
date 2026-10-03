import { afterEach, describe, expect, it } from 'vitest';

import { nothingInProgress } from './sw-update';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('when a new version may reload the page', () => {
  it('at once on an untouched page', () => {
    document.body.innerHTML = '<main><input type="email" /><input type="password" /></main>';
    expect(nothingInProgress(document)).toBe(true);
  });

  it('not while something has been typed', () => {
    document.body.innerHTML = '<main><input type="email" value="dana@example.com" /></main>';
    expect(nothingInProgress(document)).toBe(false);
  });

  it('not while a dialog is open', () => {
    document.body.innerHTML = '<div role="dialog"><p>Add an expense</p></div>';
    expect(nothingInProgress(document)).toBe(false);
  });

  it('ignores fields that hold no typing', () => {
    document.body.innerHTML = '<input type="hidden" value="x" /><input type="checkbox" value="on" />';
    expect(nothingInProgress(document)).toBe(true);
  });
});
