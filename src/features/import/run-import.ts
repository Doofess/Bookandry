import {
  combineAccountReads,
  combineCardReads,
  groundAccounts,
  groundCards,
  mergeAccounts,
  mergeCards,
  readAccount,
  readCard,
  withStatementCards,
  type FoundAccount,
  type FoundCard,
} from '@/domain/import-cards';
import {
  combineReads,
  groundInText,
  readRow,
  reconcile,
  withFlags,
  withoutFlags,
  type FoundRow,
  type Reconciliation,
} from '@/domain/import-check';
import { groupSmall } from '@/domain/import-images';
import { collapseOverlaps } from '@/domain/import-review';
import {
  fromWireMap,
  mapByDictionary,
  mapHolds,
  readSheet,
  sampleRows,
  type Cell,
  type ColumnMap,
} from '@/domain/import-sheet-map';
import {
  cleanExtract,
  cleanMap,
  cleanMerchantCats,
  cleanVerify,
  LIMITS,
  tokensForRows,
  type Dispute,
  type WireAccount,
  type WireCard,
  type WireContext,
  type WireExtract,
  type WireRequest,
  type WireRow,
  type WireTotal,
} from '@/domain/import-wire';
import { parseStatementDate } from '@/lib/dates';
import type { RefuseReason, Job, PreparedFile } from '@/services/ai-import/prepare-files';
import { planJobs } from '@/services/ai-import/prepare-files';
import type { ExtractError, ExtractOutcome } from '@/services/supabase/extract';
import type { Currency, LocalDate } from '@/types/money';

/**
 * "Smart import", start to finish: every prepared file read, checked and,
 * where a check fails, looked at again - one model call at a time, so each is
 * small and its cost known.
 *
 * Per file, by what it is:
 *  - spreadsheet: read by code; the model only names columns it cannot;
 *  - text (a PDF's text layer, Word, plain text): one read, grounded in the
 *    text itself;
 *  - image or scan: one read, held to the totals the document prints - or,
 *    with none to hold it to, read a second time by a cheaper model and
 *    compared row by row.
 * Then one correction call per batch, for the rows that failed, and only
 * those. Anything still in doubt is returned flagged, never hidden.
 *
 * Cards and bank accounts a document describes - a card company's list of
 * cards and their rates, a statement's header - are read in the same calls,
 * and an image's are read twice too.
 */

export type Caller = (request: WireRequest, signal?: AbortSignal) => Promise<ExtractOutcome>;

export type FileState =
  | { readonly file: number; readonly name: string; readonly status: 'reading' | 'checking' }
  | {
      readonly file: number;
      readonly name: string;
      readonly status: 'done';
      readonly found: number;
      readonly partial: boolean;
    }
  | { readonly file: number; readonly name: string; readonly status: 'empty' }
  | {
      readonly file: number;
      readonly name: string;
      readonly status: 'failed';
      readonly error: ExtractError | 'sheet';
    }
  | {
      readonly file: number;
      readonly name: string;
      readonly status: 'refused';
      readonly reason: RefuseReason;
    };

export type ImportContext = {
  readonly wire: WireContext;
  readonly base: Currency;
  readonly known: ReadonlySet<Currency>;
  readonly today: LocalDate;
  /** When each file was made, for dates printed without a year. */
  readonly anchorOf: (file: number) => LocalDate;
  /** Whether the household's history already places this merchant. */
  readonly knownMerchant: (description: string) => Promise<boolean>;
};

export type ImportResult = {
  readonly rows: readonly FoundRow[];
  readonly cards: readonly FoundCard[];
  readonly accounts: readonly FoundAccount[];
  readonly reconciliations: readonly Reconciliation[];
  readonly usage: { readonly input: number; readonly output: number };
};

/** At most this many calls at once. */
const PARALLEL = 3;
/** How many times a long document is carried on with. */
const CONTINUATIONS = 5;

type Totals = (WireTotal & { readonly file: number })[];

class Failure extends Error {
  constructor(readonly code: ExtractError) {
    super(code);
  }
}

export async function runImport(
  prepared: readonly PreparedFile[],
  ctx: ImportContext,
  call: Caller,
  options: {
    readonly signal?: AbortSignal;
    readonly onFile: (state: FileState) => void;
  },
): Promise<ImportResult> {
  const usage = { input: 0, output: 0 };
  const ask = async (request: WireRequest): Promise<unknown> => {
    const outcome = await call(request, options.signal);
    if (outcome.usage !== undefined) {
      usage.input += outcome.usage.in + outcome.usage.cacheWrite + outcome.usage.cacheRead;
      usage.output += outcome.usage.out;
    }
    if (!outcome.ok) throw new Failure(outcome.error);
    return outcome.result;
  };

  const rows: FoundRow[] = [];
  const totals: Totals = [];
  const cards: FoundCard[] = [];
  const accounts: FoundAccount[] = [];
  const names = new Map(prepared.map((p) => [p.file, p.name]));
  const failed = new Set<number>();
  const partial = new Set<number>();
  const report = (state: FileState) => {
    options.onFile(state);
  };

  /*
   * Every file is read afresh, a file picked again too: a reading kept from
   * before would keep whatever the reading then got wrong, past every fix
   * made to it since.
   */
  const fresh: Exclude<PreparedFile, { kind: 'refused' }>[] = [];
  for (const p of prepared) {
    if (p.kind === 'refused') {
      report({ file: p.file, name: p.name, status: 'refused', reason: p.reason });
      continue;
    }
    fresh.push(p);
    report({ file: p.file, name: p.name, status: 'reading' });
  }

  // Spreadsheets: by code.
  for (const p of fresh) {
    if (p.kind !== 'sheet') continue;
    try {
      rows.push(...(await readWorkbook(p, ctx, ask)));
    } catch (error) {
      if (options.signal?.aborted === true) throw error;
      failed.add(p.file);
      report({
        file: p.file,
        name: p.name,
        status: 'failed',
        error: error instanceof Failure ? error.code : 'sheet',
      });
    }
  }

  // Everything else: one job per call, a few at a time.
  const jobs = planJobs(fresh, groupSmall);
  const byJob: { job: Job; rows: FoundRow[] }[] = [];
  await pool(jobs.entries(), PARALLEL, async ([index, job]) => {
    try {
      const read = await readJob(job, index, ctx, ask, jobs.length > 1);
      if (read.partial) for (const o of job.origin) partial.add(o.file);
      rows.push(...read.rows);
      totals.push(...read.totals);
      cards.push(...read.cards);
      accounts.push(...read.accounts);
      byJob.push({ job, rows: read.rows });
    } catch (error) {
      if (options.signal?.aborted === true) throw error;
      for (const o of job.origin) {
        failed.add(o.file);
        report({
          file: o.file,
          name: names.get(o.file) ?? '',
          status: 'failed',
          error: error instanceof Failure ? error.code : 'upstream',
        });
      }
    }
  });

  // Seams of overlapping screenshots folded; then every file held to its totals.
  let found = collapseOverlaps(rows);
  let reconciliations = reconcile(found, totals, ctx);

  // One more look, for what failed, per job.
  for (const { job } of byJob) {
    const files = new Set(job.origin.map((o) => o.file));
    const suspects = new Map<string, string>();
    for (const r of reconciliations) {
      if (!files.has(r.file)) continue;
      for (const s of r.suspects) suspects.set(s.id, s.hint);
    }
    const disputes: Dispute[] = [];
    for (const row of found) {
      if (!files.has(row.file) || disputes.length >= LIMITS.disputes) continue;
      if (row.flags.includes('reads_disagree') && row.otherRead !== undefined) {
        disputes.push({
          id: row.id,
          problem: 'Two reads of this row disagree. Which is printed?',
          candidates: [row.wire, row.otherRead.wire],
        });
      } else if (row.flags.includes('amount_not_in_source')) {
        disputes.push({
          id: row.id,
          problem: `The amount ${row.wire.a} is not printed in the document.`,
          candidates: [row.wire],
        });
      } else if (suspects.has(row.id)) {
        disputes.push({ id: row.id, problem: problemFor(suspects.get(row.id)), candidates: [row.wire] });
      }
    }
    if (disputes.length === 0) continue;
    report({
      file: job.origin[0]?.file ?? 0,
      name: names.get(job.origin[0]?.file ?? 0) ?? '',
      status: 'checking',
    });
    let answer;
    try {
      const request: WireRequest = {
        mode: 'verify',
        ctx: ctx.wire,
        sources: job.sources,
        disputes: disputes.map((d) => ({
          ...d,
          candidates: d.candidates.map((c) => ({ ...c, s: Math.min(c.s, job.sources.length - 1) })),
        })),
        maxTokens: tokensForRows(disputes.length),
      };
      answer = cleanVerify(
        await ask(request),
        job.sources.length,
        ctx.wire,
        disputes.map((d) => d.id),
      );
    } catch (error) {
      if (options.signal?.aborted === true) throw error;
      continue;
    }
    if (answer === undefined) continue;
    found = applyCorrections(found, answer.r, job, ctx, reconciliations, totals);
    reconciliations = reconcile(found, totals, ctx);
  }

  // A difference that remains marks the rows it points at.
  const stillSuspect = new Set(reconciliations.flatMap((r) => r.suspects.map((s) => s.id)));
  found = found.map((row) => (stillSuspect.has(row.id) ? withFlags(row, 'total_mismatch') : row));
  found = withStatementCards(found, cards);

  // Report.
  for (const p of fresh) {
    if (failed.has(p.file)) continue;
    const count =
      found.filter((row) => row.file === p.file).length +
      cards.filter((card) => card.file === p.file).length +
      accounts.filter((account) => account.file === p.file).length;
    report(
      count === 0
        ? { file: p.file, name: p.name, status: 'empty' }
        : { file: p.file, name: p.name, status: 'done', found: count, partial: partial.has(p.file) },
    );
  }
  return { rows: found, cards: mergeCards(cards), accounts: mergeAccounts(accounts), reconciliations, usage };
}

function problemFor(hint: string | undefined): string {
  if (hint === 'missing_or_duplicated')
    return 'The rows do not add up to the printed total by exactly this amount: is this row printed once, twice, or not at all?';
  if (hint === 'decimal_shift')
    return 'The rows do not add up to the printed total: check where the decimal point is in this amount.';
  return 'The rows do not add up to the printed total: check the digits of this amount.';
}

/** Run `work` over `items`, at most `limit` at a time. */
async function pool<T>(items: Iterable<T>, limit: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}

/** About how many rows a job holds, for sizing the answer: lines with an amount in text, a screenful per image. */
function expectedRows(job: Job): number {
  let rows = 0;
  job.sources.forEach((source) => {
    if (source.kind === 'text') rows += (source.text.match(/^.*\d[\d,.]*\d.*$/gm) ?? []).length;
    else rows += source.kind === 'pdf' ? 40 : 25;
  });
  return Math.max(5, Math.min(LIMITS.rows, rows));
}

/** One read of a job, carried on while the model says there is more. */
async function extractAll(
  job: Job,
  read: 'primary' | 'check',
  ctx: ImportContext,
  ask: (r: WireRequest) => Promise<unknown>,
  cache: boolean,
): Promise<WireExtract & { readonly partial: boolean }> {
  const all: WireRow[] = [];
  const totals: WireTotal[] = [];
  const cards: WireCard[] = [];
  const accounts: WireAccount[] = [];
  let prime = '';
  let period: WireExtract['per'] = null;
  let maxTokens = tokensForRows(expectedRows(job));
  for (let turn = 0; turn <= CONTINUATIONS; turn += 1) {
    let raw: unknown;
    try {
      raw = await ask({
        mode: 'extract',
        read,
        ctx: ctx.wire,
        sources: job.sources,
        maxTokens,
        continueAfter: all.length,
        cache,
      });
    } catch (error) {
      // Cut off mid-answer: the same again with room to finish.
      if (error instanceof Failure && error.code === 'partial' && maxTokens < LIMITS.maxTokens) {
        maxTokens = Math.min(LIMITS.maxTokens, maxTokens * 2);
        turn -= 1;
        continue;
      }
      throw error;
    }
    const answer = cleanExtract(raw, job.sources.length, ctx.wire);
    if (answer === undefined) throw new Failure('upstream');
    all.push(...answer.r);
    cards.push(...answer.k);
    accounts.push(...answer.ba);
    if (prime === '') prime = answer.pr;
    if (turn === 0) {
      totals.push(...answer.t);
      period = answer.per;
    }
    if (answer.done || answer.r.length === 0)
      return {
        r: all,
        t: totals,
        per: period,
        done: true,
        k: cards,
        ba: accounts,
        pr: prime,
        partial: false,
      };
  }
  return { r: all, t: totals, per: period, done: false, k: cards, ba: accounts, pr: prime, partial: true };
}

/** A read's bank accounts, read by the app - and, from a text, found in it. */
function readAccounts(answer: WireExtract, job: Job, prefix: string): FoundAccount[] {
  return answer.ba.map((wire, i) => {
    const origin = job.origin[wire.s] ?? job.origin[0] ?? { file: 0, part: null };
    const account = readAccount(wire, `${prefix}${String(i)}`, origin.file);
    const text = job.texts[wire.s];
    return text === null || text === undefined ? account : (groundAccounts([account], text)[0] ?? account);
  });
}

/** A read's cards, read by the app, each with the file it came from - and, from a text, found in it. */
function readCards(answer: WireExtract, job: Job, prefix: string): FoundCard[] {
  return answer.k.map((wire, i) => {
    const origin = job.origin[wire.s] ?? job.origin[0] ?? { file: 0, part: null };
    const card = readCard(wire, `${prefix}${String(i)}`, origin.file, answer.pr);
    const text = job.texts[wire.s];
    return text === null || text === undefined ? card : (groundCards([card], text)[0] ?? card);
  });
}

function readRows(
  wire: readonly WireRow[],
  job: Job,
  prefix: string,
  ctx: ImportContext,
  period: WireExtract['per'],
): FoundRow[] {
  return wire.map((row, i) => {
    const origin = job.origin[row.s] ?? job.origin[0] ?? { file: 0, part: null };
    const anchor = ctx.anchorOf(origin.file);
    const from = period === null ? undefined : parseStatementDate(period.f, anchor)?.date;
    const to = period === null ? undefined : parseStatementDate(period.t, anchor)?.date;
    return readRow({ ...row, p: row.p ?? origin.part }, `${prefix}${String(i)}`, {
      file: origin.file,
      base: ctx.base,
      known: ctx.known,
      anchor,
      today: ctx.today,
      ...(from === undefined || to === undefined ? {} : { period: { from, to } }),
    });
  });
}

/** Ground each text source's rows in that source's text. */
function ground(found: readonly FoundRow[], wire: readonly WireRow[], job: Job): FoundRow[] {
  return found.map((row, i) => {
    const text = job.texts[wire[i]?.s ?? 0];
    return text === null || text === undefined ? row : (groundInText([row], text)[0] ?? row);
  });
}

async function readJob(
  job: Job,
  index: number,
  ctx: ImportContext,
  ask: (r: WireRequest) => Promise<unknown>,
  cache: boolean,
): Promise<{
  readonly rows: FoundRow[];
  readonly totals: Totals;
  readonly cards: FoundCard[];
  readonly accounts: FoundAccount[];
  readonly partial: boolean;
}> {
  const first = await extractAll(job, 'primary', ctx, ask, cache);
  let cards = readCards(first, job, `j${String(index)}k`);
  let accounts = readAccounts(first, job, `j${String(index)}b`);
  let found = ground(readRows(first.r, job, `j${String(index)}r`, ctx, first.per), first.r, job);
  const jobTotals: Totals = first.t.map((t) => ({
    ...t,
    file: job.origin[t.s]?.file ?? job.origin[0]?.file ?? 0,
  }));
  // An image with no printed total to hold it to - or cards, which no total
  // holds to anything: a second, independent read.
  const checkRows = job.visual && jobTotals.length === 0 && found.length > 0;
  const checkCards = job.visual && (cards.length > 0 || accounts.length > 0);
  if (checkRows || checkCards) {
    const second = await extractAll(job, 'check', ctx, ask, false);
    if (checkRows)
      found = combineReads(found, readRows(second.r, job, `j${String(index)}c`, ctx, second.per));
    if (checkCards) {
      cards = combineCardReads(cards, readCards(second, job, `j${String(index)}kc`));
      accounts = combineAccountReads(accounts, readAccounts(second, job, `j${String(index)}bc`));
    }
  }
  return { rows: found, totals: jobTotals, cards, accounts, partial: first.partial };
}

/**
 * Take what the second look says, where it settles something:
 *  - two reads that disagreed, and the look agrees with one of them;
 *  - an amount not printed in the text, now one that is;
 *  - rows the total pointed at: kept only if, with them, the file now adds up
 *    exactly - a guess that does not make the sums meet is no correction.
 */
function applyCorrections(
  rows: readonly FoundRow[],
  answers: readonly (WireRow & { readonly id: string })[],
  job: Job,
  ctx: ImportContext,
  before: readonly Reconciliation[],
  totals: Totals,
): FoundRow[] {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const tentative: FoundRow[] = [];
  const settled = rows.map((row) => {
    const answer = byId.get(row.id);
    if (answer === undefined) return row;
    const [fresh] = readRows([answer], job, row.id, ctx, null);
    if (fresh === undefined) return row;
    const corrected = { ...fresh, id: row.id };
    if (row.flags.includes('reads_disagree') && row.otherRead !== undefined) {
      const matches = [row, row.otherRead].some(
        (c) => c.amountMinor === corrected.amountMinor && c.date === corrected.date,
      );
      return matches ? withoutFlags({ ...corrected, otherRead: undefined }, 'reads_disagree') : row;
    }
    if (row.flags.includes('amount_not_in_source')) {
      const text = job.texts[answer.s];
      const grounded =
        text === null || text === undefined ? corrected : (groundInText([corrected], text)[0] ?? corrected);
      return grounded.flags.includes('amount_not_in_source') ? row : grounded;
    }
    tentative.push(corrected);
    return row;
  });
  if (tentative.length === 0) return settled;
  const swapped = settled.map((row) => tentative.find((t) => t.id === row.id) ?? row);
  const files = new Set(tentative.map((t) => t.file));
  const after = reconcile(swapped, totals, ctx).filter((r) => files.has(r.file));
  const fixed =
    after.every((r) => r.differenceMinor === 0) &&
    before.some((r) => files.has(r.file) && r.differenceMinor !== 0);
  return fixed ? swapped : settled;
}

/** Every sheet of a workbook, read by code - asking the model only for columns the dictionary does not know. */
async function readWorkbook(
  p: Extract<PreparedFile, { kind: 'sheet' }>,
  ctx: ImportContext,
  ask: (r: WireRequest) => Promise<unknown>,
): Promise<FoundRow[]> {
  const out: FoundRow[] = [];
  for (const [s, sheet] of p.sheets.entries()) {
    if (sheet.rows.length === 0) continue;
    const readWith = (map: ColumnMap) =>
      readSheet(sheet.rows, map, {
        file: p.file,
        base: ctx.base,
        known: ctx.known,
        anchor: ctx.anchorOf(p.file),
        date1904: sheet.date1904,
        idPrefix: `f${String(p.file)}s${String(s)}r`,
      });
    const known = mapByDictionary(sheet.rows);
    const first = known === undefined ? undefined : readWith(known);
    let map: ColumnMap;
    let read: ReturnType<typeof readWith>;
    if (known !== undefined && first !== undefined && mapHolds(first)) {
      map = known;
      read = first;
    } else {
      map = fromWireMap(await askMap(sheet.rows, [], ctx, ask));
      read = readWith(map);
      if (!mapHolds(read)) throw new Error('sheet');
    }
    let merchantCats = new Map<string, string | null>();
    // Merchants the household has not filed before: named in one cheap call, not one per row.
    const unknown: string[] = [];
    for (const description of new Set(read.rows.map((r) => r.description))) {
      if (description !== '' && !(await ctx.knownMerchant(description))) unknown.push(description);
    }
    if (unknown.length > 0) {
      const header = sheet.rows.slice(map.headerRow, map.headerRow + 3);
      const cats = await askCategories(header, unknown.slice(0, LIMITS.merchants), ctx, ask);
      merchantCats = new Map(cats.map((m) => [m.m, m.cat]));
    }
    out.push(
      ...read.rows.map((row) => ({ ...row, categoryAlias: merchantCats.get(row.description) ?? null })),
    );
  }
  return out;
}

/**
 * Categories for merchants the household has not filed before. Worth a second
 * try: without them every row falls to Other. Only the categories are read -
 * the columns came from the dictionary or an earlier call.
 */
const NO_RETRY: ReadonlySet<ExtractError> = new Set(['aborted', 'quota', 'unauthorized', 'offline']);

async function askCategories(
  header: readonly (readonly Cell[])[],
  merchants: readonly string[],
  ctx: ImportContext,
  ask: (r: WireRequest) => Promise<unknown>,
): Promise<{ m: string; cat: string | null }[]> {
  const request: WireRequest = {
    mode: 'map',
    ctx: ctx.wire,
    rows: sampleRows(header),
    merchants,
    maxTokens: tokensForRows(10 + merchants.length / 2),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return cleanMerchantCats(await ask(request), ctx.wire);
    } catch (error) {
      // Stopped, or out of quota: no second try - and the rows still come, filed as Other.
      if (!(error instanceof Failure) || NO_RETRY.has(error.code)) break;
    }
  }
  return [];
}

async function askMap(
  rows: readonly (readonly Cell[])[],
  merchants: readonly string[],
  ctx: ImportContext,
  ask: (r: WireRequest) => Promise<unknown>,
) {
  const sample = sampleRows(rows);
  const cols = Math.max(1, ...sample.map((r) => r.length));
  const raw = await ask({
    mode: 'map',
    ctx: ctx.wire,
    rows: sample,
    merchants,
    maxTokens: tokensForRows(10 + merchants.length / 2),
  });
  const map = cleanMap(raw, sample.length, cols, ctx.wire);
  if (map === undefined) throw new Failure('upstream');
  return map;
}
