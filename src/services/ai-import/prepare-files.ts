import { computeTiles, fitSize, patches } from '@/domain/import-images';
import type { Cell } from '@/domain/import-sheet-map';
import { totalsOnly } from '@/domain/import-sheet-readers';
import { IMAGE_MEDIA, type ImageMedia, type WireSource } from '@/domain/import-wire';
import { sha256Hex } from '@/services/crypto/digest';

/**
 * A picked or shared file, made ready to be read - on the device, before
 * anything is sent:
 *  - a screenshot or photo: as it is when it fits what the model reads, scaled
 *    down when it does not, sliced when it is a long scrolling capture;
 *  - a PDF with a text layer: its text, page by page - far cheaper than the
 *    pages as images, and checkable, since the amounts must be in that text; a
 *    page without one is sent as a one-page PDF;
 *  - a spreadsheet: its rows, read here by code (`import-sheet-map`);
 *  - a Word document or a text file: its text.
 * Anything else is refused, with the reason, without holding up the rest.
 */

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 100;
/** Text-layer pages read in one call. */
const PAGES_PER_JOB = 4;

export type RefuseReason =
  | 'over_limit'
  | 'too_large'
  | 'pdf_password'
  | 'pdf_pages'
  | 'unreadable'
  | 'word97'
  | 'unsupported'
  /** A summary of monthly totals, not transactions: read as rows it would count every month twice. */
  | 'totals_only';

/** One image ready to send, and what it costs. */
export type PreparedImage = {
  readonly media: ImageMedia;
  readonly data: string;
  readonly patches: number;
  /** Its slice, when a tall image was cut: 1 of n. */
  readonly part: number | null;
  readonly parts: number;
};

export type PreparedFile =
  | {
      readonly kind: 'images';
      readonly file: number;
      readonly name: string;
      readonly hash: string;
      readonly images: readonly PreparedImage[];
    }
  | {
      readonly kind: 'text';
      readonly file: number;
      readonly name: string;
      readonly hash: string;
      /** Pages, or one block for a document without them. */
      readonly pages: readonly string[];
      /** Pages with no usable text layer, as one-page PDFs (base64). */
      readonly scanned: readonly { readonly page: number; readonly data: string }[];
    }
  | {
      readonly kind: 'sheet';
      readonly file: number;
      readonly name: string;
      readonly hash: string;
      readonly sheets: readonly {
        readonly name: string;
        readonly rows: Cell[][];
        /**
         * Each numeric cell's number format, beside `rows`, where any cell has
         * one: a currency some exports print only there ("$"#,##0.00).
         */
        readonly formats?: (string | null)[][];
        readonly date1904: boolean;
      }[];
    }
  | { readonly kind: 'refused'; readonly file: number; readonly name: string; readonly reason: RefuseReason };

/** The image work a browser does - decoding, cropping, scaling, encoding - injected so the rest can be tested. */
export type ImageOps = {
  readonly decode: (
    blob: Blob,
  ) => Promise<{ readonly width: number; readonly height: number; readonly source: unknown } | undefined>;
  readonly render: (
    source: unknown,
    crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    size: { readonly width: number; readonly height: number },
    type: 'image/png' | 'image/jpeg',
  ) => Promise<Blob>;
};

const extension = (name: string): string => name.toLowerCase().split('.').pop() ?? '';

export function kindOf(file: {
  readonly name: string;
  readonly type: string;
}): 'image' | 'pdf' | 'sheet' | 'csv' | 'docx' | 'text' | 'word97' | undefined {
  const ext = extension(file.name);
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) return 'sheet';
  if (ext === 'csv' || file.type === 'text/csv') return 'csv';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'word97';
  if (ext === 'txt' || file.type === 'text/plain') return 'text';
  return undefined;
}

/** Bytes as base64, in slices so a large file does not overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Text from a file whose encoding is not declared: UTF-8 if it is valid UTF-8,
 * otherwise Windows-1255 - what older Israeli bank exports are written in.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1255').decode(bytes);
  }
}

async function prepareImage(
  blob: Blob,
  file: number,
  name: string,
  hash: string,
  ops: ImageOps,
): Promise<PreparedFile> {
  const decoded = await ops.decode(blob);
  if (decoded === undefined) return { kind: 'refused', file, name, reason: 'unreadable' };
  const { width, height, source } = decoded;
  const tiles = computeTiles(width, height);
  const media = blob.type as ImageMedia;
  const fits = fitSize(width, height);
  // Inside the limits, in a format the model takes, and not too heavy: sent untouched.
  if (
    tiles.length === 1 &&
    fits.width === width &&
    IMAGE_MEDIA.includes(media) &&
    blob.size <= 5 * 1024 * 1024
  ) {
    const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
    return {
      kind: 'images',
      file,
      name,
      hash,
      images: [{ media, data, patches: patches(width, height), part: null, parts: 1 }],
    };
  }
  // Screenshots stay lossless; photos are JPEG at a quality that keeps small print sharp.
  const type = media === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const images: PreparedImage[] = [];
  for (const [i, tile] of tiles.entries()) {
    const size = fitSize(width, tile.height);
    const out = await ops.render(source, { x: 0, y: tile.y, width, height: tile.height }, size, type);
    images.push({
      media: type,
      data: toBase64(new Uint8Array(await out.arrayBuffer())),
      patches: patches(size.width, size.height),
      part: tiles.length === 1 ? null : i + 1,
      parts: tiles.length,
    });
  }
  return { kind: 'images', file, name, hash, images };
}

/** A page's text layer is worth reading when it has numbers in it and is not a few stray glyphs. */
export function usableText(text: string): boolean {
  return /\d/.test(text) && text.replace(/\s+/g, '').length >= 20;
}

async function preparePdf(
  bytes: Uint8Array,
  file: number,
  name: string,
  hash: string,
): Promise<PreparedFile> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js 6 evaluates nothing: it runs under the app's script policy, worker and all, as served.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    return {
      kind: 'refused',
      file,
      name,
      reason: error instanceof Error && error.name === 'PasswordException' ? 'pdf_password' : 'unreadable',
    };
  }
  if (pdf.numPages > MAX_PDF_PAGES) return { kind: 'refused', file, name, reason: 'pdf_pages' };
  const pages: string[] = [];
  const scannedPages: number[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
      .join('')
      .trim();
    if (usableText(text)) pages.push(text);
    else {
      pages.push('');
      scannedPages.push(n);
    }
  }
  await task.destroy();
  const scanned: { page: number; data: string }[] = [];
  if (scannedPages.length > 0) {
    const { PDFDocument } = await import('pdf-lib');
    const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
    for (const n of scannedPages) {
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(source, [n - 1]);
      if (copied !== undefined) single.addPage(copied);
      scanned.push({ page: n, data: toBase64(await single.save()) });
    }
  }
  return { kind: 'text', file, name, hash, pages, scanned };
}

async function prepareSheet(
  bytes: Uint8Array,
  csv: boolean,
  file: number,
  name: string,
  hash: string,
): Promise<PreparedFile> {
  const XLSX = await import('xlsx');
  if (!csv) {
    const cptable = await import('xlsx/dist/cpexcel.full.mjs');
    XLSX.set_cptable(cptable);
  }
  try {
    const book = csv
      ? XLSX.read(decodeText(bytes), { type: 'string', raw: true })
      : XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: true });
    const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
    const sheets = book.SheetNames.map((sheetName) => {
      const sheet = book.Sheets[sheetName];
      if (sheet === undefined) return { name: sheetName, rows: [], date1904 };
      /*
       * Every row, blank ones too, so each lines up with its row number;
       * then the blank ones dropped - exactly the rows `blankrows: false`
       * gives. A number's format is taken off its cell before the rows are
       * read, so a date-formatted serial is still the number it always was.
       */
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
      const formats: (string | null)[][] = [];
      let any = false;
      for (let r = range.s.r; r <= range.e.r; r += 1) {
        const line: (string | null)[] = [];
        for (let c = range.s.c; c <= range.e.c; c += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })] as { t?: string; z?: unknown } | undefined;
          const format =
            cell?.t === 'n' && typeof cell.z === 'string' && cell.z !== 'General' ? cell.z : null;
          if (format !== null) any = true;
          line.push(format);
          if (cell !== undefined) delete cell.z;
        }
        formats.push(line);
      }
      const all = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      });
      const kept = all.flatMap((row, r) => (row.some((cell) => cell !== null) ? [r] : []));
      const rows = kept.map((r) => all[r] ?? []);
      return any
        ? { name: sheetName, rows, formats: kept.map((r) => formats[r] ?? []), date1904 }
        : { name: sheetName, rows, date1904 };
    });
    // Monthly totals only: refused here, with the reason, before anything is asked about them.
    if (totalsOnly(sheets)) return { kind: 'refused', file, name, reason: 'totals_only' };
    return { kind: 'sheet', file, name, hash, sheets };
  } catch {
    return { kind: 'refused', file, name, reason: 'unreadable' };
  }
}

async function prepareDocx(
  bytes: Uint8Array,
  file: number,
  name: string,
  hash: string,
): Promise<PreparedFile> {
  try {
    const mammoth = (await import('mammoth/mammoth.browser.js')).default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: bytes.slice().buffer });
    return { kind: 'text', file, name, hash, pages: [value], scanned: [] };
  } catch {
    return { kind: 'refused', file, name, reason: 'unreadable' };
  }
}

/** Every picked file, prepared or refused, in the order picked. */
export async function prepareFiles(files: readonly File[], ops: ImageOps): Promise<PreparedFile[]> {
  const out: PreparedFile[] = [];
  for (const [file, blob] of files.entries()) {
    const name = blob.name;
    if (file >= MAX_FILES) {
      out.push({ kind: 'refused', file, name, reason: 'over_limit' });
      continue;
    }
    const kind = kindOf(blob);
    if (kind === undefined) {
      out.push({ kind: 'refused', file, name, reason: 'unsupported' });
      continue;
    }
    if (kind === 'word97') {
      out.push({ kind: 'refused', file, name, reason: 'word97' });
      continue;
    }
    if (blob.size > (kind === 'pdf' ? MAX_PDF_BYTES : MAX_FILE_BYTES)) {
      out.push({ kind: 'refused', file, name, reason: 'too_large' });
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await sha256Hex(bytes.slice().buffer);
    if (kind === 'image') out.push(await prepareImage(blob, file, name, hash, ops));
    else if (kind === 'pdf') out.push(await preparePdf(bytes, file, name, hash));
    else if (kind === 'sheet' || kind === 'csv')
      out.push(await prepareSheet(bytes, kind === 'csv', file, name, hash));
    else if (kind === 'docx') out.push(await prepareDocx(bytes, file, name, hash));
    else out.push({ kind: 'text', file, name, hash, pages: [decodeText(bytes)], scanned: [] });
  }
  return out;
}

/** One call's worth of documents, and which file and part each one is. */
export type Job = {
  readonly sources: readonly WireSource[];
  readonly origin: readonly { readonly file: number; readonly part: number | null }[];
  /** Grounding text for each source: its own text, for a text source. */
  readonly texts: readonly (string | null)[];
  /** Read twice unless the document prints a total: images and scans. */
  readonly visual: boolean;
};

/**
 * The calls to make: text a few pages at a time, scans a page at a time,
 * each tall image's slices together, small images grouped (`groupSmall`), and
 * an image already sent - the same bytes shared twice - sent once.
 */
export function planJobs(
  prepared: readonly PreparedFile[],
  group: <T extends { readonly patches: number }>(items: readonly T[]) => T[][],
): Job[] {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  const small: { image: PreparedImage; file: number; label: string; patches: number }[] = [];
  for (const p of prepared) {
    if (p.kind === 'text') {
      const label = (page: number) => (p.pages.length === 1 ? p.name : `${p.name}, page ${String(page)}`);
      const textPages = p.pages.map((text, i) => ({ text, page: i + 1 })).filter((x) => x.text !== '');
      for (let i = 0; i < textPages.length; i += PAGES_PER_JOB) {
        const chunk = textPages.slice(i, i + PAGES_PER_JOB);
        jobs.push({
          sources: chunk.map((x) => ({ kind: 'text', text: x.text, label: label(x.page) })),
          origin: chunk.map((x) => ({ file: p.file, part: p.pages.length === 1 ? null : x.page })),
          texts: chunk.map((x) => x.text),
          visual: false,
        });
      }
      for (const scan of p.scanned) {
        jobs.push({
          sources: [{ kind: 'pdf', data: scan.data, label: label(scan.page) }],
          origin: [{ file: p.file, part: scan.page }],
          texts: [null],
          visual: true,
        });
      }
    } else if (p.kind === 'images') {
      if (seen.has(p.hash)) continue;
      seen.add(p.hash);
      if (p.images.length > 1) {
        jobs.push({
          sources: p.images.map((image) => ({
            kind: 'image',
            media: image.media,
            data: image.data,
            label: `${p.name}, part ${String(image.part)} of ${String(image.parts)} (parts overlap)`,
          })),
          origin: p.images.map((image) => ({ file: p.file, part: image.part })),
          texts: p.images.map(() => null),
          visual: true,
        });
      } else if (p.images[0] !== undefined) {
        small.push({ image: p.images[0], file: p.file, label: p.name, patches: p.images[0].patches });
      }
    }
  }
  for (const batch of group(small)) {
    jobs.push({
      sources: batch.map((x) => ({
        kind: 'image',
        media: x.image.media,
        data: x.image.data,
        label: x.label,
      })),
      origin: batch.map((x) => ({ file: x.file, part: null })),
      texts: batch.map(() => null),
      visual: true,
    });
  }
  return jobs;
}

/** The browser's own image work: decode with createImageBitmap, draw and encode on a canvas. */
export const browserImageOps: ImageOps = {
  decode: async (blob) => {
    try {
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    } catch {
      return undefined;
    }
  },
  render: async (source, crop, size, type) => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no canvas');
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      source as ImageBitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      size.width,
      size.height,
    );
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob === null) reject(new Error('encode'));
          else resolve(blob);
        },
        type,
        0.92,
      );
    });
  },
};
