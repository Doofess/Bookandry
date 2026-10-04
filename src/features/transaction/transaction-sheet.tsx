import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from 'cn';
import { History, Sparkles } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';

import { usePrime } from '@/app/prime';
import { AmountInput } from '@/components/amount-input';
import { CurrencySelect } from '@/components/currency-select';
import { Money } from '@/components/money';
import { Segmented } from '@/components/segmented';
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
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { db } from '@/db/db';
import { buildMoney, saveNewTransaction } from '@/db/save-transaction';
import { applySeriesEdit } from '@/db/series-edit';
import { cardCreditRate, fxFeeFor } from '@/domain/cards';
import { planSeriesEdit, type EditScope, type SeriesEditError } from '@/domain/series-edit';
import { buildPatch, isEmptyPatch, isInstallmentPlan, occurrenceToFormValues } from '@/domain/tx-edit';
import {
  defaultFormValues,
  firstOccurrenceDate,
  partialFirstOf,
  pastPaymentsOf,
  maxPaymentsFor,
  MIN_INSTALLMENTS,
  NOTE_MAX_LENGTH,
  txFormSchema,
  type TxFormParsed,
  type TxFormValues,
} from '@/domain/tx-form';
import { categoriesFor, methodFits } from '@/domain/tx-options';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import { formatLocalDate, isLocalDate, monthsBetween, parseLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { toDecimalString, toMinor } from '@/lib/money';
import type { Category, PaymentMethod, Profile } from '@/types/domain';
import type { Currency, Kind, LocalDate, Minor } from '@/types/money';

import { CardChargeNote } from './card-charge-note';
import { CategoryField } from './category-field';
import { DateField } from './date-field';
import { PaymentMethodField } from './payment-method-field';
import { RateField } from './rate-field';
import { RecurrenceFields } from './recurrence-fields';
import { ScopeChooser } from './scope-chooser';
import { useAutoCategory } from './use-auto-category';
import { useRateField } from './use-rate-field';
import {
  useEditTarget,
  type EditTarget,
  type EditTargetState,
  type SheetTarget,
} from './use-transaction-sheet';

/** The built-in category a loan's repayments start in. */
const LOANS_CATEGORY_ID = 'cat.loans';

/**
 * The interest a given card charges, or '' for no card and no rate.
 *
 * '' is a real answer rather than a missing one: a plan at no interest is
 * arithmetically תשלומים, which is a coherent thing to have chosen.
 */
function rateOfCard(methods: readonly PaymentMethod[], methodId: string, primeRate: string): string {
  return cardCreditRate(
    methods.find((method) => method.id === methodId),
    primeRate,
  );
}

/**
 * The add-transaction sheet.
 *
 * A bottom sheet rather than a route, because the feed is the context: people
 * add a transaction while looking at the others, and a full-page form loses
 * that. It is still a history entry (see `useTransactionSheet`) so Android's
 * hardware back closes the sheet instead of the app.
 *
 * Validation is split in two, deliberately:
 *
 *  - `txFormSchema` covers everything a schema CAN cover, synchronously.
 *  - the rate is resolved by `useRateField`, because it needs IndexedDB and
 *    possibly the network. Folding it into the schema would make every
 *    keystroke in the amount field revalidate against a promise.
 *
 * Both must be satisfied to submit, and the rate is the one that can block a
 * save outright - which happens only for a currency pair this install has
 * genuinely never seen a rate for.
 */
export function TransactionSheet({
  target,
  onOpenChange,
  profiles,
  categories,
  paymentMethods,
  activeProfileId,
  baseCurrency,
  today,
  onSaved,
}: {
  readonly target: SheetTarget;
  readonly onOpenChange: (open: boolean) => void;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  /** The feed's active profile, or ALL_PROFILES - which is not a valid owner. */
  readonly activeProfileId: string;
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (date: LocalDate) => void;
}) {
  const { t } = useTranslation(['common', 'categories', 'profiles']);
  const titleId = useId();
  const editing = useEditTarget(target, today);
  const prime = usePrime();

  // A transaction must belong to ONE profile, so the merged "All" view cannot
  // seed it; the first profile is the sensible default and the field is shown
  // whenever there is a choice to make.
  const defaultProfileId = useMemo(
    () =>
      profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : (profiles[0]?.id ?? ''),
    [profiles, activeProfileId],
  );

  const adding = useMemo<TxFormValues>(
    () => ({
      ...defaultFormValues({
        profileId: defaultProfileId,
        currency: baseCurrency,
        today,
        primeRate: prime.primeRate,
      }),
      categoryId: categoriesFor(categories, 'expense')[0]?.id ?? '',
    }),
    [defaultProfileId, baseCurrency, today, categories, prime.primeRate],
  );

  const isAdd = target.mode === 'add';
  const open = target.mode !== 'closed';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" aria-labelledby={titleId}>
        <SheetHeader>
          <SheetTitle id={titleId}>{isAdd ? t('tx.addTitle') : t('tx.editTitle')}</SheetTitle>
          <SheetDescription>{isAdd ? t('tx.addBody') : t('tx.editBody')}</SheetDescription>
        </SheetHeader>

        {/*
         * Keyed, so every opening starts from the right values.
         *
         * Without the key the sheet keeps the previous draft - a half-typed
         * amount, a rate looked up for a currency the user was only browsing -
         * and "add another", or opening a different row, silently inherits it.
         */}
        {isAdd ? (
          <TransactionForm
            key="add"
            initial={adding}
            profiles={profiles}
            categories={categories}
            paymentMethods={paymentMethods}
            baseCurrency={baseCurrency}
            today={today}
            onSaved={onSaved}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        ) : target.mode === 'edit' ? (
          <EditBody
            key={`${target.transactionId}#${target.at}`}
            state={editing}
            profiles={profiles}
            categories={categories}
            paymentMethods={paymentMethods}
            baseCurrency={baseCurrency}
            today={today}
            onSaved={onSaved}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EditBody({
  state,
  profiles,
  categories,
  paymentMethods,
  baseCurrency,
  today,
  onSaved,
  onCancel,
}: {
  readonly state: EditTargetState;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (date: LocalDate) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="space-y-3 px-4 pb-6" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (state.status === 'gone') {
    /*
     * The record was deleted elsewhere while this sheet was open.
     *
     * A PWA people leave open in two tabs makes this ordinary rather than
     * exotic, and the live query is what notices. Saving anyway would
     * resurrect a row the user deleted somewhere else - silently, and with
     * whatever they had half-typed here written into it.
     */
    return (
      <div className="px-4 pb-6">
        <p role="alert" className="text-sm text-muted-foreground">
          {t('tx.gone')}
        </p>
        <Button type="button" variant="outline" onClick={onCancel} className="mt-4 w-full">
          {t('action.close')}
        </Button>
      </div>
    );
  }

  return (
    <TransactionForm
      initial={occurrenceToFormValues(state.target.occurrence, state.target.transaction)}
      editing={state.target}
      profiles={profiles}
      categories={categories}
      paymentMethods={paymentMethods}
      baseCurrency={baseCurrency}
      today={today}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function TransactionForm({
  initial,
  editing,
  profiles,
  categories,
  paymentMethods,
  baseCurrency,
  today,
  onSaved,
  onCancel,
}: {
  readonly initial: TxFormValues;
  /** Absent when adding. */
  readonly editing?: EditTarget;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (date: LocalDate) => void;
  readonly onCancel: () => void;
}) {
  const { t, i18n } = useTranslation(['common', 'categories', 'profiles']);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  /*
   * Default scope 'one', not 'all'.
   *
   * The safe default is the one that touches the least. Someone correcting
   * this month's electricity bill means this month's bill; if they meant the
   * standing amount they will say so, and the control is right there. A default
   * of 'all' quietly rewrites a year of history on a typo fix.
   */
  const [scope, setScope] = useState<EditScope>('one');
  const prime = usePrime();
  /** A rule change that would discard per-occurrence edits, awaiting a yes. */
  const [pendingDrop, setPendingDrop] = useState<{ count: number; run: () => void } | undefined>(undefined);

  const isSeries = editing !== undefined && editing.transaction.recurrence.type !== 'one_time';
  const isPlan = editing !== undefined && isInstallmentPlan(editing.transaction.recurrence);
  // A one-time transaction has exactly one occurrence, so there is nothing to
  // scope: it edits as a whole either way.
  const effectiveScope: EditScope = isSeries ? scope : 'all';

  const kindId = useId();
  const amountId = useId();
  const currencyId = useId();
  const categoryId = useId();
  const methodId = useId();
  const dateId = useId();
  const noteId = useId();
  const partialId = useId();
  const profileLabelId = useId();

  const form = useForm<TxFormValues, unknown, TxFormParsed>({
    defaultValues: initial,
    resolver: zodResolver(txFormSchema),
    // Errors appear once a field has been visited, not on the first keystroke:
    // an amount field that turns red at "4" on the way to "45" is telling the
    // user off for typing.
    mode: 'onTouched',
  });

  /*
   * `useWatch`, not `form.watch()`.
   *
   * `watch()` is a function handed back by `useForm`, and the React Compiler
   * refuses to memoise any component that calls one - it cannot know the
   * function is stable, so it skips the whole component rather than risk stale
   * UI. `useWatch` is a real hook with a subscription, so the compiler can see
   * what it depends on.
   */
  const values = useWatch({ control: form.control, defaultValue: initial }) as TxFormValues;
  const amountMinor = parseAmount(values.amount, values.currency);
  /**
   * A rule that repeats on its own, or a loan, whose date is therefore its
   * first payment. A purchase in תשלומים keeps "Date": that is the day it was bought.
   */
  const repeats =
    values.mode === 'monthly' ||
    values.mode === 'yearly' ||
    values.mode === 'standing_order' ||
    values.mode === 'loan';
  // Only for a new rule: an edit already shows its past in the feed.
  const past = editing === undefined ? pastPaymentsOf(values, today) : undefined;
  /** The part-month the first payment leaves, whether or not it is being charged. */
  const partMonth = editing === undefined ? partialFirstOf({ ...values, partialFirst: true }) : undefined;

  const rateField = useRateField({
    amount: values.amount,
    currency: values.currency,
    baseCurrency,
    // The field is a string until the schema validates it. Looking a rate up
    // for today while the user is mid-edit is harmless; `as LocalDate` would
    // hand an arbitrary string to `parseLocalDate` and throw in a render.
    date: isLocalDate(values.date) ? values.date : today,
    today,
  });

  const { setValue } = form;

  /*
   * Changing income/expense invalidates the category.
   *
   * Categories are kind-specific, so a Salary left selected on an expense is
   * not merely odd - it files the row under a category the feed groups with the
   * opposite sign. Reset to the first category of the new kind rather than to
   * empty, so the form does not gain an error the user did not cause.
   *
   * An event handler rather than an effect. The category becomes wrong at the
   * instant the kind changes and at no other time; synchronising it afterwards
   * would render one frame of a form that contradicts itself, and would put a
   * setState in an effect body to do it.
   */
  const translateCategory = useCallback((category: Category) => categoryDisplayName(category, t), [t]);

  const auto = useAutoCategory({
    categories,
    translate: translateCategory,
    choose: useCallback(
      (id: string) => {
        setValue('categoryId', id, { shouldValidate: true });
      },
      [setValue],
    ),
    chosenByPerson: editing !== undefined,
  });

  const changeKind = useCallback(
    (next: Kind) => {
      setValue('kind', next);
      const current = categories.find((category) => category.id === form.getValues('categoryId'));
      if (current?.kind === next) return;
      setValue('categoryId', categoriesFor(categories, next)[0]?.id ?? '', { shouldValidate: false });
      // The same name, now as the other kind: "Refund from Amazon" is income.
      auto.typeChosen(undefined, form.getValues('note'), next);
      auto.nameChanged(form.getValues('note'), next);
    },
    [categories, setValue, form, auto],
  );

  const errorText = useCallback(
    (code: string | undefined): string | undefined => {
      /*
       * Schema codes to sentences, as a switch rather than a lookup table.
       *
       * The schema emits stable codes instead of English, so a rule can be
       * renamed without touching two locales. Resolving them here keeps every
       * key a literal, which is what makes a missing translation a tsc error
       * rather than a code leaking into the UI.
       */
      switch (code) {
        case 'amount_required':
          return t('tx.errAmountRequired');
        case 'amount_invalid':
          return t('tx.errAmountInvalid');
        case 'amount_not_positive':
          return t('tx.errAmountNotPositive');
        case 'category_required':
          return t('tx.errCategoryRequired');
        case 'profile_required':
          return t('tx.errProfileRequired');
        case 'note_too_long':
          return t('tx.errNoteTooLong', { count: NOTE_MAX_LENGTH });
        case 'day_out_of_range':
        case 'day_invalid':
          return t('tx.errDayOutOfRange');
        case 'installments_out_of_range':
          return t('tx.errInstallmentsOutOfRange', {
            min: MIN_INSTALLMENTS,
            // 60 on a card, 360 on a loan.
            max: maxPaymentsFor(form.getValues('mode')),
          });
        case 'rate_out_of_range':
          return t('tx.errRateOutOfRange');
        case 'margin_invalid':
          return t('tx.errMarginInvalid');
        case 'frequency_required':
          return t('tx.errFrequencyRequired');
        case 'end_before_start':
          return t('tx.errEndBeforeStart');
        case 'invalid_date':
        case 'currency_invalid':
          return t('tx.errInvalidDate');
        default:
          return undefined;
      }
    },
    [t, form],
  );

  /**
   * The planner's refusals, in the user's words.
   *
   * Both of the last two are cases the form is supposed to prevent by hiding or
   * disabling the control, so reaching one means the form and the planner have
   * disagreed - which is exactly when a vague message is least useful.
   */
  const editErrorText = useCallback(
    (error: SeriesEditError): string => {
      switch (error.kind) {
        case 'not_a_slot':
          return t('tx.notASlot');
        case 'rule_change_needs_series':
          return t('tx.ruleNeedsSeries');
        case 'move_needs_single':
          return t('tx.moveNeedsSingle');
      }
    },
    [t],
  );

  const formErrors = form.formState.errors;
  const errors = useMemo<Partial<Record<keyof TxFormValues, string>>>(() => {
    const out: Partial<Record<keyof TxFormValues, string>> = {};
    for (const [field, error] of Object.entries(formErrors)) {
      const message = errorText(error.message);
      if (message !== undefined) out[field as keyof TxFormValues] = message;
    }
    return out;
  }, [formErrors, errorText]);

  const rateBlocked = rateField.resolution.status === 'invalid';

  const submit = form.handleSubmit(async (parsed) => {
    setSaveError(undefined);
    const resolution = rateField.resolution;
    if (resolution.status === 'invalid') return;

    const rate =
      resolution.status === 'resolved'
        ? {
            rate: resolution.rate,
            rateDate: resolution.rateDate,
            rateSource: resolution.rateSource,
          }
        : undefined;
    // The paying card's foreign-currency fee, snapshotted with the rate.
    const feeRate = fxFeeFor(
      paymentMethods.find((m) => m.id === parsed.paymentMethodId),
      parsed.currency,
    );

    try {
      if (editing === undefined) {
        const save = (input: typeof parsed) =>
          saveNewTransaction(db, {
            parsed: input,
            baseCurrency,
            ...(rate === undefined ? {} : { rate }),
            ...(feeRate === undefined ? {} : { feeRate }),
            now: systemClock.nowIso(),
            newId,
          });
        const partial = parsed.partialFirst;
        if (partial !== undefined) {
          /*
           * Two rows, written together or not at all: the part-month as a
           * one-off on the day it started, and the rule from its first full
           * billing day. A rule can only pay on its billing day, so the
           * part-month cannot be one of its own payments.
           */
          await db.transaction('rw', [db.transactions, db.overrides], async () => {
            await save({
              ...parsed,
              amountMinor: partial.amountMinor,
              recurrence: { type: 'one_time' },
              installmentTotalMinor: undefined,
              partialFirst: undefined,
            });
            await save({ ...parsed, date: partial.nextBilling });
          });
          onSaved(parsed.date);
          return;
        }
        const result = await save(parsed);
        /*
         * The first OCCURRENCE, not the transaction's date.
         *
         * They are not the same thing for a series: a bill entered on the 15th
         * with a due day of 10 first lands on the 10th of NEXT month, so
         * jumping to the transaction's own month shows an empty feed and the
         * save looks like it did nothing. Found by saving one in a browser.
         */
        onSaved(firstOccurrenceDate(result.transaction.date, result.transaction.recurrence));
        return;
      }

      /*
       * The money is rebuilt unconditionally and then COMPARED, rather than
       * rebuilt only when the amount changed.
       *
       * A snapshot is seven fields, and the interesting changes are not always
       * the amount: switching currency, or moving the date on a foreign row,
       * re-derives the rate too. Building it and diffing is one code path;
       * deciding up front which edits need a new snapshot is four, and the one
       * that gets it wrong stores a stale converted amount that every
       * calculator then trusts.
       */
      const money = buildMoney({
        parsed,
        baseCurrency,
        ...(rate === undefined ? {} : { rate }),
        ...(feeRate === undefined ? {} : { feeRate }),
        now: systemClock.nowIso(),
        newId,
      });

      const patch = buildPatch({
        parsed,
        occurrence: editing.occurrence,
        transaction: editing.transaction,
        scope: effectiveScope,
        money,
      });

      if (isEmptyPatch(patch)) {
        // Nothing changed. Writing anyway would bump updatedAt and hand the
        // next import merge a spurious winner.
        onSaved(editing.occurrence.date);
        return;
      }

      /*
       * Plan first, apply second - two steps, deliberately.
       *
       * `planSeriesEdit` is pure, so it can be run to ASK a question without
       * writing anything: it reports how many per-occurrence edits a rule
       * change would discard, which is what lets the confirmation name a number
       * instead of warning in the abstract. The plan's words: a destructive
       * multi-row op gets a typed confirm, not a six-second undo window.
       */
      const planned = planSeriesEdit({
        transaction: editing.transaction,
        overrides: editing.overrides,
        scope: effectiveScope,
        // The ORIGINAL slot, never the moved date: it is the override's key.
        at: editing.occurrence.originalDate,
        patch,
        today,
        now: systemClock.nowIso(),
        newId,
      });

      if (!planned.ok) {
        setSaveError(editErrorText(planned.error));
        return;
      }

      const { plan } = planned;
      const run = async (): Promise<void> => {
        await applySeriesEdit(db, plan);
        onSaved(patch.date ?? editing.occurrence.date);
      };

      const dropped = plan.warnings.find((w) => w.kind === 'overrides_dropped')?.count ?? 0;
      if (dropped > 0) {
        setPendingDrop({ count: dropped, run: () => void run() });
        return;
      }

      await run();
    } catch {
      // The write is one Dexie transaction, so a failure changed nothing - and
      // saying so is the difference between retrying and checking for a
      // half-saved row that does not exist.
      setSaveError(t('tx.errSaveFailed'));
    }
  });

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="space-y-4 px-4 pb-6"
      noValidate
    >
      {isSeries ? <ScopeChooser value={scope} onChange={setScope} at={editing.occurrence.date} /> : null}

      <div className="space-y-1.5">
        <Label id={kindId}>{t('tx.kind')}</Label>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Segmented<Kind>
              value={field.value}
              labelledBy={kindId}
              onChange={changeKind}
              options={[
                { value: 'expense', label: t('tx.expense') },
                { value: 'income', label: t('tx.income') },
              ]}
            />
          )}
        />
      </div>

      {/* What it was, in the person's words - and from it, the category. */}
      <div className="space-y-1.5">
        <Label htmlFor={noteId}>{t('tx.name')}</Label>
        <Input
          id={noteId}
          placeholder={t('tx.namePlaceholder')}
          autoComplete="off"
          aria-invalid={errors.note !== undefined}
          {...form.register('note', {
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              auto.nameChanged(event.target.value, form.getValues('kind'));
            },
          })}
        />
        {errors.note === undefined ? null : <p className="text-xs text-destructive">{errors.note}</p>}
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={amountId}>{t('tx.amount')}</Label>
          <Controller
            control={form.control}
            name="amount"
            render={({ field }) => (
              <AmountInput
                id={amountId}
                currency={values.currency}
                value={parseAmount(field.value, values.currency)}
                onChange={(minor) => {
                  // Minor units back to the display string the form holds.
                  // Safe to round-trip on every keystroke: AmountInput keeps
                  // its own text and only re-syncs when the incoming value
                  // disagrees with what that text parses to, so "45." is not
                  // rewritten to "45.00" under the cursor.
                  field.onChange(minor === undefined ? '' : toDecimalString(minor, values.currency));
                }}
                aria-invalid={errors.amount !== undefined}
                aria-describedby={`${amountId}-error`}
              />
            )}
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor={currencyId} id={`${currencyId}-label`}>
            {t('currency.label')}
          </Label>
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <CurrencySelect
                id={currencyId}
                value={field.value}
                onChange={field.onChange}
                aria-labelledby={`${currencyId}-label`}
              />
            )}
          />
        </div>
      </div>
      {errors.amount === undefined ? null : (
        <p id={`${amountId}-error`} className="text-xs text-destructive">
          {errors.amount}
        </p>
      )}

      {values.currency === baseCurrency ? null : (
        <RateField
          state={rateField}
          currency={values.currency}
          baseCurrency={baseCurrency}
          onRateChange={rateField.setRate}
          onChargedChange={rateField.setCharged}
          onEntryChange={rateField.setEntry}
        />
      )}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label id={categoryId}>{t('tx.category')}</Label>
          {/* Said quietly, beside the field it is about, and announced once. */}
          <p className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
            {auto.status === 'idle' ? null : (
              <>
                <Sparkles
                  className={cn('size-3.5', auto.status === 'thinking' && 'motion-safe:animate-pulse')}
                  aria-hidden="true"
                />
                {auto.status === 'thinking' ? t('tx.autoThinking') : t('tx.autoChosen')}
              </>
            )}
          </p>
        </div>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <CategoryField
              value={field.value}
              onChange={(id) => {
                field.onChange(id);
                auto.choseManually();
              }}
              kind={values.kind}
              categories={categories}
              labelledBy={categoryId}
              invalid={errors.categoryId !== undefined}
              translate={translateCategory}
            />
          )}
        />
        {errors.categoryId === undefined ? null : (
          <p className="text-xs text-destructive">{errors.categoryId}</p>
        )}
      </div>

      {values.kind === 'expense' ? (
        <div className="space-y-1.5">
          <Label id={methodId}>{t('tx.paymentMethod')}</Label>
          <Controller
            control={form.control}
            name="paymentMethodId"
            render={({ field }) => (
              <PaymentMethodField
                value={field.value}
                onChange={(methodId_) => {
                  field.onChange(methodId_);
                  /*
                   * Re-price the plan against the card that will actually be
                   * charged.
                   *
                   * The rate belongs to the card, so switching cards mid-form
                   * has to move the rate with it - otherwise the plan is priced
                   * with one card's interest and charged to another's, and
                   * nothing on screen says so. Done in the CHANGE HANDLER and
                   * not an effect: React Compiler forbids setState in an effect
                   * body, and an effect would also fight the user's own typing.
                   */
                  if (values.mode === 'credit') {
                    form.setValue('annualRate', rateOfCard(paymentMethods, methodId_, prime.primeRate), {
                      shouldValidate: true,
                    });
                  }
                }}
                profileId={values.profileId}
                mode={values.mode}
                methods={paymentMethods}
                labelledBy={methodId}
              />
            )}
          />
          <CardChargeNote
            method={paymentMethods.find((m) => m.id === values.paymentMethodId)}
            date={values.date}
            currency={values.currency}
            amountMinor={amountMinor}
          />
        </div>
      ) : null}

      {/* One profile makes the switcher pure noise - as on the feed. */}
      {profiles.length > 1 ? (
        <div className="space-y-1.5">
          <Label id={profileLabelId}>{t('tx.profile')}</Label>
          <Controller
            control={form.control}
            name="profileId"
            render={({ field }) => (
              <Segmented
                value={field.value}
                labelledBy={profileLabelId}
                onChange={field.onChange}
                size="sm"
                options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
              />
            )}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label id={dateId}>{repeats ? t('tx.dateFirst') : t('tx.date')}</Label>
        <Controller
          control={form.control}
          name="date"
          render={({ field }) => (
            <DateField
              value={field.value as LocalDate}
              onChange={(next) => {
                field.onChange(next);
                // A date picked for a repeating rule is its first payment, so
                // the day it repeats on follows it: a standing order from
                // 01/11/2025 is paid on the 1st. Still its own field, for a
                // rule that does land elsewhere.
                if (values.mode !== 'one_time') {
                  setValue('dayOfMonth', String(parseLocalDate(next).day), { shouldValidate: true });
                }
                // A first payment someone picked is one that may start mid-month.
                setValue('partialFirst', true);
              }}
              labelledBy={dateId}
              invalid={errors.date !== undefined}
              // Moving a date means moving ONE occurrence. Applied to a rule it
              // silently becomes "move every one of them", which is why the
              // planner refuses it outside scope 'one'.
              disabled={editing !== undefined && effectiveScope !== 'one'}
            />
          )}
        />
        {/* Starting in the past fills the past in; said before saving, not discovered after. */}
        {past === undefined ? null : (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <History className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t('tx.pastPayments', {
              count: past.count,
              from: formatLocalDate(past.first, i18n.language, { month: 'long', year: 'numeric' }),
              to: formatLocalDate(past.last, i18n.language, { month: 'long', year: 'numeric' }),
            })}
          </p>
        )}
      </div>

      {isPlan ? (
        /*
         * An instalment plan is shown, not edited.
         *
         * Changing the count or the total would have to re-split the payments
         * AND rewrite the first-occurrence remainder override in step, or the
         * plan stops summing to its total - the one invariant תשלומים has. A
         * read-only line and a clear instruction beat a control that silently
         * breaks it.
         */
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium">{t('tx.installmentPlan')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('tx.installmentReadonly', {
              index: installmentIndex(editing),
              count: installmentCountOf(editing),
            })}
          </p>
        </div>
      ) : editing !== undefined && effectiveScope === 'one' ? null : ( // editor is absent rather than present and rejected on submit. // Scope 'one' cannot change the rule - the planner refuses it - so the
        <RecurrenceFields
          values={values}
          onChange={(patch) => {
            // Applied key by key rather than by spreading over Object.entries:
            // the generic form of setValue cannot type a (key, value) pair from
            // a loop, and the `as never` it takes to compile would let a typo
            // through silently.
            if (patch.mode !== undefined) setValue('mode', patch.mode);
            // A method this kind of transaction does not take (a cheque on a
            // standing order, cash on a קרדיט) is let go rather than carried
            // into it: the picker no longer offers it, so nothing on screen
            // would explain it.
            const method = paymentMethods.find((m) => m.id === values.paymentMethodId);
            const methodKept =
              patch.mode === undefined || method === undefined || methodFits(method, patch.mode);
            if (!methodKept) setValue('paymentMethodId', '');
            if (patch.dayOfMonth !== undefined) setValue('dayOfMonth', patch.dayOfMonth);
            if (patch.endDate !== undefined) setValue('endDate', patch.endDate);
            if (patch.installmentCount !== undefined) setValue('installmentCount', patch.installmentCount);
            // A loan's repayments are filed under Loans, unless a category was
            // picked by hand: the type is a better answer than a guess from
            // the name, and a worse one than the person's own choice.
            if (patch.mode !== undefined) {
              auto.typeChosen(
                patch.mode === 'loan' ? LOANS_CATEGORY_ID : undefined,
                form.getValues('note'),
                values.kind,
              );
            }
            if (patch.mode === 'credit') {
              // Entering קרדיט: the card's rate is the answer to a question the
              // user should not have to be asked, so it arrives filled in.
              setValue(
                'annualRate',
                methodKept ? rateOfCard(paymentMethods, values.paymentMethodId, prime.primeRate) : '',
              );
            } else if (patch.annualRate !== undefined) {
              setValue('annualRate', patch.annualRate, { shouldValidate: true });
            }
            if (patch.rateBasis !== undefined)
              setValue('rateBasis', patch.rateBasis, { shouldValidate: true });
            if (patch.primeMargin !== undefined) {
              setValue('primeMargin', patch.primeMargin, { shouldValidate: true });
            }
            if (patch.frequency !== undefined) {
              // Validated on change, not on blur: it is a segmented control, so
              // there is no blur to wait for, and the error would otherwise sit
              // on screen after the user had answered it.
              setValue('frequency', patch.frequency, { shouldValidate: true });
            }
          }}
          isExpense={values.kind === 'expense'}
          submitted={form.formState.isSubmitted}
          currency={values.currency}
          amountMinor={amountMinor}
          errors={errors}
          prime={prime}
        />
      )}

      {/* A part-month before the first full payment: charge only for its days, or the whole month. */}
      {partMonth === undefined ? null : (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor={partialId}>{t('tx.partialFirst')}</Label>
            <p className="text-xs text-muted-foreground">
              <Trans
                i18nKey={values.partialFirst === true ? 'tx.partialFirstOn' : 'tx.partialFirstOff'}
                values={{
                  days: partMonth.days,
                  period: partMonth.periodDays,
                  start: formatLocalDate(values.date as LocalDate, i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  }),
                  next: formatLocalDate(partMonth.nextBilling, i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  }),
                }}
                components={{
                  amount: <Money minor={partMonth.amountMinor} currency={values.currency} announce={false} />,
                }}
              />
            </p>
          </div>
          <Switch
            id={partialId}
            checked={values.partialFirst === true}
            onCheckedChange={(on) => {
              setValue('partialFirst', on);
            }}
          />
        </div>
      )}

      {saveError === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}

      <AlertDialog
        open={pendingDrop !== undefined}
        onOpenChange={(next) => {
          if (!next) setPendingDrop(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tx.confirmTitle', { count: pendingDrop?.count ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>{t('tx.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              // Destructive styling, not the primary green: this discards work
              // the user did on purpose, and a confirmation whose dangerous
              // answer looks like the safe default is a confirmation in name
              // only.
              variant="destructive"
              onClick={() => {
                const pending = pendingDrop;
                setPendingDrop(undefined);
                pending?.run();
              }}
            >
              {t('tx.confirmGo')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {t('action.cancel')}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting || rateBlocked} className="flex-1">
          {form.formState.isSubmitting ? t('tx.saving') : t('action.save')}
        </Button>
      </div>
    </form>
  );
}

function parseAmount(text: string, currency: Currency): Minor | undefined {
  if (text.trim() === '') return undefined;
  try {
    const minor = toMinor(text, currency);
    return Number.isSafeInteger(minor) ? minor : undefined;
  } catch {
    return undefined;
  }
}

/** 1-based position of this occurrence within its instalment plan. */
function installmentIndex(editing: EditTarget): number {
  return monthsBetween(editing.transaction.date, editing.occurrence.originalDate) + 1;
}

function installmentCountOf(editing: EditTarget): number {
  const recurrence = editing.transaction.recurrence;
  return recurrence.type === 'monthly' ? (recurrence.installments ?? 0) : 0;
}
