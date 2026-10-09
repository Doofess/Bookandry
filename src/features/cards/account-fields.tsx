import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { useToday } from '@/app/app-context';
import { Segmented } from '@/components/segmented';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { typedAccountNumber, type AccountDraft, type AccountDraftField } from '@/domain/account-draft';
import { ACCOUNT_MAX_DIGITS, BRANCH_MAX_DIGITS, bankByCode, bankName } from '@/domain/banks';
import { formatLocalDate } from '@/lib/dates';
import type { AccountHolding, Profile } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { BankSelect } from './bank-select';
import { MoneyField } from './card-fields';
import { useBranch, type BranchState } from './use-branch';

const HOLDINGS: readonly AccountHolding[] = ['personal', 'joint', 'business'];

/**
 * A bank account as the bank writes it - bank, branch, number - whose it is,
 * and its overdraft limit, for the payment-method editor.
 *
 * The branch is named as it is typed, from the Bank of Israel's list, so a
 * wrong digit shows as the wrong branch before it is saved.
 */
export function AccountFields({
  draft,
  onChange,
  invalid,
  profiles,
}: {
  readonly draft: AccountDraft;
  readonly onChange: (patch: Partial<AccountDraft>) => void;
  /** Fields that could not be read, shown once a save was attempted. */
  readonly invalid: readonly AccountDraftField[];
  readonly profiles: readonly Profile[];
}) {
  const { t } = useTranslation('cards');
  const ids = {
    bank: useId(),
    branch: useId(),
    number: useId(),
    holding: useId(),
    owner: useId(),
    holders: useId(),
    others: useId(),
    overdraft: useId(),
  };
  const bad = (field: AccountDraftField) => invalid.includes(field);
  const personal = draft.holding === 'personal';

  return (
    <div className="space-y-5 rounded-xl border border-border p-3">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('accounts.edit.theAccount')}</legend>

        <div className="space-y-1.5">
          <Label id={ids.bank}>{t('accounts.edit.bank')}</Label>
          <BankSelect
            value={draft.bank}
            labelledBy={ids.bank}
            invalid={bad('bank')}
            describedBy={bad('bank') ? `${ids.bank}-error` : undefined}
            onChange={(bank) => {
              onChange({ bank });
            }}
          />
          {bad('bank') ? (
            <p id={`${ids.bank}-error`} className="text-xs text-destructive">
              {t('accounts.edit.bankInvalid')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={ids.branch}>{t('accounts.edit.branch')}</Label>
            <Input
              id={ids.branch}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={draft.branch}
              onChange={(event) => {
                onChange({ branch: event.target.value.replace(/\D/g, '').slice(0, BRANCH_MAX_DIGITS) });
              }}
              aria-invalid={bad('branch')}
              aria-describedby={`${ids.branch}-name`}
              className="h-11 w-28"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.number}>{t('accounts.edit.number')}</Label>
            <Input
              id={ids.number}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={draft.number}
              onChange={(event) => {
                onChange(typedAccountNumber(event.target.value));
              }}
              aria-invalid={bad('number')}
              aria-describedby={`${ids.number}-hint`}
              maxLength={ACCOUNT_MAX_DIGITS + 12}
              className="h-11"
            />
          </div>
        </div>
        <BranchLine
          id={`${ids.branch}-name`}
          bank={draft.bank}
          branch={draft.branch}
          invalid={bad('branch')}
        />
        <p
          id={`${ids.number}-hint`}
          className={bad('number') ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
        >
          {bad('number') ? t('accounts.edit.numberInvalid') : t('accounts.edit.numberHint')}
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <div className="space-y-1.5">
          <Label id={ids.holding}>{t('accounts.edit.holding')}</Label>
          <Segmented<AccountHolding>
            value={draft.holding}
            labelledBy={ids.holding}
            onChange={(holding) => {
              onChange({ holding });
            }}
            size="sm"
            options={HOLDINGS.map((holding) => ({ value: holding, label: t(`accounts.holding.${holding}`) }))}
          />
        </div>

        {personal ? (
          <div className="space-y-1.5">
            <Label id={ids.owner}>{t('accounts.edit.owner')}</Label>
            <Segmented<string>
              value={draft.owner}
              labelledBy={ids.owner}
              onChange={(owner) => {
                onChange({ owner });
              }}
              size="sm"
              options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
            />
            {bad('holders') ? (
              <p className="text-xs text-destructive">{t('accounts.edit.holdersInvalid')}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label id={ids.holders}>{t('accounts.edit.holders')}</Label>
              {/* Several can be on one account: toggles, not a single choice. */}
              <div role="group" aria-labelledby={ids.holders} className="flex flex-wrap gap-2">
                {profiles.map((profile) => {
                  const on = draft.holders.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        onChange({
                          holders: on
                            ? draft.holders.filter((id) => id !== profile.id)
                            : [...draft.holders, profile.id],
                        });
                      }}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                        on ? 'border-primary-ink bg-accent font-medium' : 'border-border hover:bg-muted'
                      }`}
                    >
                      {on ? <Check className="size-4" aria-hidden="true" /> : null}
                      {profile.name}
                    </button>
                  );
                })}
              </div>
              <p className={bad('holders') ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {bad('holders') ? t('accounts.edit.holdersInvalid') : t('accounts.edit.holdersHint')}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.others}>{t('accounts.edit.otherHolders')}</Label>
              <Input
                id={ids.others}
                value={draft.otherHolders}
                placeholder={t('accounts.edit.otherHoldersPlaceholder')}
                maxLength={80}
                onChange={(event) => {
                  onChange({ otherHolders: event.target.value });
                }}
                className="h-11"
              />
            </div>
          </>
        )}
      </fieldset>

      <MoneyField
        id={ids.overdraft}
        label={t('accounts.edit.overdraft')}
        value={draft.overdraft}
        invalid={bad('overdraft')}
        hint={t('accounts.edit.overdraftHint')}
        onChange={(overdraft) => {
          onChange({ overdraft });
        }}
      />
    </div>
  );
}

/** The branch the number names, or why it names none. */
function BranchLine({
  id,
  bank,
  branch,
  invalid,
}: {
  readonly id: string;
  readonly bank: string;
  readonly branch: string;
  readonly invalid: boolean;
}) {
  const { t, i18n } = useTranslation('cards');
  const today = useToday();
  const state: BranchState = useBranch(bank, branch, i18n.language, today);
  const known = bankByCode(bank);
  const date = (value: LocalDate) => formatLocalDate(value, i18n.language, { dateStyle: 'medium' });

  let text: string | undefined;
  let tone = 'text-muted-foreground';
  if (invalid) {
    text = t('accounts.edit.branchInvalid');
    tone = 'text-destructive';
  } else if (state.status === 'looking') {
    text = t('accounts.edit.branchLooking');
  } else if (state.status === 'unlisted') {
    text = t('accounts.edit.branchUnlisted');
  } else if (state.status === 'unknown') {
    text = t('accounts.edit.branchUnknown', {
      branch,
      bank: known === undefined ? bank : bankName(known, i18n.language),
    });
    tone = 'text-amber-800 dark:text-amber-300';
  } else if (state.status === 'found') {
    const found = state.branch;
    text = t('accounts.edit.branchFound', { name: found.name, city: found.city });
    if (found.closed !== undefined) {
      text += ` ${
        found.mergedInto === undefined
          ? t('accounts.branchClosed', { date: date(found.closed) })
          : t('accounts.branchMerged', { date: date(found.closed), into: found.mergedInto.branch })
      }`;
      tone = 'text-amber-800 dark:text-amber-300';
    }
  }

  return (
    <p id={id} aria-live="polite" className={`min-h-4 text-xs ${tone}`}>
      {text}
    </p>
  );
}
