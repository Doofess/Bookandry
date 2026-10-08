import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { usePrime } from '@/app/prime';
import { Percent } from '@/components/percent';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ResolvedCard } from '@/data/card-catalog/resolve';
import { rateToday } from '@/data/card-catalog/resolve';
import type { CatalogRate, DealRule } from '@/data/card-catalog/types';
import { cardDealRate } from '@/domain/card-catalog-link';
import { CARD_CURRENCY } from '@/domain/cards';
import { formatMoney } from '@/i18n/money-format';
import { formatLocalDate } from '@/lib/dates';
import { addRates, annualEffectiveRate, normalizeAnnualRate, normalizeRateMargin } from '@/lib/money';
import type { CardDetails, CardRateTerm, DealKind, ExtraRateKind } from '@/types/domain';
import type { LocalDate } from '@/types/money';

type RateKind = DealKind | ExtraRateKind;

/** Two decimal places at least, as a statement prints a rate: "10.5" is "10.50". */
function twoPlaces(value: string): string {
  const [whole = '', fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

/** The nominal annual rate today for a term, at the given prime and Bank of Israel rate. */
function termToday(term: CardRateTerm, prime: string, boi: string): string {
  switch (term.basis) {
    case 'prime':
      return addRates(prime, term.margin);
    case 'boi':
      return addRates(boi, term.margin);
    case 'fixed':
      return term.rate;
  }
}

/** The מתואמת figure, or undefined where a rate below zero has none. */
function effectiveOf(nominal: string, compounding: 12 | 4): string | undefined {
  try {
    return annualEffectiveRate(nominal, compounding);
  } catch {
    return undefined;
  }
}

type Row = {
  readonly kind: RateKind;
  readonly label: string;
  readonly rate: CatalogRate | undefined;
  readonly deal: DealRule | undefined;
};

/** Everything a card's rates say about themselves: one row per kind, with where it comes from. */
export function RateTable({
  card,
  resolved,
  onOverride,
}: {
  readonly card: CardDetails;
  readonly resolved: ResolvedCard;
  readonly onOverride: (kind: RateKind, term: CardRateTerm | null) => void;
}) {
  const { t, i18n } = useTranslation('cards');
  const lang = i18n.language.startsWith('he') ? 'he' : 'en';
  const prime = usePrime();
  const day = (date: LocalDate) =>
    formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const rows: Row[] = [
    ...resolved.deals
      .filter((deal) => deal.rate !== undefined || card.overrides?.[deal.kind] !== undefined)
      .map((deal): Row => ({ kind: deal.kind, label: deal.label[lang], rate: deal.rate, deal })),
    { kind: 'late', label: t('rates.kind.late'), rate: resolved.extra.late?.rate, deal: undefined },
    ...(['over_limit', 'cash'] as const)
      .filter((kind) => resolved.extra[kind] !== undefined || card.overrides?.[kind] !== undefined)
      .map((kind): Row => ({
        kind,
        label: t(kind === 'cash' ? 'rates.kind.cash' : 'rates.kind.overLimit'),
        rate: resolved.extra[kind]?.rate,
        deal: undefined,
      })),
  ];

  const asOf: LocalDate =
    prime.source.kind === 'built_in' ? prime.source.asOf : (prime.source.checkedAt.slice(0, 10) as LocalDate);

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((row) => (
          <RateRow
            key={row.kind}
            row={row}
            card={card}
            resolved={resolved}
            prime={prime.primeRate}
            boi={prime.boiRate}
            day={day}
            onOverride={onOverride}
          />
        ))}
      </ul>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('rates.followPrime', { prime: prime.primeRate, date: day(asOf) })}</p>
        {card.catalog?.updatedOn === undefined ? null : (
          <p>{t('rates.updated', { date: day(card.catalog.updatedOn) })}</p>
        )}
      </div>
    </div>
  );
}

function RateRow({
  row,
  card,
  resolved,
  prime,
  boi,
  day,
  onOverride,
}: {
  readonly row: Row;
  readonly card: CardDetails;
  readonly resolved: ResolvedCard;
  readonly prime: string;
  readonly boi: string;
  readonly day: (date: LocalDate) => string;
  readonly onOverride: (kind: RateKind, term: CardRateTerm | null) => void;
}) {
  const { t } = useTranslation('cards');
  const labelId = useId();
  const inputId = useId();
  const found = cardDealRate(card, resolved, row.kind);
  const term = found?.term ?? null;
  const overridden = found?.source === 'override';
  // The catalog gives no figure: the person's own is the only one there can be.
  const unpublished = row.rate?.basis == null;

  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [basis, setBasis] = useState<'prime' | 'fixed'>(term?.basis === 'fixed' ? 'fixed' : 'prime');
  const [text, setText] = useState(
    term?.basis === 'prime' ? term.margin : term?.basis === 'fixed' ? term.rate : '',
  );
  const [bad, setBad] = useState(false);

  const write = (nextBasis: 'prime' | 'fixed', nextText: string): void => {
    if (nextText.trim() === '') {
      setBad(false);
      if (overridden) onOverride(row.kind, null);
      return;
    }
    if (nextBasis === 'prime') {
      const margin = normalizeRateMargin(nextText);
      setBad(margin === undefined);
      if (margin !== undefined) onOverride(row.kind, { basis: 'prime', margin });
    } else {
      const rate = normalizeAnnualRate(nextText);
      setBad(rate === undefined);
      if (rate !== undefined) onOverride(row.kind, { basis: 'fixed', rate });
    }
  };

  const compounding = row.rate?.compounding ?? 12;
  const nominal =
    term === null
      ? undefined
      : found?.source === 'catalog' && row.rate !== undefined
        ? rateToday(row.rate, prime, boi)
        : termToday(term, prime, boi);
  const effective = nominal === undefined ? undefined : effectiveOf(nominal, compounding);

  const tag =
    found === undefined || (term === null && !overridden)
      ? undefined
      : overridden
        ? unpublished
          ? 'rates.fromStatement'
          : 'rates.changed'
        : found.source === 'card'
          ? 'rates.fromStatement'
          : found.quality === 'max'
            ? 'rates.upTo'
            : found.quality === 'derived'
              ? 'rates.derived'
              : 'rates.published';

  const reference = row.kind === 'over_limit' || row.kind === 'cash';
  const editing = unpublished || open;
  const label = row.label;

  return (
    <li className="space-y-2 rounded-lg bg-muted/50 p-3" data-testid={`rate-${row.kind}`}>
      <div className="flex items-start justify-between gap-2">
        <p id={labelId} className="text-sm font-medium">
          {label}
        </p>
        {row.rate === undefined && row.deal === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={t('rates.info', { label })}
            onClick={() => {
              setInfo(true);
            }}
          >
            <Info className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {term === null ? (
        <p className="text-sm text-muted-foreground">{t('rates.unpublished')}</p>
      ) : (
        <p className="text-sm">
          {term.basis === 'fixed' ? null : (
            <>
              <span>{t(term.basis === 'prime' ? 'rates.prime' : 'rates.boi')}</span>{' '}
              <bdi dir="ltr">
                {term.margin.startsWith('-') ? '−' : '+'} {twoPlaces(term.margin.replace(/^-/, ''))}
              </bdi>
              {' · '}
            </>
          )}
          {nominal === undefined ? null : (
            <>
              <Percent rate={twoPlaces(nominal)} /> {t('rates.nominal')}
            </>
          )}
          {effective === undefined ? null : (
            <>
              {' · '}
              <Percent rate={effective} /> {t('rates.effective')}
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {tag === undefined ? null : (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{t(tag)}</span>
        )}
        {reference ? <span className="text-xs text-muted-foreground">{t('rates.reference')}</span> : null}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<'prime' | 'fixed'>
            value={basis}
            labelledBy={labelId}
            onChange={(next) => {
              setBasis(next);
              write(next, text);
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
            aria-label={basis === 'prime' ? t('edit.marginLabel', { label }) : label}
            dir="ltr"
            inputMode="decimal"
            value={text}
            placeholder={basis === 'prime' ? '+1.5' : '12'}
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.+-]/g, '').slice(0, 7);
              setText(next);
              write(basis, next);
            }}
            aria-invalid={bad}
            className="h-11 w-24"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      ) : null}
      {bad ? <p className="text-xs text-destructive">{t('edit.rateInvalid')}</p> : null}

      <div className="flex flex-wrap gap-2">
        {unpublished ? null : (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
          >
            {t('rates.change')}
          </Button>
        )}
        {overridden ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => {
              setOpen(false);
              setBad(false);
              setText('');
              setBasis('prime');
              onOverride(row.kind, null);
            }}
          >
            {t('rates.back')}
          </Button>
        ) : null}
      </div>

      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="sr-only">{t('rates.infoHint')}</DialogDescription>
          </DialogHeader>
          <RateInfo rate={row.rate} deal={row.deal} day={day} />
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** The rules of a rate in plain words, and where they were read. */
function RateInfo({
  rate,
  deal,
  day,
}: {
  readonly rate: CatalogRate | undefined;
  readonly deal: DealRule | undefined;
  readonly day: (date: LocalDate) => string;
}) {
  const { t, i18n } = useTranslation('cards');
  const money = (minor: number) => (
    <bdi dir="ltr">{formatMoney(minor, CARD_CURRENCY, { locale: i18n.language }).text}</bdi>
  );
  const lines: { key: string; label: string; value: ReactNode }[] = [];
  if (deal?.payments !== undefined) {
    lines.push({
      key: 'payments',
      label: t('rates.rule.payments'),
      value: (
        <bdi dir="ltr">
          {deal.payments.min}–{deal.payments.max}
        </bdi>
      ),
    });
  }
  if (deal?.minDealMinor !== undefined) {
    lines.push({ key: 'minDeal', label: t('rates.rule.minDeal'), value: money(deal.minDealMinor) });
  }
  if (deal?.minPaymentMinor !== undefined) {
    lines.push({ key: 'minPayment', label: t('rates.rule.minPayment'), value: money(deal.minPaymentMinor) });
  }
  if (deal?.minPaymentFrom !== undefined) {
    lines.push({
      key: 'minPaymentFrom',
      label: t('rates.rule.minPaymentFrom', { from: deal.minPaymentFrom.payments }),
      value: money(deal.minPaymentFrom.minPaymentMinor),
    });
  }
  if (deal !== undefined) {
    lines.push({
      key: 'abroad',
      label: t('rates.rule.abroad'),
      value: t(deal.abroad ? 'rates.rule.allowed' : 'rates.rule.notAllowed'),
    });
  }
  if (rate !== undefined) {
    lines.push({
      key: 'accrues',
      label: t('rates.rule.accrues'),
      value: t(`rates.accrues.${rate.accrues}`),
    });
    lines.push({
      key: 'floating',
      label: t('rates.rule.rate'),
      value: t(rate.fixedAtPurchase ? 'rates.rule.fixed' : 'rates.rule.floating'),
    });
  }
  const source = rate?.source ?? deal?.source;
  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-1.5">
        {lines.map((line) => (
          <div key={line.key} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="text-end">{line.value}</dd>
          </div>
        ))}
      </dl>
      {rate?.reset === undefined ? null : (
        <p>
          {t('rates.resetRule', {
            last: rate.reset.atPayment - 1,
            at: rate.reset.atPayment,
          })}
        </p>
      )}
      {rate?.caveat === undefined ? null : <p className="text-muted-foreground">{rate.caveat}</p>}
      {source === undefined ? null : (
        <p className="text-xs text-muted-foreground">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center underline"
          >
            {t('rates.source')}
          </a>{' '}
          {t('rates.seen', { date: day(source.seen) })}
        </p>
      )}
    </div>
  );
}
