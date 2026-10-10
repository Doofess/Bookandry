import { CalendarClock } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { usePrime } from '@/app/prime';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PopOut, PopOutBody, PopOutContent } from '@/components/ui/pop-out';
import { db } from '@/db/db';
import { splitPurchase } from '@/db/split-purchase';
import { CARD_CURRENCY } from '@/domain/cards';
import { dealWarnings } from '@/domain/deal-rules';
import { isSplitCount, splitRate, splitSchedule, splitTiming } from '@/domain/split-purchase';
import { systemClock } from '@/lib/clock';
import { formatLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { normalizeAnnualRate } from '@/lib/money';
import type { LocalDate } from '@/types/money';

import { AnnualRateField, DealNotes, ScheduleLines } from './recurrence-fields';
import type { SplitOffer } from './use-split-offer';

/**
 * "Split into payments" on a purchase already saved: the card's חלוקת עסקה
 * (or העברה לקרדיט), at its split rate, with interest from today.
 *
 * The purchase itself becomes the plan; it is never a second row. Its first
 * payment is the card's next bill - or, if the purchase was billed already,
 * the bill after that. The card's rules are warnings, as on the purchase
 * form: the card company may know better.
 */
export function SplitPurchaseSheet({
  offer,
  today,
  onOpenChange,
  onDone,
}: {
  /** The row being split, or undefined when closed. */
  readonly offer: SplitOffer | undefined;
  readonly today: LocalDate;
  readonly onOpenChange: (open: boolean) => void;
  /** Split: the date of the plan's first payment. */
  readonly onDone: (date: LocalDate) => void;
}) {
  const { t } = useTranslation();
  return (
    // A one-pane pop-out over the panel (§6.3): a short form, capped at 36rem.
    <PopOut open={offer !== undefined} onOpenChange={onOpenChange}>
      <PopOutContent size="compact">
        <PopOutBody title={t('split.title')}>
          {offer === undefined ? null : (
            <SplitForm
              key={offer.occurrence.key}
              offer={offer}
              today={today}
              onDone={onDone}
              onCancel={() => {
                onOpenChange(false);
              }}
            />
          )}
        </PopOutBody>
      </PopOutContent>
    </PopOut>
  );
}

function SplitForm({
  offer,
  today,
  onDone,
  onCancel,
}: {
  readonly offer: SplitOffer;
  readonly today: LocalDate;
  readonly onDone: (date: LocalDate) => void;
  readonly onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const prime = usePrime();
  const countId = useId();
  const { occurrence, method, resolved, rule, billingDay } = offer;
  const lang = i18n.language.startsWith('he') ? 'he' : 'en';
  const dealName = rule.label[lang];

  const [count, setCount] = useState(String(rule.payments?.min ?? 3));
  const [rate, setRate] = useState(() => splitRate(method, resolved, prime).rate);
  const [saving, setSaving] = useState(false);

  const money = occurrence.money;
  const payments = Number(count);
  const validCount = isSplitCount(payments);
  const annual = normalizeAnnualRate(rate);
  const timing = splitTiming(occurrence.transaction.date, billingDay, today);
  const resetAt = rule.rate?.reset?.atPayment;

  const shekels = money.currency === CARD_CURRENCY ? money.amountMinor : undefined;
  const warnings = !validCount
    ? []
    : dealWarnings(rule, {
        // The minimums are in shekels: unchecked while the amount is not known in them.
        amountMinor: shekels ?? Number.MAX_SAFE_INTEGER,
        payments,
        abroad: money.currency !== CARD_CURRENCY,
      }).filter((w) => shekels !== undefined || (w.code !== 'min_deal' && w.code !== 'min_payment'));

  const schedule =
    !validCount || annual === undefined
      ? undefined
      : splitSchedule({
          principalMinor: money.amountMinor,
          rate: annual,
          count: payments,
          today,
          firstCharge: timing.firstCharge,
          dayCount: rule.rate?.dayCount ?? 'actual/365',
          compounding: rule.rate?.compounding ?? 12,
          resetAt,
          primeRate: prime.primeRate,
        });

  const save = async (): Promise<void> => {
    if (schedule === undefined || annual === undefined) return;
    setSaving(true);
    try {
      await splitPurchase(db, {
        transactionId: occurrence.transaction.id,
        count: payments,
        rate: annual,
        totalMinor: money.amountMinor + schedule.interestMinor,
        timing,
        principalMinor: schedule.principalMinor,
        resetAt,
        primeRate: prime.primeRate,
        // Today as it is now, not as the sheet opened: a save just after the
        // device wakes must not take a bill already charged for one to come.
        today: systemClock.today(),
        now: systemClock.nowIso(),
        newId,
      });
      onDone(timing.planDate);
    } catch {
      // One transaction: a failure changed nothing.
      toast.error(t('tx.toastFailed'));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{occurrence.note ?? dealName}</span>
        <Money minor={money.amountMinor} currency={money.currency} className="shrink-0 font-medium" />
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={countId}>{t('tx.installmentCount')}</Label>
        <Input
          id={countId}
          type="text"
          inputMode="numeric"
          value={count}
          onChange={(event) => {
            setCount(event.target.value.replace(/\D/g, '').slice(0, 2));
          }}
          aria-invalid={!validCount}
          className="h-11 w-24"
        />
      </div>

      <AnnualRateField
        value={rate}
        onChange={setRate}
        hint={rate === '' ? t('deal.needRate', { deal: dealName }) : t('tx.annualRateHint')}
        error={undefined}
      />

      <DealNotes dealName={dealName} warnings={warnings} needRate={false} onOpenCard={onCancel} />

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t('tx.cardCharged', {
            date: formatLocalDate(timing.firstCharge, i18n.language, { dateStyle: 'medium' }),
          })}
        </span>
      </p>

      {schedule === undefined ? null : <ScheduleLines schedule={schedule} currency={money.currency} />}

      <div data-slot="popout-actions" className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 flex-1">
          {t('action.cancel')}
        </Button>
        <Button
          type="button"
          disabled={saving || schedule === undefined}
          onClick={() => void save()}
          className="min-h-11 flex-1"
        >
          {t('split.save')}
        </Button>
      </div>
    </div>
  );
}
