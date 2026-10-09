import { describe, expect, it } from 'vitest';

import type { WireContext, WireExtract, WireRequest, WireRow } from '@/domain/import-wire';
import { wireRow } from '@/domain/test-factories';
import type { PreparedFile } from '@/services/ai-import/prepare-files';
import type { ExtractOutcome } from '@/services/supabase/extract';
import type { LocalDate } from '@/types/money';

import { runImport, type FileState, type ImportContext } from './run-import';

const wire: WireContext = {
  today: '2026-10-04',
  base: 'ILS',
  lang: 'he',
  cats: [{ a: 'c1', n: 'מזון', k: 'e' }],
  pms: [],
};
const ctx: ImportContext = {
  wire,
  base: 'ILS',
  known: new Set(['ILS', 'USD']),
  today: '2026-10-04' as LocalDate,
  anchorOf: () => '2026-10-04' as LocalDate,
  history: (kind, m) =>
    Promise.resolve(m === 'שופרסל' && kind === 'expense' ? { categoryId: 'c.mine', mcc: '5411' } : {}),
};
const usage = { in: 100, out: 50, cacheRead: 0, cacheWrite: 0 };
const ok = (result: unknown): ExtractOutcome => ({ ok: true, result, usage });
const extract = (rows: WireRow[], over: Partial<WireExtract> = {}): ExtractOutcome =>
  ok({ r: rows, t: [], per: null, done: true, k: [], ba: [], pr: '', ...over });

/** A fake reader: answers each request with the next scripted answer for its kind. */
function reader(script: Record<string, ExtractOutcome[]>) {
  const calls: WireRequest[] = [];
  const call = (request: WireRequest): Promise<ExtractOutcome> => {
    calls.push(request);
    const key = request.mode === 'extract' ? `extract:${request.read}` : request.mode;
    const next = script[key]?.shift();
    return next === undefined ? Promise.reject(new Error(`unscripted ${key}`)) : Promise.resolve(next);
  };
  return { call, calls };
}

async function run(prepared: PreparedFile[], script: Record<string, ExtractOutcome[]>) {
  const { call, calls } = reader(script);
  const states: FileState[] = [];
  const result = await runImport(prepared, ctx, call, { onFile: (s) => states.push(s) });
  return { result, calls, states };
}

const textFile = (text: string, hash = 't'): PreparedFile => ({
  kind: 'text',
  file: 0,
  name: 'a.txt',
  hash,
  pages: [text],
  scanned: [],
});
const imageFile = (hash = 'i'): PreparedFile => ({
  kind: 'images',
  file: 0,
  name: 'shot.png',
  hash,
  images: [{ media: 'image/png', data: 'aGk=', patches: 1000, part: null, parts: 1 }],
});

describe('a text file', () => {
  const text = '03/10/26 שופרסל 120.50\n04/10/26 פז 245.00';

  it('is read once, and its rows are grounded in it', async () => {
    const { result, calls, states } = await run([textFile(text)], {
      'extract:primary': [
        extract([wireRow({ a: '120.50' }), wireRow({ d: '04/10/26', a: '245.00', m: 'פז' })]),
      ],
    });
    expect(calls.map((c) => c.mode)).toEqual(['extract']);
    expect(result.rows.map((r) => [r.amountMinor, r.flags])).toEqual([
      [12_050, []],
      [24_500, []],
    ]);
    expect(states.at(-1)).toMatchObject({ status: 'done', found: 2 });
    expect(result.usage).toEqual({ input: 100, output: 50 });
  });

  it('asks again only about an amount that is not in the text, and takes the answer if it is', async () => {
    const { result, calls } = await run([textFile(text)], {
      'extract:primary': [
        extract([wireRow({ a: '125.50' }), wireRow({ d: '04/10/26', a: '245.00', m: 'פז' })]),
      ],
      verify: [ok({ r: [{ ...wireRow({ a: '120.50' }), id: 'j0r0' }] })],
    });
    expect(calls.map((c) => c.mode)).toEqual(['extract', 'verify']);
    const verify = calls[1];
    expect(verify?.mode === 'verify' && verify.disputes.map((d) => d.id)).toEqual(['j0r0']);
    expect(result.rows[0]).toMatchObject({ amountMinor: 12_050, flags: [] });
  });

  it('keeps the flag when the second look is no better', async () => {
    const { result } = await run([textFile(text)], {
      'extract:primary': [extract([wireRow({ a: '125.50' })])],
      verify: [ok({ r: [{ ...wireRow({ a: '126.50' }), id: 'j0r0' }] })],
    });
    expect(result.rows[0]?.flags).toEqual(['amount_not_in_source']);
  });

  it('is read afresh when picked again, so a better reading reaches it', async () => {
    await run([textFile(text)], { 'extract:primary': [extract([wireRow({ a: '120.50' })])] });
    const again = await run([textFile(text)], { 'extract:primary': [extract([wireRow({ a: '120.50' })])] });
    expect(again.calls).toHaveLength(1);
    expect(again.result.rows.map((r) => r.amountMinor)).toEqual([12_050]);
  });

  it('carries on through a long document, and makes room when an answer is cut off', async () => {
    const { result, calls } = await run([textFile(text)], {
      'extract:primary': [
        { ok: false, error: 'partial', usage },
        extract([wireRow({ a: '120.50' })], { done: false }),
        extract([wireRow({ d: '04/10/26', a: '245.00', m: 'פז' })]),
      ],
    });
    const asked = calls.map((c) => (c.mode === 'extract' ? [c.maxTokens, c.continueAfter] : []));
    expect(asked[1]?.[0]).toBe((asked[0]?.[0] ?? 0) * 2);
    expect(asked[2]?.[1]).toBe(1);
    expect(result.rows).toHaveLength(2);
  });

  it('says why a file could not be read', async () => {
    const { result, states } = await run([textFile(text)], {
      'extract:primary': [{ ok: false, error: 'quota' }],
    });
    expect(result.rows).toEqual([]);
    expect(states).toContainEqual({ file: 0, name: 'a.txt', status: 'failed', error: 'quota' });
  });
});

describe('an image', () => {
  it('with no total to hold it to, is read a second time by the cheaper model, and the reads compared', async () => {
    const { result, calls } = await run([imageFile()], {
      'extract:primary': [extract([wireRow({ a: '12.00', m: 'קפה' }), wireRow({ a: '30.00', m: 'מונית' })])],
      'extract:check': [
        extract([
          wireRow({ a: '12.00', m: 'קפה' }),
          wireRow({ a: '30.00', m: 'מונית', d: '04/10/26', k: 'i' }),
        ]),
      ],
      verify: [ok({ r: [{ ...wireRow({ a: '30.00', m: 'מונית' }), id: 'j0r1' }] })],
    });
    expect(calls.map((c) => (c.mode === 'extract' ? c.read : c.mode))).toEqual([
      'primary',
      'check',
      'verify',
    ]);
    // The look agreed with the first read: settled.
    expect(result.rows.map((r) => [r.amountMinor, r.kind, r.flags])).toEqual([
      [1_200, 'expense', []],
      [3_000, 'expense', []],
    ]);
  });

  it('with a printed total, is held to it - and a correction is taken only when it makes the sums meet', async () => {
    const total = { l: 'סה"כ', a: '350.00', c: '₪', s: 0, p: null };
    const { result, calls } = await run([imageFile()], {
      'extract:primary': [
        extract([wireRow({ a: '100.00' }), wireRow({ a: '25.00', m: 'פז' })], { t: [total] }),
      ],
      verify: [ok({ r: [{ ...wireRow({ a: '250.00', m: 'פז' }), id: 'j0r1' }] })],
    });
    expect(calls.map((c) => (c.mode === 'extract' ? c.read : c.mode))).toEqual(['primary', 'verify']);
    expect(result.rows.map((r) => r.amountMinor)).toEqual([10_000, 25_000]);
    expect(result.reconciliations).toMatchObject([{ differenceMinor: 0 }]);
  });

  it('keeps the rows as read, flagged, when the correction does not add up either', async () => {
    const total = { l: 'סה"כ', a: '350.00', c: '₪', s: 0, p: null };
    const { result } = await run([imageFile()], {
      'extract:primary': [
        extract([wireRow({ a: '100.00' }), wireRow({ a: '25.00', m: 'פז' })], { t: [total] }),
      ],
      verify: [ok({ r: [{ ...wireRow({ a: '200.00', m: 'פז' }), id: 'j0r1' }] })],
    });
    expect(result.rows.map((r) => [r.amountMinor, r.flags])).toEqual([
      [10_000, []],
      [2_500, ['total_mismatch']],
    ]);
    expect(result.reconciliations[0]?.differenceMinor).toBe(22_500);
  });
});

describe('cards and bank accounts', () => {
  const listed = {
    k: [
      { s: 0, n: 'max executive', l4: '3200', nw: 'מאסטרקארד', is: 'MAX', cr: '5.9%', lim: '', bd: '' },
      { s: 0, n: 'Dream Card VIP', l4: '0400', nw: 'ויזה', is: 'MAX', cr: '14.65%', lim: '', bd: '' },
    ],
    pr: '4.75%',
  };

  it('in an image with no transactions are read twice, and the reads compared', async () => {
    const { result, calls, states } = await run([imageFile()], {
      'extract:primary': [extract([], listed)],
      'extract:check': [
        extract([], {
          ...listed,
          k: [
            { ...listed.k[0], cr: '5.9%' },
            { ...listed.k[1], cr: '14.56%' },
          ] as typeof listed.k,
        }),
      ],
    });
    expect(calls.map((c) => (c.mode === 'extract' ? c.read : c.mode))).toEqual(['primary', 'check']);
    expect(result.cards.map((c) => [c.label, c.lastDigits, c.credit, c.flags])).toEqual([
      ['max executive', '3200', { basis: 'prime', margin: '1.15' }, []],
      ['Dream Card VIP', '0400', { basis: 'prime', margin: '9.9' }, ['reads_disagree']],
    ]);
    // Something was found: not "nothing found".
    expect(states.at(-1)).toMatchObject({ status: 'done', found: 2 });
  });

  it('in a text are found in it, and a bank account with them', async () => {
    const text = 'max executive 3200 קרדיט 5.9%\nבנק הפועלים סניף 532 חשבון 123456';
    const { result } = await run([textFile(text)], {
      'extract:primary': [
        extract([], {
          k: [{ s: 0, n: 'max executive', l4: '3200', nw: '', is: '', cr: '5.9%', lim: '', bd: '' }],
          ba: [{ s: 0, n: 'בנק הפועלים', bk: '', br: '532', no: '123456', h: '' }],
        }),
      ],
    });
    expect(result.cards.map((c) => c.flags)).toEqual([[]]);
    expect(result.accounts.map((a) => [a.bank, a.branch, a.number, a.flags])).toEqual([
      ['12', '532', '123456', []],
    ]);
  });
});

describe('a spreadsheet', () => {
  const sheet = (rows: (string | number | null)[][]): PreparedFile => ({
    kind: 'sheet',
    file: 0,
    name: 'max.xlsx',
    hash: 's',
    sheets: [{ name: 'Sheet1', rows, date1904: false }],
  });

  it('is read by code, and the model is asked only for merchants the household has not filed', async () => {
    const { result, calls } = await run(
      [
        sheet([
          ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה'],
          ['03/10/2026', 'שופרסל', '120.50'],
          ['04/10/2026', 'בית קפה חדש', '18.00'],
        ]),
      ],
      {
        map: [
          ok({
            hr: 0,
            date: 0,
            desc: 1,
            amt: 2,
            debit: null,
            credit: null,
            cur: null,
            chg: null,
            chgCur: null,
            chgDate: null,
            plan: null,
            dec: '.',
            df: 'dmy',
            mc: [{ m: 'בית קפה חדש', cat: 'c1' }],
          }),
        ],
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.mode === 'map' && calls[0].merchants).toEqual(['בית קפה חדש']);
    expect(result.rows.map((r) => [r.amountMinor, r.categoryAlias])).toEqual([
      [12_050, null],
      [1_800, 'c1'],
    ]);
  });

  it("keeps the merchants' categories when the answer's columns do not hold, and tries a failed call twice", async () => {
    const rows = [
      ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה'],
      ['04/10/2026', 'בית קפה חדש', '18.00'],
    ];
    // Only categories came back: the dictionary already knows the columns.
    const onlyCats = await run([sheet(rows)], { map: [ok({ mc: [{ m: 'בית קפה חדש', cat: 'c1' }] })] });
    expect(onlyCats.result.rows.map((r) => r.categoryAlias)).toEqual(['c1']);

    const failed: ExtractOutcome = { ok: false, error: 'upstream' };
    const retried = await run([sheet(rows)], {
      map: [failed, ok({ mc: [{ m: 'בית קפה חדש', cat: 'c1' }] })],
    });
    expect(retried.calls).toHaveLength(2);
    expect(retried.result.rows.map((r) => r.categoryAlias)).toEqual(['c1']);

    // Twice failed, or out of quota: the rows still come, for the person to file.
    const twice = await run([sheet(rows)], { map: [failed, failed] });
    expect(twice.result.rows.map((r) => [r.amountMinor, r.categoryAlias])).toEqual([[1_800, null]]);
    const quota = await run([sheet(rows)], { map: [{ ok: false, error: 'quota' }] });
    expect(quota.calls).toHaveLength(1);
    expect(quota.result.rows).toHaveLength(1);
  });

  it('asks which column is which only when the headers are unknown', async () => {
    const { result, calls } = await run(
      [
        sheet([
          ['when', 'what', 'how much'],
          ['03/10/2026', 'שופרסל', 120.5],
        ]),
      ],
      {
        map: [
          ok({
            hr: 0,
            date: 0,
            desc: 1,
            amt: 2,
            debit: null,
            credit: null,
            cur: null,
            chg: null,
            chgCur: null,
            chgDate: null,
            plan: null,
            dec: '.',
            df: 'dmy',
            mc: [],
          }),
        ],
      },
    );
    expect(calls).toHaveLength(1);
    expect(result.rows.map((r) => r.amountMinor)).toEqual([12_050]);
  });

  it('gives up on a sheet no map reads', async () => {
    const { states } = await run(
      [
        sheet([
          ['when', 'what'],
          ['x', 'y'],
        ]),
      ],
      { map: [ok({ nonsense: true })] },
    );
    expect(states).toContainEqual({ file: 0, name: 'max.xlsx', status: 'failed', error: 'upstream' });
  });
});

describe('a spreadsheet’s business types', () => {
  const sheet = (rows: (string | number | null)[][]): PreparedFile => ({
    kind: 'sheet',
    file: 0,
    name: 'max.xlsx',
    hash: 's',
    sheets: [{ name: 'Sheet1', rows, date1904: false }],
  });
  const header = ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'MCC', 'ענף'];

  it('asks only about expenses with no business type from the file, the sector or history - sending the sector as a hint', async () => {
    const { result, calls } = await run(
      [
        sheet([
          header,
          ['01/10/2026', 'Vet clinic', '100.00', '0742', null],
          ['02/10/2026', 'Cafe Landwer', '58.00', null, 'מסעדות'],
          ['03/10/2026', 'שופרסל', '120.50', null, null],
          ['04/10/2026', 'Mystery Shop', '20.00', null, 'שונות'],
          ['05/10/2026', 'Plain Shop', '30.00', null, null],
        ]),
      ],
      {
        map: [
          ok({
            mc: [
              { m: 'Mystery Shop', mcc: '5999', cat: null },
              { m: 'Plain Shop', mcc: '9999', cat: 'c1' },
            ],
          }),
        ],
      },
    );
    const asked = calls[0];
    expect(asked?.mode === 'map' && asked.merchants).toEqual(['Mystery Shop', 'Plain Shop']);
    expect(asked?.mode === 'map' && asked.sectors).toEqual(['שונות', '']);
    expect(result.rows.map((r) => [r.description, r.fileMcc, r.sector, r.aiMcc, r.categoryAlias])).toEqual([
      ['Vet clinic', '0742', undefined, undefined, null],
      ['Cafe Landwer', undefined, 'מסעדות', undefined, null],
      ['שופרסל', undefined, undefined, undefined, null],
      ['Mystery Shop', undefined, 'שונות', '5999', null],
      // A code the list does not have is dropped; its category answer is kept.
      ['Plain Shop', undefined, undefined, undefined, 'c1'],
    ]);
  });

  it('asks about income only when history does not place it, and never gives it a business type', async () => {
    const { result, calls } = await run(
      [
        sheet([
          ['תאריך', 'תיאור', 'חובה', 'זכות'],
          ['01/10/2026', 'Employer Ltd', null, '9000.00'],
        ]),
      ],
      { map: [ok({ mc: [{ m: 'Employer Ltd', mcc: '5812', cat: null }] })] },
    );
    expect(calls.map((c) => c.mode)).toEqual(['map']);
    expect(result.rows[0]).toMatchObject({ kind: 'income' });
    expect(result.rows[0]).not.toHaveProperty('aiMcc');
    // Sent no sectors at all: none was printed.
    expect(calls[0]?.mode === 'map' && calls[0]).not.toHaveProperty('sectors');
  });

  it('still asks about a merchant whose code the table only lets fall through to Other (final review C1)', async () => {
    const { result, calls } = await run(
      [
        sheet([
          header,
          // 9311 (tax payments) names no range: Claude's own category is still wanted.
          ['01/10/2026', 'ארנונה עיריית דוגמה', '900.00', '9311', null],
          // 5812 files under Dining: nothing to ask.
          ['02/10/2026', 'Cafe Landwer', '58.00', '5812', null],
          // A broad sector gives no code either, and travels as the hint.
          ['03/10/2026', 'FOODDASH DELIVERY', '72.00', null, 'מזון וצריכה'],
        ]),
      ],
      {
        map: [
          ok({
            mc: [
              { m: 'ארנונה עיריית דוגמה', mcc: '9311', cat: 'c1' },
              { m: 'FOODDASH DELIVERY', mcc: '5814', cat: null },
            ],
          }),
        ],
      },
    );
    const asked = calls[0];
    expect(asked?.mode === 'map' && asked.merchants).toEqual(['ארנונה עיריית דוגמה', 'FOODDASH DELIVERY']);
    expect(asked?.mode === 'map' && asked.sectors).toEqual(['', 'מזון וצריכה']);
    expect(result.rows.map((r) => [r.description, r.fileMcc, r.sector, r.aiMcc, r.categoryAlias])).toEqual([
      ['ארנונה עיריית דוגמה', '9311', undefined, '9311', 'c1'],
      ['Cafe Landwer', '5812', undefined, undefined, null],
      ['FOODDASH DELIVERY', undefined, 'מזון וצריכה', '5814', null],
    ]);
  });

  it('reads the MCC and sector columns of a sheet the model mapped, too (the model’s map gets the rows)', async () => {
    const { result, calls } = await run(
      [
        sheet([
          ['when', 'what', 'how much', 'MCC', 'ענף'],
          ['03/10/2026', 'Vet clinic', '100.00', '0742', null],
          ['04/10/2026', 'Cafe Landwer', '58.00', null, 'מסעדות'],
        ]),
      ],
      {
        map: [
          ok({
            hr: 0,
            date: 0,
            desc: 1,
            amt: 2,
            debit: null,
            credit: null,
            cur: null,
            chg: null,
            chgCur: null,
            chgDate: null,
            plan: null,
            dec: '.',
            df: 'dmy',
            mc: [],
          }),
        ],
      },
    );
    // One call, for the columns: both merchants were placed by the file's own columns.
    expect(calls).toHaveLength(1);
    expect(result.rows.map((r) => [r.description, r.fileMcc, r.sector])).toEqual([
      ['Vet clinic', '0742', undefined],
      ['Cafe Landwer', undefined, 'מסעדות'],
    ]);
  });
});

describe('a Max export', () => {
  // Max's header row as printed, under three title rows. Merchants and amounts are made up.
  const MAX_HEADER = [
    'תאריך עסקה',
    'שם בית העסק',
    'קטגוריה',
    '4 ספרות אחרונות של כרטיס האשראי',
    'סוג עסקה',
    'סכום חיוב',
    'מטבע חיוב',
    'סכום עסקה מקורי',
    'מטבע עסקה מקורי',
    'תאריך חיוב',
    'הערות',
    'תיוגים',
    'מועדון הנחות',
    'מפתח דיסקונט',
    'אופן ביצוע ההעסקה',
    'שער המרה ממטבע מקור/התחשבנות לש"ח',
  ];
  const TITLES = [['כל המשתמשים (1)'], ['כל הכרטיסים (5)'], ['10/2026']];
  const maxRow = (date: string, merchant: string, sector: string, amount: string): (string | null)[] => [
    date,
    merchant,
    sector,
    '1234',
    'רגילה',
    amount,
    'ILS',
    amount,
    'ILS',
    '10/10/2026',
    null,
    null,
    null,
    null,
    'אינטרנט',
    null,
  ];
  const workbook = (): PreparedFile => ({
    kind: 'sheet',
    file: 0,
    name: 'transaction-details_export.xlsx',
    hash: 'max',
    sheets: [
      {
        name: 'עסקאות במועד החיוב',
        date1904: false,
        rows: [
          ...TITLES,
          MAX_HEADER,
          maxRow('02/10/2026', 'FOODDASH DELIVERY', 'מזון וצריכה', '72.00'),
          maxRow('03/10/2026', 'חשמל לעיר בע"מ', 'דלק, חשמל וגז', '410.50'),
          maxRow('04/10/2026', 'מסעדת הפינה', 'מסעדות, קפה וברים', '186.00'),
          maxRow('05/10/2026', 'עיריית דוגמה - ארנונה', 'עירייה וממשלה', '350.00'),
        ],
      },
      {
        name: 'עסקאות בחיוב מיידי',
        date1904: false,
        rows: [
          ...TITLES,
          MAX_HEADER,
          maxRow('06/10/2026', 'סלולר פלוס', 'שירותי תקשורת', '59.90'),
          maxRow('07/10/2026', 'שופרסל', 'מזון וצריכה', '120.50'),
          maxRow('08/10/2026', 'מכון כושר הרים', 'פנאי, בידור וספורט', '199.00'),
        ],
      },
    ],
  });

  it('reads every sheet by the dictionary, and leaves the broad sectors to Claude as hints (final review C2)', async () => {
    const { result, calls, states } = await run([workbook()], {
      map: [
        ok({
          mc: [
            { m: 'FOODDASH DELIVERY', mcc: '5814', cat: null },
            { m: 'חשמל לעיר בע"מ', mcc: '4900', cat: null },
            { m: 'עיריית דוגמה - ארנונה', mcc: '9311', cat: 'c1' },
          ],
        }),
        ok({ mc: [{ m: 'מכון כושר הרים', mcc: '7997', cat: null }] }),
      ],
    });
    expect(states.at(-1)).toMatchObject({ file: 0, status: 'done' });
    // One call per sheet, for the merchants nothing places: a specific sector or history places the rest.
    expect(calls.map((c) => c.mode)).toEqual(['map', 'map']);
    expect(calls[0]?.mode === 'map' && calls[0].merchants).toEqual([
      'FOODDASH DELIVERY',
      'חשמל לעיר בע"מ',
      'עיריית דוגמה - ארנונה',
    ]);
    expect(calls[0]?.mode === 'map' && calls[0].sectors).toEqual([
      'מזון וצריכה',
      'דלק, חשמל וגז',
      'עירייה וממשלה',
    ]);
    expect(calls[1]?.mode === 'map' && calls[1].merchants).toEqual(['מכון כושר הרים']);
    expect(calls[1]?.mode === 'map' && calls[1].sectors).toEqual(['פנאי, בידור וספורט']);
    expect(
      result.rows.map((r) => [r.description, r.amountMinor, r.sector, r.aiMcc, r.categoryAlias]),
    ).toEqual([
      ['FOODDASH DELIVERY', 7_200, 'מזון וצריכה', '5814', null],
      ['חשמל לעיר בע"מ', 41_050, 'דלק, חשמל וגז', '4900', null],
      ['מסעדת הפינה', 18_600, 'מסעדות, קפה וברים', undefined, null],
      ['עיריית דוגמה - ארנונה', 35_000, 'עירייה וממשלה', '9311', 'c1'],
      ['סלולר פלוס', 5_990, 'שירותי תקשורת', undefined, null],
      ['שופרסל', 12_050, 'מזון וצריכה', undefined, null],
      ['מכון כושר הרים', 19_900, 'פנאי, בידור וספורט', '7997', null],
    ]);
    expect(result.rows.every((r) => r.kind === 'expense' && r.fileMcc === undefined)).toBe(true);
  });
});

describe('an export the app knows by its headers', () => {
  it('reads Max exactly - the payment, one plan per deal - and leaves a sheet it does not know to the dictionary', async () => {
    const header = [
      'תאריך עסקה',
      'שם בית העסק',
      'קטגוריה',
      '4 ספרות אחרונות של כרטיס האשראי',
      'סוג עסקה',
      'סכום חיוב',
      'מטבע חיוב',
      'סכום עסקה מקורי',
      'מטבע עסקה מקורי',
      'תאריך חיוב',
      'הערות',
    ];
    // Invented: a deal of 600 in three payments of 200.
    const pay = (n: number, charge: string) => [
      '14-08-2026',
      'חנות דמה',
      'ריהוט',
      '0400',
      'תשלומים',
      200,
      '₪',
      600,
      '₪',
      charge,
      `תשלום ${String(n)} מתוך 3`,
    ];
    const workbook: PreparedFile = {
      kind: 'sheet',
      file: 0,
      name: 'transaction-details_export.xlsx',
      hash: 'max',
      sheets: [
        {
          name: 'עסקאות במועד החיוב',
          date1904: false,
          rows: [header, pay(1, '02-09-2026'), pay(2, '02-10-2026')],
        },
        {
          name: 'Sheet2',
          date1904: false,
          rows: [
            ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה'],
            ['03/10/2026', 'שופרסל', '120.50'],
          ],
        },
      ],
    };
    const { result, calls } = await run([workbook], {});
    // No call: no columns to name, and the sector and the household's history place both merchants.
    expect(calls).toEqual([]);
    expect(
      result.rows.map((r) => [r.description, r.amountMinor, r.plan?.totalMinor ?? null, r.flags]),
    ).toEqual([
      // Equal payments on one date: noted as seen twice, as any repeat in a document is.
      ['חנות דמה', 20_000, 60_000, ['twice_in_document']],
      ['חנות דמה', 20_000, 60_000, ['plan_in_import', 'twice_in_document']],
      ['שופרסל', 12_050, null, []],
    ]);
  });

  it('gives nothing for a summary of monthly totals, and asks nothing', async () => {
    const summary: PreparedFile = {
      kind: 'sheet',
      file: 0,
      name: 'summary.xlsx',
      hash: 'sum',
      sheets: [
        {
          name: 'כרטיסי אשראי',
          date1904: false,
          rows: [
            ['חודש חיוב', 'מספר עסקאות', 'סכום החיוב בש"ח'],
            ['112025', '12 עסקאות', 1000],
          ],
        },
      ],
    };
    const { result, calls, states } = await run([summary], {});
    expect(calls).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(states.at(-1)).toMatchObject({ status: 'empty' });
  });
});

describe('files it refuses', () => {
  it('reports them and reads the rest', async () => {
    const { states } = await run([{ kind: 'refused', file: 0, name: 'a.zip', reason: 'unsupported' }], {});
    expect(states).toEqual([{ file: 0, name: 'a.zip', status: 'refused', reason: 'unsupported' }]);
  });
});

describe('the person’s note about the files', () => {
  const NOTE = 'These are all my Max card transactions for September';
  const noted: ImportContext = { ...ctx, note: NOTE };
  async function runNoted(prepared: PreparedFile[], script: Record<string, ExtractOutcome[]>) {
    const { call, calls } = reader(script);
    await runImport(prepared, noted, call, { onFile: () => undefined });
    return calls;
  }

  it('goes with an image’s reads, both of them, and every continuation', async () => {
    const calls = await runNoted([imageFile()], {
      'extract:primary': [extract([wireRow({ a: '120.50' })], { done: false }), extract([])],
      'extract:check': [extract([wireRow({ a: '120.50' })])],
    });
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.every((c) => c.note === NOTE)).toBe(true);
  });

  it('goes with a text file’s read and the correction that follows it', async () => {
    const calls = await runNoted([textFile('03/10/26 שופרסל 120.50')], {
      'extract:primary': [extract([wireRow({ a: '125.50' })])],
      verify: [ok({ r: [{ ...wireRow({ a: '120.50' }), id: 'j0r0' }] })],
    });
    expect(calls.map((c) => c.mode)).toEqual(['extract', 'verify']);
    expect(calls.every((c) => c.note === NOTE)).toBe(true);
  });

  it('goes with a spreadsheet’s column map and its merchants’ categories', async () => {
    const sheet: PreparedFile = {
      kind: 'sheet',
      file: 0,
      name: 'strange.xlsx',
      hash: 's',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['x', 'y', 'z'],
            ['03/10/2026', 'בית קפה חדש', '18.00'],
          ],
          date1904: false,
        },
      ],
    };
    const map = {
      hr: 0,
      date: 0,
      desc: 1,
      amt: 2,
      debit: null,
      credit: null,
      cur: null,
      chg: null,
      chgCur: null,
      chgDate: null,
      plan: null,
      dec: '.',
      df: 'dmy',
    };
    const calls = await runNoted([sheet], {
      map: [ok(map), ok({ mc: [{ i: 0, m: 'בית קפה חדש', cat: 'c1' }] })],
    });
    expect(calls.map((c) => c.mode)).toEqual(['map', 'map']);
    expect(calls.every((c) => c.note === NOTE)).toBe(true);
  });

  it('is left out of every request when there is none, or it is blank', async () => {
    for (const over of [{}, { note: '  ' }]) {
      const { call, calls } = reader({ 'extract:primary': [extract([wireRow({ a: '120.50' })])] });
      await runImport([textFile('03/10/26 שופרסל 120.50')], { ...ctx, ...over }, call, {
        onFile: () => undefined,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]).not.toHaveProperty('note');
    }
  });
});
