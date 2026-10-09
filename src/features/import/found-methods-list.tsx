import { cn } from 'cn';
import { Check, ChevronDown, CircleAlert, CreditCard, Landmark, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { UnfinishedMethod } from '@/db/import-drafts';
import { CARD_BLOCKING, type MethodReviewItem } from '@/domain/import-cards';
import { MethodForm } from '@/features/cards/method-editor';
import type { PaymentMethod, Profile } from '@/types/domain';

import { editorSource, foundName, needsFilling, tickable } from './found-methods';

/** The found cards and accounts, as a group of the review list. */
export function MethodsGroup({
  items,
  methods,
  onTick,
  onOpen,
}: {
  readonly items: readonly MethodReviewItem[];
  readonly methods: readonly PaymentMethod[];
  readonly onTick: (index: number, ticked: boolean) => void;
  readonly onOpen: (index: number) => void;
}) {
  const { t } = useTranslation('import');
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-border" data-testid="import-methods">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          className="flex w-full items-center justify-between px-3 py-2 text-start text-sm font-medium hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {t('groups.methods', { count: items.length })}
          <ChevronDown
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h3>
      {expanded ? (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((item, index) => (
            <MethodRow
              key={item.id}
              item={item}
              methods={methods}
              onTick={(ticked) => {
                onTick(index, ticked);
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

/** "··3200", kept left to right in a Hebrew line. */
const tail = (digits: string) => `⁦··${digits}⁩`;

function MethodRow({
  item,
  methods,
  onTick,
  onOpen,
}: {
  readonly item: MethodReviewItem;
  readonly methods: readonly PaymentMethod[];
  readonly onTick: (ticked: boolean) => void;
  readonly onOpen: () => void;
}) {
  const { t, i18n } = useTranslation('import');
  const name = foundName(item, i18n.language);
  const known = item.flags.includes('card_known');
  const saved = item.savedId !== undefined;

  return (
    <li className="flex items-stretch">
      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center ps-1">
        <input
          type="checkbox"
          className="size-4 accent-primary-ink"
          checked={item.ticked}
          disabled={!tickable(item)}
          onChange={(event) => {
            onTick(event.target.checked);
          }}
          aria-label={t('include', { name })}
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        disabled={saved || known}
        aria-label={needsFilling(item) ? t('method.fillName', { name }) : t('edit', { name })}
        className="min-w-0 flex-1 px-2 py-2 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:hover:bg-muted/50"
      >
        <MethodSummary item={item} methods={methods} />
      </button>
    </li>
  );
}

/**
 * The cards and accounts kept to finish - from this reading or an earlier
 * one - each until its rest is filled in or it is deleted.
 */
export function UnfinishedGroup({
  entries,
  methods,
  onOpen,
  onDelete,
}: {
  readonly entries: readonly { readonly entry: UnfinishedMethod; readonly item: MethodReviewItem }[];
  readonly methods: readonly PaymentMethod[];
  readonly onOpen: (key: string) => void;
  readonly onDelete: (entry: UnfinishedMethod, name: string) => void;
}) {
  const { t, i18n } = useTranslation('import');
  const titleId = useId();
  if (entries.length === 0) return null;
  return (
    <section
      className="rounded-xl border border-amber-500/40"
      aria-labelledby={titleId}
      data-testid="import-unfinished"
    >
      <div className="px-3 py-2">
        <h3 id={titleId} className="text-sm font-medium">
          {t('unfinished.title', { count: entries.length })}
        </h3>
        <p className="text-xs text-muted-foreground">{t('unfinished.body')}</p>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {entries.map(({ entry, item }) => {
          const name = foundName(item, i18n.language);
          return (
            <li key={entry.key} className="flex items-stretch">
              <button
                type="button"
                onClick={() => {
                  onOpen(entry.key);
                }}
                aria-label={needsFilling(item) ? t('method.fillName', { name }) : t('edit', { name })}
                className="min-w-0 flex-1 px-3 py-2 text-start hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MethodSummary item={item} methods={methods} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(entry, name);
                }}
                aria-label={t('unfinished.delete', { name })}
                className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A found card or account in a few lines: what it is, and where it stands. */
function MethodSummary({
  item,
  methods,
}: {
  readonly item: MethodReviewItem;
  readonly methods: readonly PaymentMethod[];
}) {
  const { t, i18n } = useTranslation(['import', 'cards']);
  const name = foundName(item, i18n.language);
  const list = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  const existing = methods.find((m) => m.id === item.existingId);
  const Icon = item.kind === 'card' ? CreditCard : Landmark;
  const known = item.flags.includes('card_known');
  const saved = item.savedId !== undefined;
  const doubt = item.flags.find((f) => CARD_BLOCKING.has(f) && f !== 'card_known');

  const details =
    item.kind === 'card'
      ? [
          item.found.lastDigits === undefined ? undefined : tail(item.found.lastDigits),
          item.found.network === undefined ? undefined : t(`cards:network.${item.found.network}`),
          item.found.issuer === undefined ? undefined : t(`cards:issuer.${item.found.issuer}`),
          item.found.creditRate === undefined
            ? undefined
            : t('import:method.credit', { rate: item.found.creditRate }),
        ]
      : [
          [item.found.bank?.padStart(2, '0'), item.found.branch, item.found.number]
            .filter((part) => part !== undefined)
            .join('-') || undefined,
          item.found.holders,
        ];

  const status = saved ? (
    <span className="flex items-center gap-1 text-xs text-income">
      <Check className="size-3.5" aria-hidden="true" />
      {t('import:method.saved')}
    </span>
  ) : known ? (
    <span className="text-xs text-muted-foreground">{t('import:method.known')}</span>
  ) : item.missing.length > 0 ? (
    <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {t('import:method.missing', {
        fields: list.format(item.missing.map((m) => t(`import:missing.${m}`))),
      })}
    </span>
  ) : doubt !== undefined ? (
    <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {t(`import:cardFlag.${doubt}`)}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">
      {existing === undefined
        ? t(item.kind === 'card' ? 'import:method.newCard' : 'import:method.newAccount')
        : t('import:method.updates', { name: existing.label })}
    </span>
  );

  return (
    <>
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-medium" dir="auto">
          {name}
        </span>
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {details.filter(Boolean).join(' · ')}
      </span>
      {status}
      {needsFilling(item) ? (
        <span className="mt-1 inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium">
          {t('import:method.fill')}
        </span>
      ) : null}
    </>
  );
}

/**
 * One found card or account in its editor: what the file showed, filled in;
 * the rest for the person. Saved straight to the household's cards.
 */
export function MethodPanel({
  item,
  methods,
  profiles,
  owner,
  onDone,
}: {
  readonly item: MethodReviewItem;
  readonly methods: readonly PaymentMethod[];
  readonly profiles: readonly Profile[];
  readonly owner: string;
  readonly onDone: (saved: PaymentMethod | undefined) => void;
}) {
  const { t, i18n } = useTranslation('import');
  const list = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  const source = editorSource(item, methods, owner, i18n.language);
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        {item.missing.length > 0
          ? t('fillBody', { fields: list.format(item.missing.map((m) => t(`missing.${m}`))) })
          : t('fillCheck')}
      </p>
      <MethodForm
        target={source.target}
        {...(source.prefill === undefined ? {} : { prefill: source.prefill })}
        profiles={profiles}
        newType={item.kind === 'card' ? 'credit_card' : 'bank_account'}
        onDone={onDone}
      />
    </div>
  );
}
