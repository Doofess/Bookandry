import { Download } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencySelect } from '@/components/currency-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PopOut, PopOutBody, PopOutContent } from '@/components/ui/pop-out';
import { Progress } from '@/components/ui/progress';
import { db } from '@/db/db';
import { quoteRate } from '@/db/rates-gateway';
import { reconvertDefaultCurrency, type ReconvertProgress } from '@/db/reconvert';
import { writeSettings } from '@/db/repos/settings';
import { buildExport } from '@/db/transfer';
import { systemClock } from '@/lib/clock';
import type { Currency, LocalDate } from '@/types/money';

import { downloadJson } from './download';

/**
 * Changing the base currency.
 *
 * The most destructive operation in the app: it recomputes every stored amount.
 * Three things make it safe rather than merely reversible in principle.
 *
 *  1. A BACKUP IS FORCED, not suggested. The button that starts the rewrite is
 *     disabled until one has been taken in this session. Export already exists;
 *     this is one button wired to it.
 *  2. IT RECOMPUTES FROM THE ORIGINAL AMOUNT, never from the converted one.
 *     Round-tripping through the base is lossy - 1.000 KWD becomes 501 JPY
 *     becomes 1.001 KWD - and that happens in `planReconversion`, not here.
 *  3. IT IS ALL OR NOTHING. A missing rate aborts before a single write, and
 *     the message says nothing was changed, because the difference between
 *     "failed" and "half applied" is the difference between retrying and
 *     reconstructing a year of history by hand.
 *
 * Also structural rather than checked: the plan requires the reconvert to
 * refuse while a mutation sheet is open, and it cannot be otherwise. The
 * transaction sheet lives in the FEED's URL and this lives in Settings, so one
 * tab cannot hold both. A second tab is stopped by the origin-wide lock.
 */

type Phase =
  | { readonly step: 'idle' }
  | { readonly step: 'fetching'; readonly progress: ReconvertProgress }
  | { readonly step: 'applying' }
  | { readonly step: 'done'; readonly currency: Currency }
  | { readonly step: 'failed'; readonly message: string };

export function ReconvertDialog({
  open,
  onOpenChange,
  currentCurrency,
  today,
  fixedTarget,
  onDone,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentCurrency: Currency;
  readonly today: LocalDate;
  /**
   * The currency to move to, not to be chosen: joining a household means
   * keeping the books in the household's.
   */
  readonly fixedTarget?: Currency;
  /** Called once everything is in the new currency. */
  readonly onDone?: (currency: Currency) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Currency>(fixedTarget ?? currentCurrency);
  const [backedUp, setBackedUp] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });

  const pickerId = useId();
  const isSame = target === currentCurrency;
  const running = phase.step === 'fetching' || phase.step === 'applying';

  const backup = async (): Promise<void> => {
    try {
      const now = systemClock.nowIso();
      const envelope = await buildExport(db, now);
      downloadJson(envelope, now);
      await writeSettings(db, { lastExportedAt: now }, now);
      setBackedUp(true);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  const run = async (): Promise<void> => {
    setPhase({ step: 'fetching', progress: { fetched: 0, total: 0 } });

    try {
      const result = await reconvertDefaultCurrency(db, currentCurrency, target, {
        /*
         * Every rate comes through the same gateway the transaction form uses -
         * cache first, then the network, with the backoff gate honoured. A
         * second fetch path would let the two disagree about which rate is
         * current, and this one writes the answer into a thousand rows.
         */
        fetchQuote: async (currency, date) => {
          const quote = await quoteRate(db, currency, target, date, {
            nowMs: systemClock.nowMs(),
            today,
          });
          return quote === undefined
            ? undefined
            : { rate: quote.rate, rateDate: quote.rateDate, source: quote.rateSource };
        },
        onProgress: (progress) => {
          setPhase({ step: 'fetching', progress });
        },
        now: systemClock.nowIso(),
      });

      if (result.ok) {
        setPhase({ step: 'done', currency: target });
        onDone?.(target);
        return;
      }

      // Each refusal is a different thing for the user to do.
      switch (result.reason) {
        case 'fetch_failed':
          setPhase({
            step: 'failed',
            message: `${t('reconvert.failedFetch')} ${t('reconvert.failedFetchList', {
              list: result.failed.slice(0, 6).join(', '),
            })}`,
          });
          return;
        case 'unresolved':
          setPhase({ step: 'failed', message: t('reconvert.failedUnresolved') });
          return;
        case 'busy':
          setPhase({ step: 'failed', message: t('reconvert.failedBusy') });
          return;
      }
    } catch {
      setPhase({ step: 'failed', message: t('reconvert.failedOther') });
    }
  };

  const footer =
    phase.step === 'done' ? (
      <Button
        type="button"
        variant="pill-solid"
        onClick={() => {
          onOpenChange(false);
        }}
      >
        {t('action.close')}
      </Button>
    ) : phase.step === 'failed' ? (
      <Button
        type="button"
        variant="pill-solid"
        onClick={() => {
          setPhase({ step: 'idle' });
        }}
      >
        {t('action.retry')}
      </Button>
    ) : running ? undefined : (
      <Button
        type="button"
        variant="destructive"
        // Forced, not suggested. The most destructive operation in the
        // app does not start until a backup exists.
        disabled={isSame || !backedUp}
        onClick={() => void run()}
      >
        {t('reconvert.start')}
      </Button>
    );

  return (
    <PopOut
      open={open}
      onOpenChange={(next) => {
        // Never dismissible mid-flight: the write is atomic, but a user who
        // closes the sheet during the fetch has no way to learn whether it
        // landed.
        if (running) return;
        if (!next) {
          setPhase({ step: 'idle' });
          setBackedUp(false);
          setTarget(fixedTarget ?? currentCurrency);
        }
        onOpenChange(next);
      }}
    >
      <PopOutContent size="compact">
        <PopOutBody
          title={t('reconvert.title', { currency: target })}
          subtitle={t('reconvert.body')}
          footer={footer}
        >
          <div className="space-y-4">
            {phase.step === 'done' ? (
              <>
                <p className="text-sm">{t('reconvert.done', { currency: phase.currency })}</p>
              </>
            ) : phase.step === 'failed' ? (
              <>
                <p role="alert" className="text-sm text-destructive">
                  {phase.message}
                </p>
              </>
            ) : running ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {phase.step === 'applying'
                    ? t('reconvert.applying')
                    : t('reconvert.fetching', {
                        done: phase.progress.fetched,
                        total: phase.progress.total,
                      })}
                </p>
                <Progress
                  value={
                    phase.step === 'applying' || phase.progress.total === 0
                      ? 100
                      : percent(phase.progress.fetched, phase.progress.total)
                  }
                />
              </div>
            ) : (
              <>
                {fixedTarget === undefined ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={pickerId} id={`${pickerId}-label`}>
                      {t('reconvert.pick')}
                    </Label>
                    <CurrencySelect
                      id={pickerId}
                      value={target}
                      onChange={setTarget}
                      aria-labelledby={`${pickerId}-label`}
                    />
                    {isSame ? <p className="text-xs text-muted-foreground">{t('reconvert.same')}</p> : null}
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground">{t('reconvert.manualKept')}</p>

                <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{t('reconvert.backupWhy')}</p>
                  <Button
                    type="button"
                    variant={backedUp ? 'outline' : 'default'}
                    className="w-full"
                    onClick={() => void backup()}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t('settings.export')}
                  </Button>
                  {backedUp ? (
                    <p className="text-xs text-muted-foreground">{t('reconvert.backupDone')}</p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </PopOutBody>
      </PopOutContent>
    </PopOut>
  );
}

/**
 * Whole percent, for the bar.
 *
 * `gate:money` bans `* 100` because that is the float-to-minor conversion
 * that loses agorot. A percentage of a fetch COUNT has no minor units to lose,
 * so this is the gate's documented escape hatch rather than a way around it -
 * spelled out on the line, where a reviewer sees it.
 */
function percent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100); // money-allow: a fetch count, not money
}
