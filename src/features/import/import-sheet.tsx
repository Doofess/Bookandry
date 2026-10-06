import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, CircleAlert, FileUp, Info, Loader2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { usePrime } from '@/app/prime';
import { forgetShared, readShared } from '@/app/shared-files';
import { Money } from '@/components/money';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import {
  dropUnfinished,
  keepUnfinished,
  listUnfinished,
  restoreUnfinished,
  type UnfinishedMethod,
} from '@/db/import-drafts';
import { redoImport, saveImported, undoImport, type ImportItem } from '@/db/import-transactions';
import { quoteRate } from '@/db/rates-gateway';
import { categoryFromHistory, findCandidates, findOverrides } from '@/db/repos/transactions';
import type { ResolvedRate } from '@/db/save-transaction';
import { cardFeeOccurrences, fxFeeFor } from '@/domain/cards';
import { buildMethodReview, type MethodReviewItem } from '@/domain/import-cards';
import { BLOCKING, type Flag, type FoundRow } from '@/domain/import-check';
import { flagCardFees, flagExisting } from '@/domain/import-review';
import type { WireContext } from '@/domain/import-wire';
import { expandOccurrences } from '@/domain/occurrences';
import { txFormSchema, type TxFormValues } from '@/domain/tx-form';
import { categoriesFor } from '@/domain/tx-options';
import type { SheetTarget } from '@/features/transaction/use-transaction-sheet';
import { categoryDisplayName } from '@/i18n/category-name';
import { methodDisplayName } from '@/i18n/method-name';
import { systemClock } from '@/lib/clock';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-list';
import { addDays, formatLocalDate, isLocalDate, maxDate, minDate, todayLocal } from '@/lib/dates';
import { newId } from '@/lib/id';
import { toMinor } from '@/lib/money';
import { browserImageOps, MAX_FILES, prepareFiles } from '@/services/ai-import/prepare-files';
import {
  ALL_PROFILES,
  isActiveMethod,
  type Category,
  type PaymentMethod,
  type Profile,
} from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

import {
  foundMethodOf,
  foundName,
  needsFilling,
  nextUnfinished,
  saveFound,
  tickable,
  unfinishedItem,
} from './found-methods';
import { MethodPanel, MethodsGroup, UnfinishedGroup } from './found-methods-list';
import { readSession, writeSession, type ImportSession } from './import-session';
import { applyBatch, buildReview, linkToCard, saveable, type Aliases, type ReviewItem } from './review-items';
import { runImport, type FileState } from './run-import';
import { CategoryField } from '../transaction/category-field';
import { DateField } from '../transaction/date-field';
import { PaymentMethodField } from '../transaction/payment-method-field';

export type ImportSheetProps = {
  readonly target: Extract<SheetTarget, { mode: 'import' }>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenRow: (row: number | undefined) => void;
  readonly onOpenCard: (card: string | undefined) => void;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly activeProfileId: string;
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (date: LocalDate) => void;
};

const ACCEPT = [
  'image/*',
  'application/pdf',
  '.xlsx',
  '.xls',
  '.csv',
  '.docx',
  '.txt',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

/** Flags that mean "this is already in the household" - a group of their own, at the bottom. */
const EXISTING: ReadonlySet<Flag> = new Set<Flag>([
  'already_added',
  'already_plan',
  'card_fee_counted',
  'in_another_file',
]);

const EMPTY_SESSION = (profileId: string): ImportSession => ({
  stage: 'pick',
  files: [],
  states: [],
  items: [],
  methods: [],
  drafted: 0,
  reconciliations: [],
  batch: { methodId: '', profileId },
});

/**
 * "Smart import": pick files, let them be read, check what was found, add it.
 *
 * Nothing is added until the person says so. What was found is listed in
 * three groups - what needs a look, what is ready, what looks like it is
 * already in the household - each row with its reason in plain words, and
 * any row can be opened and corrected first. "Add N" saves the ticked rows
 * through the same path the form uses, all at once, with an Undo.
 *
 * Cards and bank accounts found are listed above them. One the file showed
 * only part of opens in the card or account editor, with what it did show
 * already filled in - straight away, when that is all the files held - and
 * waits at the top of the sheet, reading after reading, until its rest is
 * filled in or it is deleted.
 */
export function ImportSheet(props: ImportSheetProps) {
  const { t, i18n } = useTranslation(['import', 'common', 'categories', 'profiles']);
  const titleId = useId();
  const prime = usePrime();
  const account = useAccount();
  const me = account.status === 'signed_in' ? account.user.id : undefined;
  // Whoever is being looked at; looking at everyone, the person signed in.
  const defaultProfileId = props.profiles.some((p) => p.id === props.activeProfileId)
    ? props.activeProfileId
    : (props.profiles.find((p) => p.id === me)?.id ?? props.profiles[0]?.id ?? '');
  const [session, setSession] = useState<ImportSession>(
    () => readSession() ?? EMPTY_SESSION(defaultProfileId),
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    writeSession(session);
  }, [session]);

  // Cards and accounts still to finish, from this reading or an earlier one.
  const kept = useLiveQuery(() => listUnfinished(db), []);
  const unfinished = useMemo(
    () =>
      (kept ?? []).flatMap((entry) => {
        const item = unfinishedItem(entry, props.paymentMethods);
        return item === undefined ? [] : [{ entry, item }];
      }),
    [kept, props.paymentMethods],
  );
  // One the household turns out to have all of already was finished some other way.
  useEffect(() => {
    for (const entry of kept ?? []) {
      if (unfinishedItem(entry, props.paymentMethods) === undefined) void dropUnfinished(db, entry.key);
    }
  }, [kept, props.paymentMethods]);

  // Files from the Share menu: picked for the person, read only when they say so.
  const sharedId = props.target.sharedId;
  const [sharedGone, setSharedGone] = useState(false);
  useEffect(() => {
    if (sharedId === undefined || session.sharedId === sharedId) return;
    let cancelled = false;
    void readShared(sharedId).then((files) => {
      if (cancelled) return;
      if (files.length === 0) setSharedGone(true);
      else setSession({ ...EMPTY_SESSION(defaultProfileId), files, sharedId });
    });
    return () => {
      cancelled = true;
    };
  }, [sharedId, session.sharedId, defaultProfileId]);

  const close = () => {
    abort.current?.abort();
    writeSession(undefined);
    if (session.sharedId !== undefined) void forgetShared(session.sharedId);
    props.onOpenChange(false);
  };

  const unsaved =
    session.stage === 'review'
      ? session.items.filter((i) => i.ticked).length + session.methods.filter((m) => m.ticked).length
      : 0;
  // Who a new card or account belongs to: the batch "For".
  const owner = session.batch.profileId || defaultProfileId;
  // One kept from an earlier reading: whoever it was read for, while they are in the household.
  const ownerOf = (entry: UnfinishedMethod) =>
    props.profiles.some((p) => p.id === entry.owner) ? entry.owner : owner;

  const deleteUnfinished = (entry: UnfinishedMethod, name: string) => {
    void dropUnfinished(db, entry.key).then(() => {
      toast(t('import:unfinished.deleted', { name }), {
        action: {
          label: t('common:action.undo'),
          onClick: () => void restoreUnfinished(db, entry),
        },
      });
    });
  };
  const requestClose = () => {
    if (unsaved > 0) setConfirmDiscard(true);
    else close();
  };

  const translate = useMemo(() => (category: Category) => categoryDisplayName(category, t), [t]);

  async function read(files: readonly File[]) {
    const controller = new AbortController();
    abort.current = controller;
    const states: FileState[] = files.map((file, i) => ({ file: i, name: file.name, status: 'reading' }));
    setSession((s) => ({
      ...s,
      stage: 'reading',
      files,
      states,
      items: [],
      methods: [],
      drafted: 0,
      reconciliations: [],
    }));
    const update = (state: FileState) => {
      setSession((s) => ({ ...s, states: s.states.map((x) => (x.file === state.file ? state : x)) }));
    };

    // The household, as the reader is told about it: short aliases, names as the person sees them.
    const cats = props.categories.filter((c) => c.isArchived === 0).slice(0, 80);
    const methods = props.paymentMethods.filter(isActiveMethod).slice(0, 40);
    const aliases: Aliases = {
      categories: new Map(cats.map((c, i) => [`c${String(i + 1)}`, c.id])),
      methods: new Map(methods.map((m, i) => [`p${String(i + 1)}`, m.id])),
    };
    const wire: WireContext = {
      today: props.today,
      base: props.baseCurrency,
      lang: i18n.language.startsWith('he') ? 'he' : 'en',
      cats: cats.map((c, i) => ({
        a: `c${String(i + 1)}`,
        n: translate(c).slice(0, 60),
        k: c.kind === 'income' ? 'i' : 'e',
      })),
      pms: methods.map((m, i) => ({
        a: `p${String(i + 1)}`,
        n: methodDisplayName(m, t).slice(0, 60),
        t: m.type,
      })),
    };

    try {
      const prepared = await prepareFiles(files, browserImageOps);
      const known = new Set<Currency>(SUPPORTED_CURRENCIES);
      const result = await runImport(
        prepared,
        {
          wire,
          base: props.baseCurrency,
          known,
          today: props.today,
          anchorOf: (file) => {
            const modified = files[file]?.lastModified;
            return modified === undefined || modified <= 0
              ? props.today
              : minDate(todayLocal(new Date(modified)), props.today);
          },
          knownMerchant: async (description) =>
            (await categoryFromHistory(db, 'expense', description)) !== undefined ||
            (await categoryFromHistory(db, 'income', description)) !== undefined,
        },
        (request, signal) => accountController().extractTransactions(request, signal),
        {
          signal: controller.signal,
          onFile: update,
        },
      );
      const rows = await flagAgainstHousehold(
        result.rows,
        props.paymentMethods,
        aliases,
        props.baseCurrency,
        props.today,
      );
      const items = await buildReview(rows, {
        aliases,
        categories: props.categories,
        methods: props.paymentMethods,
        profiles: props.profiles,
        defaultProfileId: session.batch.profileId || defaultProfileId,
        defaultMethodId: session.batch.methodId,
        base: props.baseCurrency,
        today: props.today,
        primeRate: prime.primeRate,
      });
      const found = buildMethodReview(result.cards, result.accounts, props.paymentMethods);
      // What the files showed only part of is kept apart, until it is finished or deleted.
      const drafted = await keepUnfinished(
        db,
        found.filter(needsFilling).map(foundMethodOf),
        owner,
        systemClock.nowMs(),
      );
      setSession((s) => ({
        ...s,
        stage: 'review',
        items,
        methods: found.filter((m) => !needsFilling(m)),
        drafted: drafted.length,
        reconciliations: result.reconciliations,
      }));
      // Only cards or accounts, and one of them needs finishing: straight to its editor.
      const first = drafted[0];
      if (items.length === 0 && first !== undefined) props.onOpenCard(first.key);
    } catch {
      // Stopped: back to the files, still picked.
      setSession((s) => ({ ...s, stage: 'pick' }));
    }
  }

  async function save() {
    setSaving(true);
    try {
      // Cards and accounts first, so the rows charged to a new card can be paid with it.
      let items = session.items;
      let methodsSaved = 0;
      for (const method of session.methods) {
        if (!method.ticked || !tickable(method)) continue;
        const saved = await saveFound(method, owner, i18n.language);
        items = linkToCard(items, saved);
        methodsSaved += 1;
      }
      const chosen = items.filter((item) => item.ticked && item.values !== undefined);
      const toSave: ImportItem[] = [];
      let noRate = 0;
      for (const item of chosen) {
        const parsed = txFormSchema.safeParse(item.values);
        if (!parsed.success) continue;
        const values = parsed.data;
        let rate: ResolvedRate | undefined = item.rate;
        if (rate === undefined && values.currency !== props.baseCurrency) {
          const quote = await quoteRate(db, values.currency, props.baseCurrency, values.date, {
            nowMs: systemClock.nowMs(),
            today: props.today,
          });
          if (quote === undefined) {
            noRate += 1;
            continue;
          }
          rate = { rate: quote.rate, rateDate: quote.rateDate, rateSource: quote.rateSource };
        }
        // The card's foreign-currency fee - unless the document printed what was charged, fee and all.
        const fee =
          item.rate === undefined
            ? fxFeeFor(
                props.paymentMethods.find((m) => m.id === values.paymentMethodId),
                values.currency,
              )
            : undefined;
        toSave.push({
          parsed: values,
          ...(rate === undefined ? {} : { rate }),
          ...(fee === undefined ? {} : { feeRate: fee }),
        });
      }
      const ids =
        toSave.length === 0
          ? []
          : await saveImported(db, toSave, {
              baseCurrency: props.baseCurrency,
              now: systemClock.nowIso(),
              newId,
            });
      if (session.sharedId !== undefined) void forgetShared(session.sharedId);
      writeSession(undefined);
      if (methodsSaved > 0) toast(t('import:methodsAdded', { count: methodsSaved }));
      // The sheet closes; what is still to finish stays, and says where.
      if (unfinished.length > 0) toast(t('import:unfinished.waiting', { count: unfinished.length }));
      if (ids.length === 0) {
        props.onOpenChange(false);
        return;
      }
      const latest = toSave.reduce<LocalDate>(
        (d, item) => maxDate(d, item.parsed.date),
        toSave[0]?.parsed.date ?? props.today,
      );
      props.onSaved(latest);
      toast(t('import:added', { count: ids.length }), {
        duration: 10_000,
        action: {
          label: t('common:action.undo'),
          onClick: () => {
            void undoImport(db, ids, systemClock.nowIso()).then(() => {
              toast(t('common:tx.toastDeleted'), {
                action: {
                  label: t('common:action.undo'),
                  onClick: () => void redoImport(db, ids, systemClock.nowIso()),
                },
              });
            });
          },
        },
      });
      if (noRate > 0) toast.warning(t('import:noRate', { count: noRate }));
    } catch {
      toast.error(t('import:saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const editing = props.target.row === undefined ? undefined : session.items[props.target.row];
  const draft =
    props.target.card === undefined ? undefined : unfinished.find((u) => u.entry.key === props.target.card);
  const filling = draft?.item ?? session.methods.find((m) => m.id === props.target.card);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" aria-labelledby={titleId}>
        <SheetHeader>
          <SheetTitle id={titleId}>
            {filling !== undefined
              ? t('import:fillTitle', { name: foundName(filling, i18n.language) })
              : editing === undefined
                ? t('import:title')
                : t('import:editTitle')}
          </SheetTitle>
          {editing === undefined && filling === undefined ? (
            <SheetDescription>{t('import:body')}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="px-4 pb-4">
          {filling !== undefined && props.target.card !== undefined ? (
            <MethodPanel
              key={filling.id}
              item={filling}
              methods={props.paymentMethods}
              profiles={props.profiles}
              owner={draft === undefined ? owner : ownerOf(draft.entry)}
              onDone={(saved) => {
                const open = props.target.card;
                if (saved === undefined || open === undefined) {
                  props.onOpenCard(undefined);
                  return;
                }
                setSession((s) => ({
                  ...s,
                  methods: s.methods.map((m): MethodReviewItem =>
                    m.id === open ? { ...m, savedId: saved.id, ticked: false } : m,
                  ),
                  items: linkToCard(s.items, saved),
                }));
                toast(t('import:methodSaved', { name: saved.label }));
                if (draft === undefined) {
                  props.onOpenCard(undefined);
                  return;
                }
                // Finished: no longer kept. On to the next one still to finish, if any.
                void dropUnfinished(db, draft.entry.key);
                props.onOpenCard(
                  nextUnfinished(
                    unfinished.map((u) => u.entry.key),
                    draft.entry.key,
                  ),
                );
              }}
            />
          ) : editing !== undefined && props.target.row !== undefined ? (
            <RowEditor
              item={editing}
              profiles={props.profiles}
              categories={props.categories}
              methods={props.paymentMethods}
              translate={translate}
              onDone={(values) => {
                const index = props.target.row ?? -1;
                setSession((s) => ({
                  ...s,
                  items: s.items.map((item, i) =>
                    i === index ? { ...item, values, flags: [], ticked: true, confirmed: true } : item,
                  ),
                }));
                props.onOpenRow(undefined);
              }}
              onBack={() => {
                props.onOpenRow(undefined);
              }}
            />
          ) : (
            <div className="space-y-4">
              {session.stage === 'reading' ? null : (
                <UnfinishedGroup
                  entries={unfinished}
                  methods={props.paymentMethods}
                  onOpen={(key) => {
                    props.onOpenCard(key);
                  }}
                  onDelete={deleteUnfinished}
                />
              )}
              {session.stage === 'pick' ? (
                <Picker
                  files={session.files}
                  shared={session.sharedId !== undefined}
                  sharedGone={sharedGone}
                  onFiles={(files) => {
                    setSession((s) => ({ ...s, files }));
                  }}
                  onRead={() => void read(session.files)}
                />
              ) : session.stage === 'reading' ? (
                <Reading
                  states={session.states}
                  onStop={() => {
                    abort.current?.abort();
                  }}
                />
              ) : (
                <Review
                  session={session}
                  profiles={props.profiles}
                  categories={props.categories}
                  methodsList={props.paymentMethods}
                  translate={translate}
                  saving={saving}
                  onChange={(items) => {
                    setSession((s) => ({ ...s, items }));
                  }}
                  onMethods={(methods) => {
                    setSession((s) => ({ ...s, methods }));
                  }}
                  onOpenMethod={(id) => {
                    props.onOpenCard(id);
                  }}
                  onBatch={(batch) => {
                    setSession((s) => ({
                      ...s,
                      batch,
                      items: applyBatch(s.items, batch, props.paymentMethods),
                    }));
                  }}
                  onOpen={(index) => {
                    props.onOpenRow(index);
                  }}
                  onSave={() => void save()}
                  onAgain={() => {
                    setSession((s) => ({
                      ...s,
                      stage: 'pick',
                      files: [],
                      items: [],
                      methods: [],
                      drafted: 0,
                    }));
                  }}
                />
              )}
            </div>
          )}
        </div>

        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('import:discardTitle', { count: unsaved })}</AlertDialogTitle>
              <AlertDialogDescription>{t('import:discardBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('import:keep')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setConfirmDiscard(false);
                  close();
                }}
              >
                {t('import:discard')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Rows the household already has - occurrences of the same kind and amount a
 * day or two either side, a plan already running, a card's own fee - flagged
 * against what is in the database around the rows' dates.
 */
async function flagAgainstHousehold(
  rows: readonly FoundRow[],
  methods: readonly PaymentMethod[],
  aliases: Aliases,
  base: Currency,
  today: LocalDate,
): Promise<FoundRow[]> {
  const dates = rows.map((r) => r.date).filter((d): d is LocalDate => d !== undefined);
  const first = dates[0];
  if (first === undefined) return [...rows];
  const from = addDays(dates.reduce(minDate, first), -3);
  const to = addDays(dates.reduce(maxDate, first), 3);
  const transactions = await findCandidates(db, { profileId: ALL_PROFILES, from, to });
  const overrides = await findOverrides(
    db,
    transactions.map((tx) => tx.id),
  );
  const occurrences = transactions.flatMap((tx) =>
    expandOccurrences(
      tx,
      overrides.filter((o) => o.transactionId === tx.id),
      from,
      to,
      { today },
    ),
  );
  const cards = methods.filter((m) => m.type === 'credit_card' && m.isArchived === 0);
  const fees = cardFeeOccurrences({
    cards,
    occurrences,
    from,
    to,
    today,
    baseCurrency: base,
    profileId: ALL_PROFILES,
    allProfiles: ALL_PROFILES,
  });
  const method = (row: FoundRow) =>
    row.methodAlias === null
      ? undefined
      : methods.find((m) => m.id === aliases.methods.get(row.methodAlias ?? ''));
  return flagCardFees(flagExisting(rows, [...occurrences, ...fees]), method, cards);
}

function Picker({
  files,
  shared,
  sharedGone,
  onFiles,
  onRead,
}: {
  readonly files: readonly File[];
  readonly shared: boolean;
  readonly sharedGone: boolean;
  readonly onFiles: (files: File[]) => void;
  readonly onRead: () => void;
}) {
  const { t } = useTranslation('import');
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const add = (more: readonly File[]) => {
    onFiles([...files, ...more].slice(0, MAX_FILES));
  };

  // A screenshot pasted on a computer is a file like any other.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])];
      if (pasted.length > 0) {
        event.preventDefault();
        onFiles([...files, ...pasted].slice(0, MAX_FILES));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('paste', onPaste);
    };
  }, [files, onFiles]);

  return (
    <div className="space-y-4">
      {sharedGone ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t('sharedGone')}</p>
      ) : null}
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add([...event.dataTransfer.files]);
        }}
      >
        <FileUp className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('drop')}</p>
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          {t('choose')}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="import-input"
          onChange={(event) => {
            add([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </div>

      {files.length === 0 ? null : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{shared ? t('shared') : t('picked', { count: files.length })}</p>
          {shared ? <p className="text-xs text-muted-foreground">{t('sharedCheck')}</p> : null}
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {files.map((file, i) => (
              <li
                key={`${file.name}#${String(i)}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 truncate" dir="auto">
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('remove', { name: file.name })}
                  onClick={() => {
                    onFiles(files.filter((_, j) => j !== i));
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t('privacy')}{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {t('policy')}
          </a>
        </span>
      </p>

      <Button type="button" className="h-11 w-full" disabled={files.length === 0} onClick={onRead}>
        {files.length === 0 ? t('readNone') : t('read', { count: files.length })}
      </Button>
    </div>
  );
}

function Reading({ states, onStop }: { readonly states: readonly FileState[]; readonly onStop: () => void }) {
  const { t } = useTranslation('import');
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-xl border border-border text-sm" aria-live="polite">
        {states.map((state) => (
          <li key={state.file} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0 truncate" dir="auto">
              {state.name}
            </span>
            <FileStatus state={state} />
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" className="w-full" onClick={onStop}>
        {t('stop')}
      </Button>
    </div>
  );
}

function FileStatus({ state }: { readonly state: FileState }) {
  const { t } = useTranslation('import');
  switch (state.status) {
    case 'reading':
    case 'checking':
      return (
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t(`status.${state.status}`)}
        </span>
      );
    case 'done':
      return (
        <span className="shrink-0 text-muted-foreground">
          {state.partial ? t('status.partial') : t('status.found', { count: state.found })}
        </span>
      );
    case 'empty':
      return <span className="shrink-0 text-muted-foreground">{t('status.empty')}</span>;
    case 'failed':
      return <span className="shrink-0 text-destructive">{t(`error.${state.error}`)}</span>;
    case 'refused':
      return (
        <span className="max-w-[60%] shrink-0 text-end text-destructive">{t(`refused.${state.reason}`)}</span>
      );
  }
}

function Review({
  session,
  profiles,
  categories,
  methodsList,
  translate,
  saving,
  onChange,
  onMethods,
  onOpenMethod,
  onBatch,
  onOpen,
  onSave,
  onAgain,
}: {
  readonly session: ImportSession;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly methodsList: readonly PaymentMethod[];
  readonly translate: (category: Category) => string;
  readonly saving: boolean;
  readonly onChange: (items: ReviewItem[]) => void;
  readonly onMethods: (methods: MethodReviewItem[]) => void;
  readonly onOpenMethod: (id: string) => void;
  readonly onBatch: (batch: ImportSession['batch']) => void;
  readonly onOpen: (index: number) => void;
  readonly onSave: () => void;
  readonly onAgain: () => void;
}) {
  const { t } = useTranslation(['import', 'common', 'profiles']);
  const paidId = useId();
  const forId = useId();
  const items = session.items;
  const methods = session.methods;
  const failures = session.states.filter((s) => s.status === 'failed' || s.status === 'refused');

  // Everything found waits above, to be finished: only another file to offer here.
  if (items.length === 0 && methods.length === 0 && session.drafted > 0) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={onAgain}>
        {t('chooseOther')}
      </Button>
    );
  }
  if (items.length === 0 && methods.length === 0) {
    return (
      <div className="space-y-4">
        {failures.length === 0 ? null : <Reading states={session.states} onStop={() => undefined} />}
        <p className="text-sm">{t('nothing')}</p>
        <Button type="button" variant="outline" className="w-full" onClick={onAgain}>
          {t('chooseOther')}
        </Button>
      </div>
    );
  }

  const indexed = items.map((item, index) => ({ item, index }));
  const existing = indexed.filter(({ item }) => item.flags.some((f) => EXISTING.has(f)));
  const check = indexed.filter(
    ({ item }) =>
      !item.flags.some((f) => EXISTING.has(f)) &&
      item.flags.some((f) => BLOCKING.has(f) || f === 'total_mismatch'),
  );
  const ready = indexed.filter(
    ({ item }) => !check.some((c) => c.item === item) && !existing.some((e) => e.item === item),
  );
  const ticked = items.filter((i) => i.ticked).length + methods.filter((m) => m.ticked).length;
  const selectable = items.length + methods.filter(tickable).length;
  const setTicked = (value: boolean) => {
    onChange(
      items.map((item) => ({
        ...item,
        ticked: value && item.values !== undefined && saveable(item.values),
      })),
    );
    onMethods(methods.map((m) => ({ ...m, ticked: value && tickable(m) })));
  };

  return (
    <div className="space-y-4">
      {failures.length === 0 ? null : (
        <ul className="space-y-1 text-sm">
          {failures.map((state) => (
            <li key={state.file} className="flex items-start gap-1.5 text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span dir="auto">
                {state.name}: <FileStatus state={state} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {session.reconciliations
        .filter((r) => r.differenceMinor !== 0)
        .map((r) => (
          <p
            key={r.file}
            className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
          >
            <Trans
              i18nKey="totals"
              ns="import"
              components={{
                total: <Money minor={r.totalMinor} currency={r.currency} className="font-medium" />,
                sum: <Money minor={r.sumMinor} currency={r.currency} className="font-medium" />,
              }}
            />
          </p>
        ))}

      <MethodsGroup
        items={methods}
        methods={methodsList}
        onTick={(index, value) => {
          onMethods(methods.map((m, i) => (i === index ? { ...m, ticked: value && tickable(m) } : m)));
        }}
        onOpen={(index) => {
          const method = methods[index];
          if (method !== undefined) onOpenMethod(method.id);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {items.length === 0 ? null : (
          <div className="space-y-1">
            <span id={paidId} className="text-sm font-medium">
              {t('paidWith')}
            </span>
            <PaymentMethodField
              value={session.batch.methodId}
              onChange={(methodId) => {
                onBatch({ ...session.batch, methodId });
              }}
              profileId={session.batch.profileId}
              mode="one_time"
              methods={methodsList}
              labelledBy={paidId}
            />
          </div>
        )}
        {profiles.length < 2 ? null : (
          <div className="space-y-1">
            <span id={forId} className="text-sm font-medium">
              {t('forProfile')}
            </span>
            <select
              aria-labelledby={forId}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={session.batch.profileId}
              onChange={(event) => {
                onBatch({ ...session.batch, profileId: event.target.value });
              }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Group
        title={t('groups.check', { count: check.length })}
        rows={check}
        open
        methods={methodsList}
        {...{ categories, translate, onChange, onOpen, items }}
      />
      <Group
        title={t('groups.ready', { count: ready.length })}
        rows={ready}
        open
        methods={methodsList}
        {...{ categories, translate, onChange, onOpen, items }}
      />
      <Group
        title={t('groups.existing', { count: existing.length })}
        rows={existing}
        open={false}
        methods={methodsList}
        {...{ categories, translate, onChange, onOpen, items }}
      />

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setTicked(ticked < selectable);
          }}
        >
          {ticked < selectable ? t('selectAll') : t('selectNone')}
        </Button>
        <Button
          type="button"
          className="h-11 flex-1"
          disabled={ticked === 0 || saving}
          onClick={onSave}
          data-testid="import-add"
        >
          {t('add', { count: ticked })}
        </Button>
      </div>
    </div>
  );
}

function Group({
  title,
  rows,
  open,
  items,
  categories,
  methods,
  translate,
  onChange,
  onOpen,
}: {
  readonly title: string;
  readonly rows: readonly { readonly item: ReviewItem; readonly index: number }[];
  readonly open: boolean;
  readonly items: readonly ReviewItem[];
  readonly categories: readonly Category[];
  readonly methods: readonly PaymentMethod[];
  readonly translate: (category: Category) => string;
  readonly onChange: (items: ReviewItem[]) => void;
  readonly onOpen: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(open);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-border">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          className="flex w-full items-center justify-between px-3 py-2 text-start text-sm font-medium hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {title}
          <ChevronDown
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h3>
      {expanded ? (
        <ul className="divide-y divide-border border-t border-border" data-testid="import-rows">
          {rows.map(({ item, index }) => (
            <ReviewRow
              key={item.id}
              item={item}
              categories={categories}
              methods={methods}
              translate={translate}
              onTick={(ticked) => {
                onChange(items.map((x, i) => (i === index ? { ...x, ticked } : x)));
              }}
              onOpen={() => {
                onOpen(index);
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ReviewRow({
  item,
  categories,
  methods,
  translate,
  onTick,
  onOpen,
}: {
  readonly item: ReviewItem;
  readonly categories: readonly Category[];
  readonly methods: readonly PaymentMethod[];
  readonly translate: (category: Category) => string;
  readonly onTick: (ticked: boolean) => void;
  readonly onOpen: () => void;
}) {
  const { t, i18n } = useTranslation(['import', 'common', 'profiles']);
  const values = item.values;
  const name = [values?.note, item.found.description].find((n) => n !== undefined && n.trim() !== '') ?? '—';
  const category = categories.find((c) => c.id === values?.categoryId);
  const method = methods.find((m) => m.id === values?.paymentMethodId);
  const amount = values === undefined ? undefined : safeMinor(values.amount, values.currency);
  const shown = item.flags.filter((f) => f !== 'twice_in_document' || item.flags.length === 1);
  const flag = shown.find((f) => BLOCKING.has(f) || f === 'total_mismatch') ?? shown[0];
  const date = values !== undefined && isLocalDate(values.date) ? values.date : item.found.date;
  return (
    <li className="flex items-stretch">
      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center ps-1">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={item.ticked}
          disabled={values === undefined || !saveable(values)}
          onChange={(event) => {
            onTick(event.target.checked);
          }}
          aria-label={t('include', { name })}
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('edit', { name })}
        className="min-w-0 flex-1 px-2 py-2 text-start hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium" dir="auto">
            {name}
          </span>
          {amount === undefined || values === undefined ? null : (
            <Money
              minor={values.kind === 'income' ? amount : -amount}
              currency={values.currency}
              signMode={values.kind === 'income' ? 'always' : 'negative'}
              className={cn('shrink-0 text-sm', values.kind === 'income' && 'text-income')}
            />
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[
            date === undefined
              ? undefined
              : formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
            category === undefined ? undefined : translate(category),
            method === undefined ? undefined : methodDisplayName(method, t),
            item.found.plan === null
              ? undefined
              : t('plan', { number: item.found.plan.number, count: item.found.plan.count }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {flag === undefined ? null : (
          <span
            className={cn(
              'mt-0.5 flex items-center gap-1 text-xs',
              BLOCKING.has(flag) || flag === 'total_mismatch'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-muted-foreground',
            )}
          >
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            {t(`flag.${flag}`)}
          </span>
        )}
        {item.found.otherRead?.amountMinor === undefined ||
        item.found.otherRead.currency === undefined ? null : (
          <span className="block text-xs text-muted-foreground">
            <Trans
              i18nKey="otherRead"
              ns="import"
              values={{
                date:
                  item.found.otherRead.date === undefined
                    ? '?'
                    : formatLocalDate(item.found.otherRead.date, i18n.language, {
                        day: 'numeric',
                        month: 'short',
                      }),
              }}
              components={{
                amount: (
                  <Money minor={item.found.otherRead.amountMinor} currency={item.found.otherRead.currency} />
                ),
              }}
            />
          </span>
        )}
      </button>
    </li>
  );
}

function safeMinor(amount: string, currency: Currency): number | undefined {
  try {
    return toMinor(amount, currency);
  } catch {
    return undefined;
  }
}

/** One found transaction, opened: what the person needs to correct it, and nothing else. */
function RowEditor({
  item,
  profiles,
  categories,
  methods,
  translate,
  onDone,
  onBack,
}: {
  readonly item: ReviewItem;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly methods: readonly PaymentMethod[];
  readonly translate: (category: Category) => string;
  readonly onDone: (values: TxFormValues) => void;
  readonly onBack: () => void;
}) {
  const { t } = useTranslation(['import', 'common']);
  const ids = {
    kind: useId(),
    note: useId(),
    amount: useId(),
    date: useId(),
    category: useId(),
    method: useId(),
  };
  const [values, setValues] = useState<TxFormValues>(
    () =>
      item.values ?? {
        profileId: profiles[0]?.id ?? '',
        kind: item.found.kind,
        categoryId: '',
        paymentMethodId: '',
        amount: '',
        currency: item.found.currency ?? 'ILS',
        date: item.found.date ?? todayLocal(new Date(systemClock.nowMs())),
        note: item.found.description,
        mode: 'one_time',
        dayOfMonth: '1',
        endDate: '',
        installmentCount: '',
        frequency: '',
        annualRate: '',
        rateBasis: 'prime',
        primeMargin: '',
        primeRate: '',
        partialFirst: false,
      },
  );
  const [showError, setShowError] = useState(false);
  const set = (patch: Partial<TxFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
  };
  const ok = saveable(values);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ok) {
          setShowError(true);
          return;
        }
        onDone(values);
      }}
    >
      {item.flags.length === 0 ? null : (
        <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">
          {item.flags.map((flag) => (
            <li key={flag} className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t(`flag.${flag}`)}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1" role="radiogroup" aria-labelledby={ids.kind}>
        <span id={ids.kind} className="text-sm font-medium">
          {t('kind')}
        </span>
        <div className="flex gap-2">
          {(['expense', 'income'] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              role="radio"
              aria-checked={values.kind === kind}
              variant={values.kind === kind ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => {
                set({
                  kind,
                  categoryId: categoriesFor(categories, kind)[0]?.id ?? '',
                  ...(kind === 'income' ? { paymentMethodId: '' } : {}),
                });
              }}
            >
              {t(kind)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.note} className="text-sm font-medium">
          {t('description')}
        </label>
        <Input
          id={ids.note}
          dir="auto"
          value={values.note}
          onChange={(event) => {
            set({ note: event.target.value });
          }}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.amount} className="text-sm font-medium">
          {t('amount')} ({values.currency})
        </label>
        <Input
          id={ids.amount}
          dir="ltr"
          inputMode="decimal"
          value={values.amount}
          onChange={(event) => {
            set({ amount: event.target.value });
          }}
        />
      </div>

      <div className="space-y-1">
        <span id={ids.date} className="text-sm font-medium">
          {t('date')}
        </span>
        <DateField
          value={
            isLocalDate(values.date)
              ? values.date
              : (item.found.date ?? todayLocal(new Date(systemClock.nowMs())))
          }
          onChange={(date) => {
            set({ date });
          }}
          labelledBy={ids.date}
        />
      </div>

      <div className="space-y-1">
        <span id={ids.category} className="text-sm font-medium">
          {t('category')}
        </span>
        <CategoryField
          value={values.categoryId}
          onChange={(categoryId) => {
            set({ categoryId });
          }}
          kind={values.kind}
          categories={categories}
          labelledBy={ids.category}
          translate={translate}
        />
      </div>

      {values.kind === 'expense' ? (
        <div className="space-y-1">
          <span id={ids.method} className="text-sm font-medium">
            {t('paidWith')}
          </span>
          <PaymentMethodField
            value={values.paymentMethodId}
            onChange={(paymentMethodId) => {
              set({ paymentMethodId });
            }}
            profileId={values.profileId}
            mode={values.mode}
            methods={methods}
            labelledBy={ids.method}
          />
        </div>
      ) : null}

      {showError && !ok ? <p className="text-sm text-destructive">{t('flag.not_saveable')}</p> : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          {t('back')}
        </Button>
        <Button type="submit" className="flex-1">
          {t('done')}
        </Button>
      </div>
    </form>
  );
}
