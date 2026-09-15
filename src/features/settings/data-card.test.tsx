import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { IsoInstant } from '@/types/money';

import { DataCard } from './data-card';

const TODAY = d('2026-09-15');

beforeAll(async () => {
  await initTestI18n();
});

const render = (lastExportedAt: IsoInstant | undefined, persisted?: boolean) =>
  renderWithProviders(<DataCard lastExportedAt={lastExportedAt} today={TODAY} persisted={persisted} />);

const at = (date: string): IsoInstant => `${date}T10:00:00.000Z` as IsoInstant;

describe('the backup nudge', () => {
  it('says so when there has never been one', () => {
    // Local-first with no sync: an install that has never exported has no
    // durability story at all, and the app is the only thing that can say so.
    render(undefined);

    expect(screen.getByText(/never backed up/i)).toBeInTheDocument();
    expect(screen.getByText(/more than a month/i)).toBeInTheDocument();
  });

  it('stays quiet for a recent backup', () => {
    render(at('2026-09-13'));

    expect(screen.queryByText(/more than a month/i)).not.toBeInTheDocument();
  });

  it('nudges once a month has passed', () => {
    render(at('2026-08-01'));

    expect(screen.getByText(/more than a month/i)).toBeInTheDocument();
  });

  it('does not nudge exactly ON the threshold', () => {
    // 30 days is "a month ago", not "more than a month". A nudge that fires a
    // day early is a nudge people learn to ignore.
    render(at('2026-08-16'));

    expect(screen.queryByText(/more than a month/i)).not.toBeInTheDocument();
  });
});

describe('the storage note', () => {
  it('says nothing while the answer is unknown', () => {
    // `navigator.storage.persisted()` is async. Guessing in the meantime would
    // tell half the users the wrong thing for a frame.
    render(at('2026-09-14'), undefined);

    expect(screen.queryByText(/promised to keep/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/may clear this data/i)).not.toBeInTheDocument();
  });

  it('reassures when the browser has promised to keep the data', () => {
    render(at('2026-09-14'), true);

    expect(screen.getByText(/promised to keep/i)).toBeInTheDocument();
  });

  it('warns when persistence was DENIED', () => {
    // The request can be refused, and a best-effort store may be evicted when
    // the device runs low on space - which is exactly when the backup above
    // stops being optional.
    render(at('2026-09-14'), false);

    expect(screen.getByText(/may clear this data/i)).toBeInTheDocument();
  });
});

describe('the import modes', () => {
  it('groups them, so they announce as one choice', () => {
    /*
     * `role="radio"` with no radiogroup ancestor is invalid ARIA: the options
     * announce as standalone radios with no "1 of 2" and no arrow keys. This
     * assertion exists because getByRole finds an orphan radio perfectly well,
     * so the bug is invisible to the obvious test.
     */
    render(undefined);

    const group = screen.getByRole('radiogroup', { name: /restore from a file/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('defaults to merge, the non-destructive one', () => {
    render(undefined);

    expect(screen.getByRole('radio', { name: /merge/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /replace/i })).toHaveAttribute('aria-checked', 'false');
  });
});
