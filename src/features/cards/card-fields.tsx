import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToday } from '@/app/app-context';
import { Segmented } from '@/components/segmented';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountTail, bankByCode, bankName } from '@/domain/banks';
import {
  hasOverrides,
  linkedDraft,
  type CardDraft,
  type CardDraftField,
  type RateDraft,
} from '@/domain/card-draft';
import { COMMON_BILLING_DAYS } from '@/domain/cards';
import { ordinalDay } from '@/i18n/ordinal';
import type { CardIssuer, CardKind, CardNetwork, PaymentMethod } from '@/types/domain';

import { IssuerChooser } from './issuer-chooser';

const ISSUERS: readonly CardIssuer[] = ['isracard', 'cal', 'max', 'amex', 'diners', 'other'];
const NETWORKS: readonly CardNetwork[] = ['visa', 'mastercard', 'amex', 'diners', 'isracard'];
const KINDS: readonly CardKind[] = ['non_bank', 'bank'];
const OTHER_DAY = 'other';
/** "Another account": the card is paid from an account not entered here. */
const OTHER_ACCOUNT = 'other';

/**
 * Everything a card company shows about a card, for the payment-method
 * editor - and nothing that identifies it: no number, no code from the back.
 *
 * Grouped the way a statement is: the card itself, its billing, and what it
 * charges. Every field is optional; a card with only a billing day already
 * makes the balance right.
 */
export function CardFields({
  draft,
  onChange,
  invalid,
  accounts = [],
}: {
  readonly draft: CardDraft;
  readonly onChange: (patch: Partial<CardDraft>) => void;
  /** Fields that could not be read, shown once a save was attempted. */
  readonly invalid: readonly CardDraftField[];
  /** The household's bank accounts, offered as the one the bill is paid from. */
  readonly accounts?: readonly PaymentMethod[];
}) {
  const { t, i18n } = useTranslation('cards');
  const month = useToday().slice(0, 7);
  // Archived accounts are not offered, unless this card is already paid from one.
  const payers = accounts.filter((a) => a.isArchived === 0 || a.id === draft.accountId);
  // Nothing picked yet, an account, or "another account" once the bank is typed.
  const [otherAccount, setOtherAccount] = useState(draft.accountId === '' && draft.bank !== '');
  // An account deleted on another device leaves its bank's name, which is shown instead.
  const linked = payers.some((a) => a.id === draft.accountId);
  const common = (COMMON_BILLING_DAYS as readonly number[]).map(String);
  // "Other" is a choice of its own: picking it opens the field before any day is typed.
  const [other, setOther] = useState(draft.billingDay !== '' && !common.includes(draft.billingDay));
  const ids = {
    issuer: useId(),
    network: useId(),
    kind: useId(),
    account: useId(),
    bank: useId(),
    tier: useId(),
    club: useId(),
    expires: useId(),
    lastDigits: useId(),
    day: useId(),
    otherDay: useId(),
    limit: useId(),
    fee: useId(),
    discountSpend: useId(),
    discountPercent: useId(),
    discountUntil: useId(),
    fx: useId(),
  };
  const dayChoice = other ? OTHER_DAY : common.includes(draft.billingDay) ? draft.billingDay : '';
  // A linked card's company, kind, bank, type and club are the link's: the chooser shows them.
  const linkedCard = draft.catalog !== undefined;
  const bad = (field: CardDraftField) => invalid.includes(field);

  return (
    <div className="space-y-5 rounded-xl border border-border p-3">
      <IssuerChooser
        value={draft.catalog}
        hasOverrides={hasOverrides(draft)}
        stored={{
          kind: draft.kind,
          issuer: draft.issuer,
          bank: draft.bank,
          tier: draft.tier,
          club: draft.club,
        }}
        onLink={(link, resolved, keepOverrides) => {
          onChange(linkedDraft(draft, resolved, link, { keepOverrides, month, language: i18n.language }));
        }}
        onUnlink={() => {
          onChange({ catalog: undefined });
        }}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('edit.theCard')}</legend>

        {linkedCard ? null : (
          <div className="space-y-1.5">
            <Label id={ids.issuer}>{t('edit.issuer')}</Label>
            <Segmented<CardIssuer | ''>
              value={draft.issuer}
              labelledBy={ids.issuer}
              onChange={(issuer) => {
                onChange({ issuer });
              }}
              size="sm"
              options={ISSUERS.map((issuer) => ({ value: issuer, label: t(`issuer.${issuer}`) }))}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label id={ids.network}>{t('edit.network')}</Label>
          <Segmented<CardNetwork | ''>
            value={draft.network}
            labelledBy={ids.network}
            onChange={(network) => {
              onChange({ network });
            }}
            size="sm"
            options={NETWORKS.map((network) => ({ value: network, label: t(`network.${network}`) }))}
          />
        </div>

        {linkedCard ? null : (
          <div className="space-y-1.5">
            <Label id={ids.kind}>{t('edit.kind')}</Label>
            <Segmented<CardKind | ''>
              value={draft.kind}
              labelledBy={ids.kind}
              onChange={(kind) => {
                onChange({ kind });
              }}
              size="sm"
              options={KINDS.map((kind) => ({ value: kind, label: t(`kind.${kind}`) }))}
            />
          </div>
        )}

        {/*
          The household's accounts, when there are any, as the first answer to
          "paid from where": one tap links the card to the account, and its
          bank's name comes with it.
        */}
        {payers.length === 0 ? null : (
          <div className="space-y-1.5">
            <Label id={ids.account}>{t('edit.debitedFrom')}</Label>
            <Segmented<string>
              value={linked ? draft.accountId : otherAccount ? OTHER_ACCOUNT : ''}
              labelledBy={ids.account}
              onChange={(choice) => {
                if (choice === OTHER_ACCOUNT) {
                  setOtherAccount(true);
                  onChange({ accountId: '' });
                  return;
                }
                setOtherAccount(false);
                const bank = bankByCode(payers.find((a) => a.id === choice)?.account?.bank ?? '');
                onChange({
                  accountId: choice,
                  ...(bank === undefined || (linkedCard && draft.kind === 'bank')
                    ? {}
                    : { bank: bankName(bank, i18n.language) }),
                });
              }}
              size="sm"
              options={[
                ...payers.map((payer) => {
                  const bank = bankByCode(payer.account?.bank ?? '');
                  const number = payer.account?.number;
                  return {
                    value: payer.id,
                    label: payer.label,
                    hint: [
                      bank === undefined ? undefined : bankName(bank, i18n.language),
                      number === undefined ? undefined : accountTail(number),
                    ]
                      .filter(Boolean)
                      .join(' '),
                  };
                }),
                { value: OTHER_ACCOUNT, label: t('edit.debitedOther') },
              ]}
            />
            <p className="text-xs text-muted-foreground">{t('edit.debitedFromHint')}</p>
          </div>
        )}
        {(payers.length > 0 && !otherAccount && (linked || draft.accountId === '')) ||
        (linkedCard && draft.kind === 'bank') ? null : (
          <TextField
            id={ids.bank}
            label={draft.kind === 'bank' ? t('edit.bankOfCard') : t('edit.bankDebited')}
            value={draft.bank}
            placeholder={t('edit.bankPlaceholder')}
            onChange={(bank) => {
              onChange({ bank });
            }}
          />
        )}
        {linkedCard ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id={ids.tier}
              label={t('edit.tier')}
              value={draft.tier}
              placeholder={t('edit.tierPlaceholder')}
              onChange={(tier) => {
                onChange({ tier });
              }}
            />
            <TextField
              id={ids.club}
              label={t('edit.club')}
              value={draft.club}
              placeholder={t('edit.clubPlaceholder')}
              onChange={(club) => {
                onChange({ club });
              }}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={ids.lastDigits}>{t('edit.lastDigits')}</Label>
          <Input
            id={ids.lastDigits}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1234"
            value={draft.lastDigits}
            onChange={(event) => {
              onChange({ lastDigits: event.target.value.replace(/\D/g, '').slice(0, 4) });
            }}
            aria-invalid={bad('lastDigits')}
            aria-describedby={`${ids.lastDigits}-hint`}
            className="h-11 w-28"
          />
          <p
            id={`${ids.lastDigits}-hint`}
            className={bad('lastDigits') ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
          >
            {bad('lastDigits') ? t('edit.lastDigitsInvalid') : t('edit.lastDigitsHint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={ids.expires}>{t('edit.expires')}</Label>
          <Input
            id={ids.expires}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder="MM/YY"
            value={draft.expires}
            onChange={(event) => {
              onChange({ expires: event.target.value.replace(/[^\d/]/g, '').slice(0, 7) });
            }}
            aria-invalid={bad('expires')}
            aria-describedby={`${ids.expires}-hint`}
            className="h-11 w-28"
          />
          <p
            id={`${ids.expires}-hint`}
            className={bad('expires') ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
          >
            {bad('expires') ? t('edit.expiresInvalid') : t('edit.expiresHint')}
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('edit.billing')}</legend>
        <div className="space-y-1.5">
          <Label id={ids.day}>{t('edit.billingDay')}</Label>
          <Segmented<string>
            value={dayChoice}
            labelledBy={ids.day}
            onChange={(choice) => {
              setOther(choice === OTHER_DAY);
              onChange({ billingDay: choice === OTHER_DAY ? '' : choice });
            }}
            size="sm"
            options={[
              ...common.map((day) => ({
                value: day,
                label: t('edit.dayN', { day: ordinalDay(Number(day), i18n.language) }),
              })),
              { value: OTHER_DAY, label: t('edit.dayOther') },
            ]}
          />
          {other ? (
            <Input
              id={ids.otherDay}
              aria-label={t('edit.billingDay')}
              inputMode="numeric"
              value={draft.billingDay}
              onChange={(event) => {
                onChange({ billingDay: event.target.value.replace(/\D/g, '').slice(0, 2) });
              }}
              aria-invalid={bad('billingDay')}
              className="h-11 w-24"
            />
          ) : null}
          <p className={bad('billingDay') ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            {bad('billingDay') ? t('edit.billingDayInvalid') : t('edit.billingDayHint')}
          </p>
        </div>

        <MoneyField
          id={ids.limit}
          label={t('edit.creditLimit')}
          value={draft.creditLimit}
          invalid={bad('creditLimit')}
          onChange={(creditLimit) => {
            onChange({ creditLimit });
          }}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('edit.charges')}</legend>
        <MoneyField
          id={ids.fee}
          label={t('edit.monthlyFee')}
          value={draft.monthlyFee}
          invalid={bad('monthlyFee')}
          hint={t('edit.monthlyFeeHint')}
          onChange={(monthlyFee) => {
            onChange({ monthlyFee });
          }}
        />
        {/* Only with a fee: a discount on nothing is not a question worth asking. */}
        {draft.monthlyFee.trim() === '' ? null : (
          <div className="space-y-3 rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-medium">{t('edit.discount')}</p>
            <MoneyField
              id={ids.discountSpend}
              label={t('edit.discountSpend')}
              value={draft.discountSpend}
              invalid={bad('discountSpend')}
              onChange={(discountSpend) => {
                onChange({ discountSpend });
              }}
            />
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={ids.discountPercent}>{t('edit.discountPercent')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={ids.discountPercent}
                    dir="ltr"
                    inputMode="decimal"
                    value={draft.discountPercent}
                    onChange={(event) => {
                      onChange({ discountPercent: event.target.value.replace(/[^\d.]/g, '').slice(0, 6) });
                    }}
                    aria-invalid={bad('discountPercent')}
                    className="h-11 w-24"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.discountUntil}>{t('edit.discountUntil')}</Label>
                <Input
                  id={ids.discountUntil}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="MM/YY"
                  value={draft.discountUntil}
                  onChange={(event) => {
                    onChange({ discountUntil: event.target.value.replace(/[^\d/]/g, '').slice(0, 7) });
                  }}
                  aria-invalid={bad('discountUntil')}
                  className="h-11 w-28"
                />
              </div>
            </div>
            <p
              className={
                bad('discountPercent') || bad('discountUntil')
                  ? 'text-xs text-destructive'
                  : 'text-xs text-muted-foreground'
              }
            >
              {bad('discountPercent')
                ? t('edit.discountPercentInvalid')
                : bad('discountUntil')
                  ? t('edit.expiresInvalid')
                  : t('edit.discountHint')}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={ids.fx}>{t('edit.fxFee')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={ids.fx}
              dir="ltr"
              inputMode="decimal"
              value={draft.fxFee}
              placeholder="2.5"
              onChange={(event) => {
                onChange({ fxFee: event.target.value.replace(/[^\d.]/g, '').slice(0, 6) });
              }}
              aria-invalid={bad('fxFee')}
              aria-describedby={`${ids.fx}-hint`}
              className="h-11 w-24"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <p id={`${ids.fx}-hint`} className="text-xs text-muted-foreground">
            {t('edit.fxFeeHint')}
          </p>
        </div>
        <RateField
          label={t('edit.creditRate')}
          hint={t('edit.creditRateHint')}
          draft={draft.credit}
          invalid={bad('credit')}
          onChange={(credit) => {
            onChange({ credit });
          }}
        />
        <RateField
          label={t('edit.lateRate')}
          hint={t('edit.lateRateHint')}
          draft={draft.late}
          invalid={bad('late')}
          onChange={(late) => {
            onChange({ late });
          }}
        />
      </fieldset>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={40}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="h-11"
      />
    </div>
  );
}

export function MoneyField({
  id,
  label,
  value,
  invalid,
  hint,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly invalid: boolean;
  readonly hint?: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation('cards');
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">₪</span>
        <Input
          id={id}
          dir="ltr"
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            onChange(event.target.value.replace(/[^\d.,]/g, '').slice(0, 12));
          }}
          aria-invalid={invalid}
          className="h-11 w-36"
        />
      </div>
      {invalid ? (
        <p className="text-xs text-destructive">{t('edit.amountInvalid')}</p>
      ) : hint === undefined ? null : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** A rate as card companies quote it: prime plus a margin, or a fixed rate. */
function RateField({
  label,
  hint,
  draft,
  invalid,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly draft: RateDraft;
  readonly invalid: boolean;
  readonly onChange: (draft: RateDraft) => void;
}) {
  const { t } = useTranslation('cards');
  const labelId = useId();
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'prime' | 'fixed'>
          value={draft.basis}
          labelledBy={labelId}
          onChange={(basis) => {
            onChange({ ...draft, basis });
          }}
          size="sm"
          className="w-44"
          options={[
            { value: 'prime', label: t('edit.basisPrime') },
            { value: 'fixed', label: t('edit.basisFixed') },
          ]}
        />
        <Input
          id={inputId}
          aria-label={draft.basis === 'prime' ? t('edit.marginLabel', { label }) : label}
          dir="ltr"
          inputMode="decimal"
          value={draft.value}
          placeholder={draft.basis === 'prime' ? '+1.5' : '12'}
          onChange={(event) => {
            onChange({ ...draft, value: event.target.value.replace(/[^\d.+-]/g, '').slice(0, 7) });
          }}
          aria-invalid={invalid}
          className="h-11 w-24"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <p className={invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {invalid ? t('edit.rateInvalid') : hint}
      </p>
    </div>
  );
}
