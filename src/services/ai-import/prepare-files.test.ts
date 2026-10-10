import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { groupSmall } from '@/domain/import-images';

import {
  decodeText,
  kindOf,
  planJobs,
  prepareFiles,
  toBase64,
  usableText,
  type ImageOps,
  type PreparedFile,
} from './prepare-files';

/** Image work without a browser: any blob is a 1080×H image, rendering returns a small PNG. */
const fakeOps = (height = 1920): ImageOps => ({
  decode: (blob) => Promise.resolve(blob.size === 0 ? undefined : { width: 1080, height, source: blob }),
  render: (_source, crop, size) =>
    Promise.resolve(new Blob([new Uint8Array(size.width + crop.y)], { type: 'image/png' })),
});

const file = (name: string, type: string, bytes: number | Uint8Array = 10) =>
  new File([typeof bytes === 'number' ? new Uint8Array(bytes) : new Uint8Array(bytes)], name, { type });

describe('what kind of file it is', () => {
  it('goes by type and by name', () => {
    expect(kindOf({ name: 'shot.PNG', type: '' })).toBe('image');
    expect(kindOf({ name: 'x', type: 'image/webp' })).toBe('image');
    expect(kindOf({ name: 'statement.pdf', type: '' })).toBe('pdf');
    expect(kindOf({ name: 'max.xlsx', type: '' })).toBe('sheet');
    expect(kindOf({ name: 'old.xls', type: '' })).toBe('sheet');
    expect(kindOf({ name: 'bank.csv', type: '' })).toBe('csv');
    expect(kindOf({ name: 'note.docx', type: '' })).toBe('docx');
    expect(kindOf({ name: 'old.doc', type: '' })).toBe('word97');
    expect(kindOf({ name: 'a.txt', type: '' })).toBe('text');
    expect(kindOf({ name: 'a.zip', type: 'application/zip' })).toBeUndefined();
  });
});

describe('text without a declared encoding', () => {
  it('is UTF-8 when it is valid UTF-8, BOM and all', () => {
    expect(decodeText(new TextEncoder().encode('﻿שלום'))).toBe('שלום');
  });

  it('is Windows-1255 otherwise - older Israeli bank exports', () => {
    // "שלום" in Windows-1255.
    expect(decodeText(new Uint8Array([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום');
  });
});

describe('a text layer', () => {
  it('is worth reading when it has numbers and is more than a few glyphs', () => {
    expect(usableText('03/10/26 שופרסל דיל 120.50')).toBe(true);
    expect(usableText('scan')).toBe(false);
    expect(usableText('no numbers here at all, just words')).toBe(false);
  });
});

describe('preparing files', () => {
  it('refuses what it cannot read, each with its reason, without holding up the rest', async () => {
    const prepared = await prepareFiles(
      [
        file('a.zip', 'application/zip'),
        file('old.doc', 'application/msword'),
        file('huge.png', 'image/png', 16 * 1024 * 1024),
        file('blank.png', 'image/png', 0),
        file('ok.txt', 'text/plain', new TextEncoder().encode('03/10 קפה 12.00')),
      ],
      fakeOps(),
    );
    expect(prepared.map((p) => (p.kind === 'refused' ? p.reason : p.kind))).toEqual([
      'unsupported',
      'word97',
      'too_large',
      'unreadable',
      'text',
    ]);
  });

  it('takes ten files at a time', async () => {
    const files = Array.from({ length: 11 }, (_, i) => file(`${String(i)}.txt`, 'text/plain'));
    const prepared = await prepareFiles(files, fakeOps());
    expect(prepared.at(-1)).toMatchObject({ kind: 'refused', reason: 'over_limit' });
  });

  it('sends a screenshot that fits as it is, and slices a long one', async () => {
    const [fits] = await prepareFiles([file('shot.png', 'image/png', 50)], fakeOps(1920));
    expect(fits).toMatchObject({ kind: 'images', images: [{ media: 'image/png', part: null, parts: 1 }] });
    if (fits?.kind === 'images') expect(fits.images[0]?.data).toBe(toBase64(new Uint8Array(50)));

    const [long] = await prepareFiles([file('scroll.png', 'image/png', 50)], fakeOps(7000));
    expect(long?.kind === 'images' && long.images.map((i) => [i.part, i.parts])).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('fingerprints each file, so the same one is recognised', async () => {
    const [a, b] = await prepareFiles(
      [file('a.txt', 'text/plain', 5), file('b.txt', 'text/plain', 5)],
      fakeOps(),
    );
    expect(a?.kind === 'text' && b?.kind === 'text' && a.hash === b.hash).toBe(true);
  });
});

describe('planning the calls', () => {
  const image = (fileIndex: number, hash: string, parts = 1): PreparedFile => ({
    kind: 'images',
    file: fileIndex,
    name: `shot${String(fileIndex)}.png`,
    hash,
    images: Array.from({ length: parts }, (_, i) => ({
      media: 'image/png' as const,
      data: 'aGk=',
      patches: 2000,
      part: parts === 1 ? null : i + 1,
      parts,
    })),
  });

  it('groups small images, sends a duplicate once, and keeps a long capture’s slices together', () => {
    const jobs = planJobs([image(0, 'a'), image(1, 'a'), image(2, 'b'), image(3, 'c', 3)], groupSmall);
    expect(jobs.map((j) => j.origin.map((o) => `${String(o.file)}:${String(o.part)}`))).toEqual([
      ['3:1', '3:2', '3:3'],
      ['0:null', '2:null'],
    ]);
    expect(jobs.every((j) => j.visual)).toBe(true);
  });

  it('reads text a few pages a call, grounded in its own text, and scans a page at a time', () => {
    const pdf: PreparedFile = {
      kind: 'text',
      file: 0,
      name: 'max.pdf',
      hash: 'p',
      pages: ['p1 10.00', 'p2 20.00', '', 'p4 40.00', 'p5 50.00', 'p6 60.00'],
      scanned: [{ page: 3, data: 'aGk=' }],
    };
    const jobs = planJobs([pdf], groupSmall);
    expect(jobs.map((j) => [j.sources.map((s) => s.label), j.visual])).toEqual([
      [['max.pdf, page 1', 'max.pdf, page 2', 'max.pdf, page 4', 'max.pdf, page 5'], false],
      [['max.pdf, page 6'], false],
      [['max.pdf, page 3'], true],
    ]);
    expect(jobs[0]?.texts[0]).toBe('p1 10.00');
    expect(jobs[2]?.sources[0]?.kind).toBe('pdf');
  });

  it('leaves spreadsheets and refusals to their own paths', () => {
    const sheet: PreparedFile = { kind: 'sheet', file: 0, name: 'x.xlsx', hash: 's', sheets: [] };
    const refused: PreparedFile = { kind: 'refused', file: 1, name: 'x.zip', reason: 'unsupported' };
    expect(planJobs([sheet, refused], groupSmall)).toEqual([]);
  });
});

/** An invented workbook, written by SheetJS as an exporter would: values, and number formats on some cells. */
function workbook(
  sheets: Record<string, { rows: unknown[][]; formats?: Record<string, string> }>,
): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const [name, { rows, formats = {} }] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    for (const [address, format] of Object.entries(formats)) {
      const cell = sheet[address] as { z?: string } | undefined;
      if (cell !== undefined) cell.z = format;
    }
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('preparing a spreadsheet', () => {
  it('keeps each number’s format beside the rows, blank rows dropped as before, a date serial still a number', async () => {
    const bytes = workbook({
      'כרטיסי אשראי': {
        rows: [
          ['כרטיסי אשראי'],
          [],
          ['כרטיס', 'סכום העסקה', 'תאריך', 'סכום החיוב'],
          ['ויזה 9876', 30, 46_000, 105.5],
          [],
          ['ויזה 9876', 12, 46_001, 12],
        ],
        formats: { B4: '"$"#,##0.00', C4: 'dd/mm/yyyy', D4: '"₪"#,##0.00', B6: '"₪"#,##0.00' },
      },
    });
    const [prepared] = await prepareFiles([file('demo.xlsx', '', bytes)], fakeOps());
    expect(prepared?.kind).toBe('sheet');
    if (prepared?.kind !== 'sheet') return;
    const [sheet] = prepared.sheets;
    expect(sheet?.rows).toEqual([
      ['כרטיסי אשראי', null, null, null],
      ['כרטיס', 'סכום העסקה', 'תאריך', 'סכום החיוב'],
      ['ויזה 9876', 30, 46_000, 105.5],
      ['ויזה 9876', 12, 46_001, 12],
    ]);
    expect(sheet?.formats).toEqual([
      [null, null, null, null],
      [null, null, null, null],
      [null, '"$"#,##0.00', 'dd/mm/yyyy', '"₪"#,##0.00'],
      [null, '"₪"#,##0.00', null, null],
    ]);
  });

  it('adds no formats to a sheet whose numbers have none', async () => {
    const bytes = workbook({
      a: {
        rows: [
          ['תאריך', 'סכום'],
          ['01/10/2026', 5],
        ],
      },
    });
    const [prepared] = await prepareFiles([file('plain.xlsx', '', bytes)], fakeOps());
    expect(prepared?.kind === 'sheet' && prepared.sheets[0]?.formats).toBeUndefined();
  });

  it('refuses a summary of monthly totals, so no month is counted twice', async () => {
    const bytes = workbook({
      'כרטיסי אשראי': {
        rows: [
          ['כרטיסי אשראי'],
          ['ריכוז חיובים קודמים'],
          ['חודש חיוב', 'מספר עסקאות', 'סכום החיוב בש"ח', 'סכום החיוב בדולר', 'סכום החיוב באירו'],
          ['112025', '12 עסקאות', 1000, 0, 0],
        ],
      },
    });
    const [prepared] = await prepareFiles([file('summary.xlsx', '', bytes)], fakeOps());
    expect(prepared).toMatchObject({ kind: 'refused', reason: 'totals_only' });
  });
});
