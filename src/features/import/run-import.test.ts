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
  knownMerchant: (m) => Promise.resolve(m === 'שופרסל'),
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
      { s: 0, n: 'max executive', l4: '3214', nw: 'מאסטרקארד', is: 'MAX', cr: '5.9%', lim: '', bd: '' },
      { s: 0, n: 'Dream Card VIP', l4: '0427', nw: 'ויזה', is: 'MAX', cr: '14.65%', lim: '', bd: '' },
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
      ['max executive', '3214', { basis: 'prime', margin: '1.15' }, []],
      ['Dream Card VIP', '0427', { basis: 'prime', margin: '9.9' }, ['reads_disagree']],
    ]);
    // Something was found: not "nothing found".
    expect(states.at(-1)).toMatchObject({ status: 'done', found: 2 });
  });

  it('in a text are found in it, and a bank account with them', async () => {
    const text = 'max executive 3214 קרדיט 5.9%\nבנק הפועלים סניף 532 חשבון 123456';
    const { result } = await run([textFile(text)], {
      'extract:primary': [
        extract([], {
          k: [{ s: 0, n: 'max executive', l4: '3214', nw: '', is: '', cr: '5.9%', lim: '', bd: '' }],
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

describe('files it refuses', () => {
  it('reports them and reads the rest', async () => {
    const { states } = await run([{ kind: 'refused', file: 0, name: 'a.zip', reason: 'unsupported' }], {});
    expect(states).toEqual([{ file: 0, name: 'a.zip', status: 'refused', reason: 'unsupported' }]);
  });
});
