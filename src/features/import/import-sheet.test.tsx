import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WireRequest } from '@/domain/import-wire';
import { wireRow } from '@/domain/test-factories';
import type { SheetTarget } from '@/features/transaction/use-transaction-sheet';
import type { ExtractOutcome } from '@/services/supabase/extract';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Profile } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

const reader = vi.hoisted(() => ({
  calls: [] as WireRequest[],
  answers: [] as ExtractOutcome[],
}));

vi.mock('@/app/account', () => ({
  useAccount: () => ({ status: 'signed_out' }),
  accountController: () => ({
    extractTransactions: (request: WireRequest) => {
      reader.calls.push(request);
      return Promise.resolve(reader.answers.shift() ?? { ok: false, error: 'upstream' });
    },
  }),
}));

const { ImportSheet } = await import('./import-sheet');
const { writeSession } = await import('./import-session');
const { db } = await import('@/db/db');
const { listUnfinished } = await import('@/db/import-drafts');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const category = (id: string, kind: 'income' | 'expense'): Category => ({
  id,
  kind,
  icon: 'Circle',
  sortOrder: 0,
  isArchived: 0,
  source: 'builtin',
  nameKey: `categories:builtin.${id.slice(4)}`,
  createdAt: NOW,
  updatedAt: NOW,
});
const profile: Profile = {
  id: 'p1',
  name: 'Dana',
  color: 'blue',
  avatar: { kind: 'emoji', value: '🙂' },
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Profile;
const usage = { in: 10, out: 10, cacheRead: 0, cacheWrite: 0 };

describe('Smart import', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('reads a file, shows what it found with what needs a look apart, and adds only what is ticked', async () => {
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          r: [
            wireRow({ d: '03/09/26', a: '120.50', m: 'Shufersal' }),
            wireRow({ d: '04/09/26', a: '245.00', m: 'Paz' }),
            // Not printed anywhere in the file.
            wireRow({ d: '05/09/26', a: '99.00', m: 'Ghost' }),
          ],
          t: [],
          per: null,
          done: true,
        },
      },
      // The second look finds nothing better: the ghost stays flagged.
      { ok: true, usage, result: { r: [] } },
    ];
    const onSaved = vi.fn<(date: LocalDate) => void>();
    const user = userEvent.setup();
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        onOpenCard={() => undefined}
        profiles={[profile]}
        categories={[category('cat.groceries', 'expense'), category('cat.salary', 'income')]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={onSaved}
      />,
    );

    const text = '03/09/26 Shufersal 120.50\n04/09/26 Paz 245.00\n';
    await user.upload(
      screen.getByTestId('import-input'),
      new File([text], 'statement.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    await screen.findByRole('button', { name: 'Ready (2)' });
    expect(screen.getByRole('button', { name: 'Check this (1)' })).toBeInTheDocument();
    expect(screen.getByText("Check the amount: it isn't in the file.")).toBeInTheDocument();
    // What was sent: the file's text, and the household's categories by alias - never ids.
    const first = reader.calls[0];
    expect(first?.mode === 'extract' && first.sources[0]).toMatchObject({ kind: 'text', text });
    expect(first?.ctx.cats.map((c) => c.a)).toEqual(['c1', 'c2']);

    // The flagged row is not ticked; the two that check out are.
    expect(screen.getByRole('checkbox', { name: 'Add Ghost' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Add Shufersal' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Add Paz' }));
    await user.click(screen.getByTestId('import-add'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('2026-09-03');
    });
    const saved = await db.transactions.toArray();
    expect(saved.map((t) => [t.note, t.money.baseAmountMinor, t.categoryId])).toEqual([
      ['Shufersal', 12_050, 'cat.groceries'],
    ]);
  });

  it('says why a file was refused, and offers another', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        onOpenCard={() => undefined}
        profiles={[profile]}
        categories={[category('cat.groceries', 'expense')]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={() => undefined}
      />,
    );
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['not an image'], 'broken.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));
    const list = await screen.findByText(
      "We didn't find any transactions, cards or bank accounts in these files.",
    );
    expect(list).toBeInTheDocument();
    expect(within(document.body).getAllByText("This file couldn't be opened.").length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Choose other files' })).toBeInTheDocument();
  });

  it('opens a card the file showed only part of in the card editor, filled in, for the rest', async () => {
    // A session outlives its sheet; this one starts afresh.
    writeSession(undefined);
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          r: [],
          t: [],
          per: null,
          done: true,
          k: [
            {
              s: 0,
              n: 'max executive',
              l4: '3200',
              nw: 'Mastercard',
              is: 'MAX',
              cr: '5.9%',
              lim: '',
              bd: '',
            },
          ],
          ba: [],
          pr: '4.75%',
        },
      },
    ];
    // The sheet's place in the URL, as the feed keeps it.
    function Harness() {
      const [target, setTarget] = useState<Extract<SheetTarget, { mode: 'import' }>>({ mode: 'import' });
      return (
        <ImportSheet
          target={target}
          onOpenChange={() => undefined}
          onOpenRow={() => undefined}
          onOpenCard={(card) => {
            setTarget(card === undefined ? { mode: 'import' } : { mode: 'import', card });
          }}
          profiles={[profile]}
          categories={[category('cat.groceries', 'expense')]}
          paymentMethods={[]}
          activeProfileId="p1"
          baseCurrency="ILS"
          today={'2026-09-15' as LocalDate}
          onSaved={() => undefined}
        />
      );
    }
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['max executive 3200 Mastercard קרדיט 5.9%'], 'cards.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    // Only a card, and its billing day not in the file: straight to the editor, on what it did show.
    await screen.findByText("Filled in from your file. Add what it didn't show: billing day.");
    expect(screen.getByLabelText('Label')).toHaveValue('max executive');
    expect(screen.getByLabelText('Last 4 digits')).toHaveValue('3200');
    await user.click(screen.getByRole('radio', { name: 'The 10th' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Added, and no longer waiting to be finished.
    await waitFor(async () => {
      expect(await listUnfinished(db)).toEqual([]);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('import-unfinished')).toBeNull();
    });
    const [saved] = (await db.paymentMethods.toArray()).filter((m) => m.type === 'credit_card');
    expect(saved).toMatchObject({
      label: 'max executive',
      profileId: 'p1',
      card: {
        lastDigits: '3200',
        network: 'mastercard',
        issuer: 'max',
        billingDay: 10,
        creditPrimeMargin: '1.15',
      },
    });
  });

  it('keeps what a file showed only part of - through closing and reloading - until it is filled in or deleted', async () => {
    writeSession(undefined);
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          r: [],
          t: [],
          per: null,
          done: true,
          k: [{ s: 0, n: 'Dream Card VIP', l4: '0400', nw: 'Visa', is: 'MAX', cr: '', lim: '', bd: '' }],
          ba: [{ s: 0, n: 'בנק הפועלים', bk: '', br: '532', no: '', h: '' }],
          pr: '',
        },
      },
    ];
    function Harness() {
      const [target, setTarget] = useState<Extract<SheetTarget, { mode: 'import' }>>({ mode: 'import' });
      return (
        <ImportSheet
          target={target}
          onOpenChange={() => undefined}
          onOpenRow={() => undefined}
          onOpenCard={(card) => {
            setTarget(card === undefined ? { mode: 'import' } : { mode: 'import', card });
          }}
          profiles={[profile]}
          categories={[category('cat.groceries', 'expense')]}
          paymentMethods={[]}
          activeProfileId="p1"
          baseCurrency="ILS"
          today={'2026-09-15' as LocalDate}
          onSaved={() => undefined}
        />
      );
    }
    const user = userEvent.setup();
    const first = renderWithProviders(<Harness />);
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['Dream Card VIP 0400 Visa / בנק הפועלים סניף 532'], 'cards.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    // Straight into the first one; not filled in now.
    await screen.findByText("Filled in from your file. Add what it didn't show: billing day.");
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const waiting = await screen.findByTestId('import-unfinished');
    expect(within(waiting).getByRole('heading', { name: 'Still to finish (2)' })).toBeInTheDocument();

    // The sheet closed, the page reloaded: nothing of the reading is left but these.
    first.unmount();
    writeSession(undefined);
    renderWithProviders(<Harness />);
    const again = await screen.findByTestId('import-unfinished');
    expect(
      within(again).getByRole('button', { name: 'Fill in the rest of Dream Card VIP' }),
    ).toBeInTheDocument();
    expect(
      within(again).getByRole('button', { name: 'Fill in the rest of Bank Hapoalim' }),
    ).toBeInTheDocument();

    // Deleted by hand: gone.
    await user.click(within(again).getByRole('button', { name: 'Delete Bank Hapoalim' }));
    await waitFor(async () => {
      expect((await listUnfinished(db)).map((u) => u.kind)).toEqual(['card']);
    });
    expect(within(again).queryByRole('button', { name: 'Delete Bank Hapoalim' })).toBeNull();

    // Filled in: gone too.
    await user.click(within(again).getByRole('button', { name: 'Fill in the rest of Dream Card VIP' }));
    await user.click(await screen.findByRole('radio', { name: 'The 10th' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect(await listUnfinished(db)).toEqual([]);
    });
    expect(await db.paymentMethods.filter((m) => m.label === 'Dream Card VIP').count()).toBe(1);
  });

  it('in a household, fills in whose each row is where the file says, and asks for the rest', async () => {
    writeSession(undefined);
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          r: [
            // The statement names Yossi as the holder.
            wireRow({ d: '06/09/26', a: '42.00', m: 'Aroma', w: 'u2' }),
            // Nothing says whose this is.
            wireRow({ d: '07/09/26', a: '18.00', m: 'Kiosk' }),
          ],
          t: [],
          per: null,
          done: true,
        },
      },
      { ok: true, usage, result: { r: [] } },
    ];
    const partner = { ...profile, id: 'p2', name: 'Yossi', sortOrder: 1 } as Profile;
    const onSaved = vi.fn<(date: LocalDate) => void>();
    const user = userEvent.setup();
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        onOpenCard={() => undefined}
        profiles={[profile, partner]}
        categories={[category('cat.groceries', 'expense')]}
        paymentMethods={[]}
        activeProfileId="all"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={onSaved}
      />,
    );

    const whose = screen.getByRole('radiogroup', { name: 'Whose spending and income is this?' });
    // Looking at everyone: not answered for them - and reading need not wait for it.
    expect(within(whose).getByRole('radio', { name: 'Dana' })).not.toBeChecked();
    expect(within(whose).getByRole('radio', { name: 'Yossi' })).not.toBeChecked();
    const text = '06/09/26 Aroma 42.00\n07/09/26 Kiosk 18.00\n';
    await user.upload(
      screen.getByTestId('import-input'),
      new File([text], 'card.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    await screen.findByTestId('import-add');
    // The reader was told who is in the household, by alias.
    const request = reader.calls.at(-1);
    expect(request?.ctx.ppl).toEqual([
      { a: 'u1', n: 'Dana' },
      { a: 'u2', n: 'Yossi' },
    ]);
    expect(screen.getByText('Choose whose this is.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Add Aroma' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Add Kiosk' })).not.toBeChecked();

    // "For" answers the rest; the row the file named stays Yossi's.
    await user.selectOptions(screen.getByRole('combobox', { name: 'For' }), 'Dana');
    expect(await screen.findByRole('checkbox', { name: 'Add Kiosk' })).toBeChecked();
    await user.click(screen.getByTestId('import-add'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const saved = await db.transactions.filter((t) => t.note === 'Aroma' || t.note === 'Kiosk').toArray();
    expect(Object.fromEntries(saved.map((t) => [t.note, t.profileId]))).toEqual({ Aroma: 'p2', Kiosk: 'p1' });
  });

  describe('the whose picker', () => {
    const twin = { ...profile, id: 'p2', name: 'Dana', color: 'red', sortOrder: 1 } as Profile;
    const open = (profiles: Profile[]) =>
      renderWithProviders(
        <ImportSheet
          target={{ mode: 'import' }}
          onOpenChange={() => undefined}
          onOpenRow={() => undefined}
          onOpenCard={() => undefined}
          profiles={profiles}
          categories={[category('cat.groceries', 'expense')]}
          paymentMethods={[]}
          activeProfileId="all"
          baseCurrency="ILS"
          today={'2026-09-15' as LocalDate}
          onSaved={() => undefined}
        />,
      );

    it('shows each person as their round avatar, named for a screen reader, so two of the same name can be told apart', async () => {
      const user = userEvent.setup();
      open([profile, twin]);
      const whose = screen.getByRole('radiogroup', { name: 'Whose spending and income is this?' });
      const radios = within(whose).getAllByRole('radio', { name: 'Dana' });
      expect(radios).toHaveLength(2);
      // The avatar is there, one per person, in each person's own colour; the name is not drawn.
      const avatars = radios.map((radio) => radio.querySelector<HTMLElement>('[data-person]'));
      expect(avatars.map((a) => a?.dataset['person'])).toEqual(['p1', 'p2']);
      expect(avatars[0]?.style.backgroundColor).not.toBe(avatars[1]?.style.backgroundColor);
      expect(radios[0]?.querySelector('.sr-only')).toHaveTextContent('Dana');
      // Choosing one chooses that person, not the other of the same name.
      await user.click(radios[1]!);
      expect(radios[1]).toBeChecked();
      expect(radios[0]).not.toBeChecked();
      await user.click(radios[0]!);
      expect(radios[0]).toBeChecked();
    });

    it('reads in Hebrew, with the avatars in the same place', async () => {
      await initTestI18n('he');
      try {
        open([profile, { ...twin, name: 'יוסי' }]);
        const whose = screen.getByRole('radiogroup', { name: 'של מי ההוצאות וההכנסות האלה?' });
        const yossi = within(whose).getByRole('radio', { name: 'יוסי' });
        expect(yossi.querySelector('[data-person="p2"]')).not.toBeNull();
        await userEvent.setup().click(yossi);
        expect(yossi).toBeChecked();
      } finally {
        await initTestI18n('en');
      }
    });
  });

  it('files a sheet by its sector, asks about the rest with the sector as a hint, and leaves a cash withdrawal out', async () => {
    writeSession(undefined);
    reader.calls = [];
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          mc: [
            { m: 'Mystery Shop', mcc: '5999', cat: null },
            { m: 'משיכת מזומן', mcc: '6011', cat: null },
          ],
        },
      },
    ];
    const onSaved = vi.fn<(date: LocalDate) => void>();
    const user = userEvent.setup();
    renderWithProviders(
      <ImportSheet
        target={{ mode: 'import' }}
        onOpenChange={() => undefined}
        onOpenRow={() => undefined}
        onOpenCard={() => undefined}
        profiles={[profile]}
        categories={[
          category('cat.dining', 'expense'),
          category('cat.shopping', 'expense'),
          category('cat.currencyExchange', 'expense'),
          category('cat.otherExpense', 'expense'),
          category('cat.salary', 'income'),
        ]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={'2026-09-15' as LocalDate}
        onSaved={onSaved}
      />,
    );

    const csv = [
      'תאריך עסקה,שם בית העסק,סכום עסקה,ענף',
      '03/09/2026,Cafe Landwer,58.00,מסעדות',
      '04/09/2026,Mystery Shop,20.00,שונות',
      '05/09/2026,משיכת מזומן,500.00,',
    ].join('\n');
    await user.upload(screen.getByTestId('import-input'), new File([csv], 'max.csv', { type: 'text/csv' }));
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    await screen.findByRole('button', { name: 'Ready (2)' });
    // One call, for the two merchants nothing placed, each with its sector.
    expect(reader.calls).toHaveLength(1);
    const asked = reader.calls[0];
    expect(asked?.mode === 'map' && [asked.merchants, asked.sectors]).toEqual([
      ['Mystery Shop', 'משיכת מזומן'],
      ['שונות', ''],
    ]);
    expect(screen.getByRole('button', { name: 'Check this (1)' })).toBeInTheDocument();
    expect(
      screen.getByText('Cash withdrawal: not counted as an expense. You can record it in the Cash tab.'),
    ).toBeInTheDocument();
    const withdrawal = screen.getByRole('checkbox', { name: 'Add משיכת מזומן' });
    expect(withdrawal).not.toBeChecked();

    // The person can still keep it.
    await user.click(withdrawal);
    await user.click(screen.getByTestId('import-add'));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const names = ['Cafe Landwer', 'Mystery Shop', 'משיכת מזומן'];
    const saved = (await db.transactions.toArray()).filter((t) => names.includes(t.note ?? ''));
    expect(
      saved
        .map((t) => [t.note, t.categoryId, t.mcc, t.mccSource])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['Cafe Landwer', 'cat.dining', '5812', 'sector'],
      ['Mystery Shop', 'cat.shopping', '5999', 'ai'],
      ['משיכת מזומן', 'cat.currencyExchange', '6011', 'ai'],
    ]);
  });
});

describe('Smart import: a note about the files', () => {
  const sheet = () => (
    <ImportSheet
      target={{ mode: 'import' }}
      onOpenChange={() => undefined}
      onOpenRow={() => undefined}
      onOpenCard={() => undefined}
      profiles={[profile]}
      categories={[category('cat.groceries', 'expense')]}
      paymentMethods={[]}
      activeProfileId="p1"
      baseCurrency="ILS"
      today={'2026-09-15' as LocalDate}
      onSaved={() => undefined}
    />
  );
  const answer: ExtractOutcome = {
    ok: true,
    usage,
    result: { r: [wireRow({ d: '03/09/26', a: '120.50', m: 'Shufersal' })], t: [], per: null, done: true },
  };

  beforeAll(async () => {
    await initTestI18n('en');
  });
  beforeEach(() => {
    // A session outlives its sheet; each of these starts afresh.
    writeSession(undefined);
    reader.calls = [];
    reader.answers = [];
  });

  it('is asked for, optionally, next to the files', () => {
    renderWithProviders(sheet());
    const field = screen.getByRole('textbox', { name: 'Anything we should know about these files?' });
    expect(field).toHaveAttribute('maxlength', '300');
    expect(field).not.toBeRequired();
    expect(field).toHaveAttribute('placeholder', 'e.g. These are all my Max card transactions for September');
    expect(
      screen.getByText('Optional. It helps the reader; what the files show always comes first.'),
    ).toBeInTheDocument();
    // Before the file list and the Read button, so it reads as being about the files.
    const drop = screen.getByTestId('import-input');
    expect(drop.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      field.compareDocumentPosition(screen.getByRole('button', { name: 'Read' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is asked for in Hebrew too', async () => {
    await initTestI18n('he');
    try {
      renderWithProviders(sheet());
      const field = screen.getByRole('textbox', { name: 'משהו שכדאי לדעת על הקבצים?' });
      expect(field).toHaveAttribute('placeholder', 'למשל: כל העסקאות בכרטיס מקס שלי לחודש ספטמבר');
      expect(
        screen.getByText('לא חובה. זה עוזר לקריאה, אבל מה שמופיע בקבצים תמיד קובע.'),
      ).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });

  it('counts only once it is getting long', () => {
    renderWithProviders(sheet());
    const field = screen.getByRole('textbox', { name: 'Anything we should know about these files?' });
    fireEvent.change(field, { target: { value: 'x'.repeat(250) } });
    expect(screen.queryByText('250 of 300')).toBeNull();
    fireEvent.change(field, { target: { value: 'x'.repeat(251) } });
    expect(screen.getByText('251 of 300')).toBeInTheDocument();
  });

  it('travels with the read, trimmed', async () => {
    reader.answers = [answer, { ok: true, usage, result: { r: [] } }];
    const user = userEvent.setup();
    renderWithProviders(sheet());
    await user.type(
      screen.getByRole('textbox', { name: 'Anything we should know about these files?' }),
      '  All my Max card, September  ',
    );
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['03/09/26 Shufersal 120.50\n'], 'statement.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));
    await screen.findByTestId('import-add');
    expect(reader.calls.length).toBeGreaterThan(0);
    expect(reader.calls.every((c) => c.note === 'All my Max card, September')).toBe(true);
  });

  it('sends nothing about it when left empty', async () => {
    reader.answers = [answer];
    const user = userEvent.setup();
    renderWithProviders(sheet());
    await user.type(
      screen.getByRole('textbox', { name: 'Anything we should know about these files?' }),
      '   ',
    );
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['03/09/26 Shufersal 120.50\n'], 'statement.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));
    await screen.findByTestId('import-add');
    expect(reader.calls[0]).not.toHaveProperty('note');
  });
});

describe('Smart import: expenses, income or both', () => {
  const sheet = (onSaved: (date: LocalDate) => void = () => undefined) => (
    <ImportSheet
      target={{ mode: 'import' }}
      onOpenChange={() => undefined}
      onOpenRow={() => undefined}
      onOpenCard={() => undefined}
      profiles={[profile]}
      categories={[
        category('cat.groceries', 'expense'),
        category('cat.salary', 'income'),
        category('cat.refund', 'income'),
      ]}
      paymentMethods={[]}
      activeProfileId="p1"
      baseCurrency="ILS"
      today={'2026-09-15' as LocalDate}
      onSaved={onSaved}
    />
  );
  /** A statement with a purchase, a salary and money back on a purchase. */
  const mixed: ExtractOutcome = {
    ok: true,
    usage,
    result: {
      r: [
        wireRow({ d: '03/09/26', a: '120.50', m: 'Shufersal' }),
        wireRow({ d: '04/09/26', a: '9000.00', m: 'Salary', k: 'i' }),
        wireRow({ d: '05/09/26', a: '-50.00', m: 'Refund Zara' }),
      ],
      t: [],
      per: null,
      done: true,
    },
  };
  const text = '03/09/26 Shufersal 120.50\n04/09/26 Salary 9000.00\n05/09/26 Refund Zara -50.00\n';
  const readMixed = async (user: ReturnType<typeof userEvent.setup>, choose?: string) => {
    reader.answers = [mixed, { ok: true, usage, result: { r: [] } }];
    if (choose !== undefined) await user.click(screen.getByRole('radio', { name: choose }));
    await user.upload(
      screen.getByTestId('import-input'),
      new File([text], 'statement.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));
    await screen.findByTestId('import-add');
  };
  const rowNames = () =>
    screen
      .queryAllByRole('checkbox')
      .map((box) => box.getAttribute('aria-label'))
      .filter((name) => name?.startsWith('Add '));

  beforeAll(async () => {
    await initTestI18n('en');
  });
  beforeEach(async () => {
    writeSession(undefined);
    reader.calls = [];
    reader.answers = [];
    await db.transactions.clear();
  });

  it('asks before reading, next to whose it is, and starts on Expenses', () => {
    renderWithProviders(sheet());
    const choice = screen.getByRole('radiogroup', { name: 'What to import' });
    expect(
      within(choice)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Expenses', 'Income', 'Both']);
    expect(within(choice).getByRole('radio', { name: 'Expenses' })).toHaveAttribute('aria-checked', 'true');
    // Before the files, so it reads as a question about them.
    const drop = screen.getByTestId('import-input');
    expect(choice.compareDocumentPosition(drop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on Expenses keeps the purchase and the refund, and leaves the salary out, quietly, one tap away', async () => {
    const onSaved = vi.fn<(date: LocalDate) => void>();
    const user = userEvent.setup();
    renderWithProviders(sheet(onSaved));
    await readMixed(user);

    expect(screen.getByRole('button', { name: 'Ready (2)' })).toBeInTheDocument();
    expect(rowNames()).toEqual(['Add Shufersal', 'Add Refund Zara']);
    expect(screen.getByText('1 income left out')).toBeInTheDocument();
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 2');

    // Shown, it waits unticked, and counts toward nothing until ticked.
    const show = screen.getByRole('button', { name: 'Show' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await user.click(show);
    const salary = screen.getByRole('checkbox', { name: 'Add Salary' });
    expect(salary).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 2');
    // Select all is for the rows chosen, which are all ticked: a left-out one is only ticked by hand.
    expect(screen.getByRole('button', { name: 'Select none' })).toBeInTheDocument();
    await user.click(salary);
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 3');
    // Hidden again, it is out again.
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('checkbox', { name: 'Add Salary' })).toBeNull();
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 2');

    await user.click(screen.getByTestId('import-add'));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const saved = await db.transactions.toArray();
    expect(saved.map((t) => [t.note, t.kind, t.categoryId]).sort()).toEqual([
      ['Refund Zara', 'income', 'cat.refund'],
      ['Shufersal', 'expense', 'cat.groceries'],
    ]);
  });

  it('on Income adds only the income: expenses and refunds are left out', async () => {
    const onSaved = vi.fn<(date: LocalDate) => void>();
    const user = userEvent.setup();
    renderWithProviders(sheet(onSaved));
    await readMixed(user, 'Income');

    expect(rowNames()).toEqual(['Add Salary']);
    expect(screen.getByText('2 expenses left out')).toBeInTheDocument();
    await user.click(screen.getByTestId('import-add'));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect((await db.transactions.toArray()).map((t) => [t.note, t.kind])).toEqual([['Salary', 'income']]);
  });

  it('re-filters on the review at once, without reading the files again', async () => {
    const user = userEvent.setup();
    renderWithProviders(sheet());
    await readMixed(user);
    const calls = reader.calls.length;
    const choice = screen.getByRole('radiogroup', { name: 'What to import' });

    await user.click(within(choice).getByRole('radio', { name: 'Income' }));
    expect(rowNames()).toEqual(['Add Salary']);
    expect(screen.getByRole('checkbox', { name: 'Add Salary' })).toBeChecked();
    expect(screen.getByText('2 expenses left out')).toBeInTheDocument();
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 1');

    await user.click(within(choice).getByRole('radio', { name: 'Both' }));
    expect(rowNames()).toEqual(['Add Shufersal', 'Add Salary', 'Add Refund Zara']);
    expect(screen.queryByText(/left out/)).toBeNull();
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 3');
    expect(reader.calls).toHaveLength(calls);
  });

  it('keeps a row edited into the other kind in sight, ticked, among those left out', async () => {
    function Harness() {
      const [row, setRow] = useState<number | undefined>(undefined);
      return (
        <ImportSheet
          target={row === undefined ? { mode: 'import' } : { mode: 'import', row }}
          onOpenChange={() => undefined}
          onOpenRow={setRow}
          onOpenCard={() => undefined}
          profiles={[profile]}
          categories={[
            category('cat.groceries', 'expense'),
            category('cat.salary', 'income'),
            category('cat.refund', 'income'),
          ]}
          paymentMethods={[]}
          activeProfileId="p1"
          baseCurrency="ILS"
          today={'2026-09-15' as LocalDate}
          onSaved={() => undefined}
        />
      );
    }
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await readMixed(user);

    await user.click(screen.getByRole('button', { name: 'Edit Shufersal' }));
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('2 incomes left out')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Add Shufersal' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Add Salary' })).not.toBeChecked();
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 2');
  });

  it('with nothing of the chosen kind, says so and still offers what was left out', async () => {
    reader.answers = [
      {
        ok: true,
        usage,
        result: {
          r: [wireRow({ d: '03/09/26', a: '120.50', m: 'Shufersal' })],
          t: [],
          per: null,
          done: true,
        },
      },
      { ok: true, usage, result: { r: [] } },
    ];
    const user = userEvent.setup();
    renderWithProviders(sheet());
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    await user.upload(
      screen.getByTestId('import-input'),
      new File(['03/09/26 Shufersal 120.50\n'], 'statement.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

    await screen.findByText('No income in these files.');
    expect(screen.getByText('1 expense left out')).toBeInTheDocument();
    expect(screen.getByTestId('import-add')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Show' }));
    await user.click(screen.getByRole('checkbox', { name: 'Add Shufersal' }));
    expect(screen.getByTestId('import-add')).toHaveTextContent('Add 1');
  });

  it('speaks Hebrew, with its plural for two', async () => {
    await initTestI18n('he');
    try {
      reader.answers = [mixed, { ok: true, usage, result: { r: [] } }];
      const user = userEvent.setup();
      renderWithProviders(sheet());
      const choice = screen.getByRole('radiogroup', { name: 'מה לייבא?' });
      expect(
        within(choice)
          .getAllByRole('radio')
          .map((r) => r.textContent),
      ).toEqual(['הוצאות', 'הכנסות', 'הכל']);
      await user.click(within(choice).getByRole('radio', { name: 'הכנסות' }));
      await user.upload(
        screen.getByTestId('import-input'),
        new File([text], 'statement.txt', { type: 'text/plain' }),
      );
      await user.click(screen.getByRole('button', { name: 'קריאת קובץ אחד' }));
      await screen.findByText('שתי הוצאות לא נכללו');
      expect(screen.getByRole('button', { name: 'הצג' })).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });
});
