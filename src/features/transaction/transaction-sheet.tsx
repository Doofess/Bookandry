import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { CurrencySelect } from '@/components/currency-select';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/db/db';
import { saveNewTransaction } from '@/db/save-transaction';
import {
  defaultFormValues,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  NOTE_MAX_LENGTH,
  txFormSchema,
  type TxFormParsed,
  type TxFormValues,
} from '@/domain/tx-form';
import { categoriesFor } from '@/domain/tx-options';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import { isLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { toDecimalString, toMinor } from '@/lib/money';
import type { Category, PaymentMethod, Profile, Transaction } from '@/types/domain';
import type { Currency, Kind, LocalDate, Minor } from '@/types/money';

import { CategoryField } from './category-field';
import { DateField } from './date-field';
import { PaymentMethodField } from './payment-method-field';
import { RateField } from './rate-field';
import { RecurrenceFields } from './recurrence-fields';
import { useRateField } from './use-rate-field';

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
  open,
  onOpenChange,
  profiles,
  categories,
  paymentMethods,
  activeProfileId,
  baseCurrency,
  today,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  /** The feed's active profile, or ALL_PROFILES - which is not a valid owner. */
  readonly activeProfileId: string;
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (transaction: Transaction) => void;
}) {
  const { t } = useTranslation(['common', 'categories', 'profiles']);
  const titleId = useId();

  // A transaction must belong to ONE profile, so the merged "All" view cannot
  // seed it; the first profile is the sensible default and the field is shown
  // whenever there is a choice to make.
  const defaultProfileId = useMemo(
    () =>
      profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : (profiles[0]?.id ?? ''),
    [profiles, activeProfileId],
  );

  const initial = useMemo<TxFormValues>(
    () => ({
      ...defaultFormValues({ profileId: defaultProfileId, currency: baseCurrency, today }),
      categoryId: categoriesFor(categories, 'expense')[0]?.id ?? '',
    }),
    [defaultProfileId, baseCurrency, today, categories],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" aria-labelledby={titleId}>
        <SheetHeader>
          <SheetTitle id={titleId}>{t('tx.addTitle')}</SheetTitle>
          <SheetDescription>{t('tx.addBody')}</SheetDescription>
        </SheetHeader>

        {/*
         * Keyed on `open`, so every opening starts from a clean form.
         *
         * Without the key the sheet keeps the previous draft - including a
         * half-typed amount and a rate looked up for a currency the user was
         * only browsing - and "add another" silently inherits it.
         */}
        {open ? (
          <TransactionForm
            key={String(open)}
            initial={initial}
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

function TransactionForm({
  initial,
  profiles,
  categories,
  paymentMethods,
  baseCurrency,
  today,
  onSaved,
  onCancel,
}: {
  readonly initial: TxFormValues;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (transaction: Transaction) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['common', 'categories', 'profiles']);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const kindId = useId();
  const amountId = useId();
  const currencyId = useId();
  const categoryId = useId();
  const methodId = useId();
  const dateId = useId();
  const noteId = useId();
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
  const changeKind = useCallback(
    (next: Kind) => {
      setValue('kind', next);
      const current = categories.find((category) => category.id === form.getValues('categoryId'));
      if (current?.kind === next) return;
      setValue('categoryId', categoriesFor(categories, next)[0]?.id ?? '', { shouldValidate: false });
    },
    [categories, setValue, form],
  );

  const translateCategory = useCallback((category: Category) => categoryDisplayName(category, t), [t]);

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
            max: MAX_INSTALLMENTS,
          });
        case 'end_before_start':
          return t('tx.errEndBeforeStart');
        case 'invalid_date':
        case 'currency_invalid':
          return t('tx.errInvalidDate');
        default:
          return undefined;
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

    try {
      const result = await saveNewTransaction(db, {
        parsed,
        baseCurrency,
        ...(resolution.status === 'resolved'
          ? {
              rate: {
                rate: resolution.rate,
                rateDate: resolution.rateDate,
                rateSource: resolution.rateSource,
              },
            }
          : {}),
        now: systemClock.nowIso(),
        newId,
      });
      onSaved(result.transaction);
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
        <Label id={categoryId}>{t('tx.category')}</Label>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <CategoryField
              value={field.value}
              onChange={field.onChange}
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
                onChange={field.onChange}
                profileId={values.profileId}
                methods={paymentMethods}
                labelledBy={methodId}
              />
            )}
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
        <Label id={dateId}>{t('tx.date')}</Label>
        <Controller
          control={form.control}
          name="date"
          render={({ field }) => (
            <DateField
              value={field.value as LocalDate}
              onChange={field.onChange}
              labelledBy={dateId}
              invalid={errors.date !== undefined}
            />
          )}
        />
      </div>

      <RecurrenceFields
        values={values}
        onChange={(patch) => {
          // Applied key by key rather than by spreading over Object.entries:
          // the generic form of setValue cannot type a (key, value) pair from
          // a loop, and the `as never` it takes to compile would let a typo
          // through silently.
          if (patch.mode !== undefined) setValue('mode', patch.mode);
          if (patch.dayOfMonth !== undefined) setValue('dayOfMonth', patch.dayOfMonth);
          if (patch.endDate !== undefined) setValue('endDate', patch.endDate);
          if (patch.installmentCount !== undefined) setValue('installmentCount', patch.installmentCount);
        }}
        currency={values.currency}
        amountMinor={amountMinor}
        errors={errors}
      />

      <div className="space-y-1.5">
        <Label htmlFor={noteId}>{t('tx.note')}</Label>
        <Textarea
          id={noteId}
          rows={2}
          placeholder={t('tx.notePlaceholder')}
          aria-invalid={errors.note !== undefined}
          {...form.register('note')}
        />
        {errors.note === undefined ? null : <p className="text-xs text-destructive">{errors.note}</p>}
      </div>

      {saveError === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}

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
