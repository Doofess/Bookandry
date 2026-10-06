import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToday } from '@/app/app-context';
import { AmountInput } from '@/components/amount-input';
import { CurrencySelect } from '@/components/currency-select';
import { PersonAvatar } from '@/components/person-avatar';
import { ColorPicker } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { nextFreeColor, PROFILE_PALETTE } from '@/domain/palette';
import { graphemeLength, NAME_MAX_LENGTH } from '@/domain/validation';
import { startOfMonth } from '@/lib/dates';
import type { Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

export type ProfileFormValues = {
  readonly name: string;
  readonly color: string;
  readonly openingBalanceMinor: Minor | undefined;
  readonly openingBalanceCurrency: Currency;
  readonly openingBalanceDate: LocalDate;
};

/**
 * Add or edit one profile.
 *
 * A name, a colour and an opening balance. There is no picture to choose: a
 * person is shown by their account's picture, or by their initials on their
 * colour, which the preview beside the name shows as it is typed.
 *
 * Editing the OPENING BALANCE is the reason this screen matters beyond
 * renaming: it is the number people get wrong at setup and then cannot find
 * again, and it is the usual answer to "that is not how much money I have".
 *
 * The opening balance allows a NEGATIVE value. An Israeli current account in
 * מינוס is an ordinary overdraft, not an error, and a field that refuses it
 * makes the app unusable for anyone in one.
 */
export function ProfileEditor({
  open,
  onOpenChange,
  profile,
  existing,
  baseCurrency,
  onSave,
  error,
  saving,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Absent when adding. */
  readonly profile?: Profile;
  /** Every profile, for the colour-uniqueness rule. */
  readonly existing: readonly Profile[];
  readonly baseCurrency: Currency;
  readonly onSave: (values: ProfileFormValues) => void;
  readonly error?: string;
  readonly saving: boolean;
}) {
  const { t } = useTranslation(['common', 'profiles']);
  const today = useToday();

  const taken = useMemo(
    () => existing.filter((p) => p.id !== profile?.id).map((p) => p.color),
    [existing, profile?.id],
  );

  const initial = useMemo<ProfileFormValues>(
    () =>
      profile === undefined
        ? {
            name: '',
            // PROFILE_PALETTE is a non-empty tuple, so [0] is always there -
            // and `nextFreeColor` returning undefined means every colour is
            // taken, which the screen has already blocked with a reason.
            color: nextFreeColor(taken) ?? PROFILE_PALETTE[0].hex,
            openingBalanceMinor: 0,
            openingBalanceCurrency: baseCurrency,
            // The start of THIS month, not today: anchoring on the 15th drops
            // the salary that arrived on the 1st and the rent that left on the
            // 2nd, so the first month the user sees is missing most of itself.
            openingBalanceDate: startOfMonth(today),
          }
        : {
            name: profile.name,
            color: profile.color,
            openingBalanceMinor: profile.openingBalanceMinor,
            openingBalanceCurrency: profile.openingBalanceCurrency,
            openingBalanceDate: profile.openingBalanceDate,
          },
    [profile, taken, baseCurrency, today],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {profile === undefined ? t('profiles:screen.newTitle') : t('profiles:screen.editTitle')}
          </SheetTitle>
          <SheetDescription>{t('profiles:screen.openingBalanceHelp')}</SheetDescription>
        </SheetHeader>

        {/* Keyed, so opening a different profile does not inherit the last
            one's half-edited draft. */}
        {open ? (
          <EditorForm
            key={profile?.id ?? 'new'}
            // A new person has no id until it is saved; a placeholder only
            // ever shows initials, which is right for someone with no account.
            personId={profile?.id ?? 'new'}
            initial={initial}
            taken={taken}
            onSave={onSave}
            onCancel={() => {
              onOpenChange(false);
            }}
            error={error}
            saving={saving}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EditorForm({
  personId,
  initial,
  taken,
  onSave,
  onCancel,
  error,
  saving,
}: {
  /** For the preview: a linked account's picture is found by its id. */
  readonly personId: string;
  readonly initial: ProfileFormValues;
  readonly taken: readonly string[];
  readonly onSave: (values: ProfileFormValues) => void;
  readonly onCancel: () => void;
  readonly error?: string;
  readonly saving: boolean;
}) {
  const { t } = useTranslation(['common', 'profiles']);
  const [values, setValues] = useState(initial);

  const nameId = useId();
  const colorId = useId();
  const amountId = useId();
  const currencyId = useId();

  const trimmed = values.name.trim();
  const tooLong = graphemeLength(trimmed) > NAME_MAX_LENGTH;
  const nameError = tooLong ? t('validation.nameTooLong', { count: NAME_MAX_LENGTH }) : undefined;
  const canSave = trimmed !== '' && !tooLong && !saving;

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave({ ...values, name: trimmed });
      }}
      className="space-y-5 px-4 pb-6"
    >
      <div className="flex items-center gap-3">
        <PersonAvatar person={{ id: personId, name: values.name, color: values.color }} size="lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={nameId}>{t('profiles:screen.name')}</Label>
          <Input
            id={nameId}
            value={values.name}
            placeholder={t('profiles:screen.namePlaceholder')}
            onChange={(event) => {
              set('name', event.target.value);
            }}
            aria-invalid={nameError !== undefined}
            className="h-11"
          />
          {nameError === undefined ? null : <p className="text-xs text-destructive">{nameError}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label id={colorId}>{t('profiles:color.label')}</Label>
        <ColorPicker
          value={values.color}
          taken={taken}
          labelledBy={colorId}
          onChange={(hex) => {
            set('color', hex);
          }}
        />
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={amountId}>{t('profiles:screen.openingBalance')}</Label>
          <AmountInput
            id={amountId}
            value={values.openingBalanceMinor}
            currency={values.openingBalanceCurrency}
            // An overdraft is an ordinary balance, not an error.
            allowNegative
            onChange={(minor) => {
              set('openingBalanceMinor', minor);
            }}
          />
        </div>
        <div className="w-36 space-y-1.5">
          <Label htmlFor={currencyId} id={`${currencyId}-label`}>
            {t('currency.label')}
          </Label>
          <CurrencySelect
            id={currencyId}
            value={values.openingBalanceCurrency}
            aria-labelledby={`${currencyId}-label`}
            onChange={(currency) => {
              set('openingBalanceCurrency', currency);
            }}
          />
        </div>
      </div>

      {error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {t('action.cancel')}
        </Button>
        <Button type="submit" disabled={!canSave} className="flex-1">
          {t('action.save')}
        </Button>
      </div>
    </form>
  );
}
