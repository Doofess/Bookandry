import { AlertTriangle } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { CurrencyBadge } from '@/components/currency-select';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RateEntry, RateResolution } from '@/domain/tx-rate';
import { formatLocalDate } from '@/lib/dates';
import { toDecimalString } from '@/lib/money';
import type { Currency, Minor, RateSource } from '@/types/money';

import type { RateState } from './use-rate-field';

/**
 * The exchange-rate field.
 *
 * Your decision - fetch the rate at save time if online, ask for it if not -
 * removed §4's entire degradation machinery, and this is the UI half of what
 * replaced it. Four things here are load-bearing:
 *
 *  1. THE LABEL IS A SENTENCE WITH BOTH UNITS: `1 EUR = [ ] ILS`. A field
 *     labelled "Exchange rate" is genuinely ambiguous about direction, and
 *     getting the direction wrong is a ~15x error in the hero balance - in the
 *     flattering direction.
 *  2. THE FIELD IS NEVER BLANK. A historical cache row never expires, so a
 *     three-week-old rate is a perfectly good default provided its DATE is
 *     visible. A hard block is reserved for a pair this install has never seen.
 *  3. THE CHARGED AMOUNT IS AN EQUAL WAY IN. An Israeli buying EUR 45 online
 *     knows the shekel figure from the bank's SMS - including the foreign
 *     transaction fee - and does not know the ECB rate their issuer used.
 *  4. A SUSPICIOUS RATE WARNS, IT DOES NOT BLOCK. The user may simply be right.
 */
export function RateField({
  state,
  currency,
  baseCurrency,
  onRateChange,
  onChargedChange,
  onEntryChange,
}: {
  readonly state: RateState;
  readonly currency: Currency;
  readonly baseCurrency: Currency;
  readonly onRateChange: (value: string) => void;
  readonly onChargedChange: (minor: Minor | undefined) => void;
  readonly onEntryChange: (entry: RateEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const entryLabelId = useId();
  const rateId = useId();
  const chargedId = useId();
  const helpId = useId();

  const { resolution, entry, rate, charged, known, isLooking } = state;

  /*
   * No complaint while the lookup is still running.
   *
   * Until it answers there is no `known` rate, so the resolution is
   * legitimately invalid - and rendering that verbatim flashes "no rate has
   * ever been stored for this pair" for the second or two the network takes,
   * which is both alarming and, a moment later, false. Observed in a browser
   * against the real provider, not reasoned about.
   */
  const problem = isLooking || resolution.status !== 'invalid' ? undefined : resolution.problem;
  const warnings = resolution.status === 'resolved' ? resolution.warnings : [];

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-muted/40 p-3"
      aria-labelledby={`${rateId}-title`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${rateId}-title`} className="text-sm font-medium">
          {t('tx.rateTitle')}
        </h3>
        <div className="flex items-center gap-1">
          <CurrencyBadge code={currency} />
          <span aria-hidden="true" className="text-muted-foreground">
            →
          </span>
          <CurrencyBadge code={baseCurrency} />
        </div>
      </div>

      <Label id={entryLabelId} className="sr-only">
        {t('tx.rateBy')}
      </Label>
      <Segmented<RateEntry>
        value={entry}
        labelledBy={entryLabelId}
        onChange={onEntryChange}
        size="sm"
        options={[
          { value: 'rate', label: t('tx.rateByRate') },
          { value: 'charged', label: t('tx.rateByCharged') },
        ]}
      />

      {entry === 'rate' ? (
        <div className="space-y-1.5">
          {/*
           * The whole sentence, not a bare "Rate" label. `dir="ltr"` on the
           * row: it is an equation of currency codes and digits, and letting
           * it take page direction puts the "1 EUR" at the wrong end in Hebrew.
           */}
          <div dir="ltr" className="flex items-center gap-2">
            <Label htmlFor={rateId} className="shrink-0 font-normal">
              {t('tx.rateSentence', { from: currency })}
            </Label>
            <Input
              id={rateId}
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(event) => {
                onRateChange(event.target.value);
              }}
              aria-invalid={problem !== undefined}
              aria-describedby={helpId}
              className="tabular h-11 max-w-40"
            />
            <span className="shrink-0 text-sm">{baseCurrency}</span>
          </div>
          {resolution.status === 'resolved' ? (
            <p className="text-xs text-muted-foreground">
              {t('tx.rateCharged', { currency: baseCurrency })}:{' '}
              <span dir="ltr" className="tabular">
                {toDecimalString(resolution.chargedMinor, baseCurrency)}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={chargedId}>{t('tx.rateCharged', { currency: baseCurrency })}</Label>
          <AmountInput
            id={chargedId}
            value={charged}
            onChange={onChargedChange}
            currency={baseCurrency}
            aria-describedby={helpId}
            aria-invalid={problem !== undefined}
          />
          {resolution.status === 'resolved' ? (
            <p dir="ltr" className="tabular text-xs text-muted-foreground">
              1 {currency} = {resolution.rate} {baseCurrency}
            </p>
          ) : null}
        </div>
      )}

      <div id={helpId} className="space-y-1 text-xs">
        {problem === undefined || problem.code === 'awaiting_amount' ? null : (
          <p className="text-destructive">{t(PROBLEM_KEY[problem.code])}</p>
        )}

        {warnings.map((warning) =>
          warning.code === 'rate_inverted' ? (
            <p key={warning.code} className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{t('tx.warnRateInverted', { suggestion: warning.suggestion })}</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  onEntryChange('rate');
                  onRateChange(warning.suggestion);
                }}
              >
                {t('action.undo')}
              </Button>
            </p>
          ) : (
            <p key={warning.code} className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t('tx.warnRateFar', {
                  known: warning.known,
                  date: formatLocalDate(warning.on, i18n.language, { dateStyle: 'medium' }),
                })}
              </span>
            </p>
          ),
        )}

        {isLooking ? (
          <p className="text-muted-foreground">{t('tx.rateChecking')}</p>
        ) : known === undefined ? null : (
          <p className="text-muted-foreground">
            {provenance(known.origin, known.rateDate, known.rateSource)}
          </p>
        )}
      </div>
    </section>
  );

  /** Where the prefilled number came from, in the user's terms. */
  function provenance(origin: 'cache' | 'network' | 'stale', on: string, source: RateSource): string {
    const date = formatLocalDate(on as never, i18n.language, { dateStyle: 'medium' });
    if (origin === 'stale') return t('tx.rateStale', { date });
    return t('tx.rateLive', { date, source: t(SOURCE_KEY[source]) });
  }
}

const PROBLEM_KEY = {
  // 'awaiting_amount' is deliberately absent: it is filtered out above, and
  // giving it a string would invite someone to render it.
  rate_required: 'tx.errRateRequired',
  rate_not_a_number: 'tx.errRateNotANumber',
  rate_not_positive: 'tx.errRateNotPositive',
  charged_not_positive: 'tx.errChargedNotPositive',
} as const;

const SOURCE_KEY = {
  frankfurter: 'tx.sourceFrankfurter',
  erapi: 'tx.sourceErapi',
  manual: 'tx.sourceManual',
  demo: 'tx.sourceDemo',
} as const;

export type { RateResolution };
