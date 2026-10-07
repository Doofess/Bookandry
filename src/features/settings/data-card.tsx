import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { buildExport, importDocument, type ImportMode } from '@/db/transfer';
import { systemClock } from '@/lib/clock';
import { daysBetween, externalTimestampToLocalDate } from '@/lib/dates';
import type { IsoInstant, LocalDate } from '@/types/money';

import { DeleteData } from './delete-data';
import { downloadJson } from './download';

/**
 * Export and import.
 *
 * Local-first with no sync means export is the ONLY durability story, and both
 * the spec and my own first draft treated it as a settings row like any other.
 * It is not: a device that is lost or wiped takes every transaction with it,
 * and the app has no way to notice afterwards. Hence the age of the last
 * backup, stated plainly, and a nudge once it passes a month.
 */

/** Past this, the card says so. Long enough not to nag, short enough to matter. */
const NUDGE_AFTER_DAYS = 30;

export function DataCard({
  lastExportedAt,
  today,
  persisted,
  signedIn = false,
}: {
  readonly lastExportedAt: IsoInstant | undefined;
  readonly today: LocalDate;
  /** From `navigator.storage.persisted()`, or undefined while unknown. */
  readonly persisted: boolean | undefined;
  /**
   * Replace is off while signed in: wiping this device would sync as a delete
   * of every row, on every device on the account.
   */
  readonly signedIn?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [chosen, setMode] = useState<ImportMode>('merge');
  const mode: ImportMode = signedIn ? 'merge' : chosen;
  const fileRef = useRef<HTMLInputElement>(null);

  const age = ageInDays(lastExportedAt, today);

  const exportNow = async (): Promise<void> => {
    setBusy(true);
    try {
      const now = systemClock.nowIso();
      const envelope = await buildExport(db, now);
      downloadJson(envelope, now);
      // Recorded only after the file is handed over, so a failure part way
      // through does not reset the clock on a backup that never happened.
      await writeSettings(db, { lastExportedAt: now }, now);
      toast.success(t('settings.exported'));
    } catch {
      toast.error(t('tx.toastFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await importDocument(db, parsed, { mode, now: systemClock.nowIso() });

      if (result.ok) {
        toast.success(t('settings.importDone', { count: result.applied.transactions }));
        return;
      }

      // Each refusal is a different thing for the user to do, so each gets its
      // own sentence rather than one "import failed".
      switch (result.reason) {
        case 'busy':
          toast.error(t('settings.importBusy'));
          return;
        case 'unknown_version':
          toast.error(t('settings.importVersion'));
          return;
        case 'base_mismatch':
          toast.error(t('settings.importRefused', { currency: result.fileCurrency }));
          return;
        default:
          toast.error(t('settings.importInvalid'));
      }
    } catch {
      toast.error(t('settings.importInvalid'));
    } finally {
      setBusy(false);
      // Cleared, so choosing the SAME file twice fires a change event the
      // second time. Without this, a failed import cannot be retried.
      if (fileRef.current !== null) fileRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.dataTitle')}</CardTitle>
        <CardDescription>{t('settings.dataBody')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Button type="button" onClick={() => void exportNow()} disabled={busy} className="w-full">
            <Download className="size-4" aria-hidden="true" />
            {busy ? t('settings.exporting') : t('settings.export')}
          </Button>

          <p className="text-xs text-muted-foreground">
            {age === undefined
              ? t('settings.neverBackedUp')
              : t('settings.lastBackup', {
                  when: relative(age, i18n.language),
                })}
          </p>

          {age === undefined || age > NUDGE_AFTER_DAYS ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{t('settings.backupOverdue')}</p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <p id="import-mode" className="text-sm font-medium">
            {t('settings.importTitle')}
          </p>

          {/*
            The radiogroup is REQUIRED, not decorative.
            `role="radio"` with no radiogroup ancestor is invalid ARIA: the two
            options announce as standalone radios with no "1 of 2", no group
            name and no arrow-key semantics - and Testing Library's getByRole
            finds an orphan radio perfectly well, so unit tests pass while the
            markup is wrong. The same mistake as the first-run shape options.
          */}
          <div role="radiogroup" aria-labelledby="import-mode" className="grid gap-1.5">
            <ModeOption
              selected={mode === 'merge'}
              label={t('settings.importMerge')}
              hint={t('settings.importMergeHint')}
              onSelect={() => {
                setMode('merge');
              }}
            />
            <ModeOption
              selected={mode === 'replace'}
              label={t('settings.importReplace')}
              hint={t('settings.importReplaceHint')}
              destructive
              disabled={signedIn}
              onSelect={() => {
                setMode('replace');
              }}
            />
          </div>
          {signedIn ? (
            <p className="text-xs text-muted-foreground">{t('settings.importReplaceSignedIn')}</p>
          ) : null}

          {/*
            `sr-only`, not `hidden` - a hidden input cannot be opened by
            `.click()` in every browser - which means it IS in the accessibility
            tree and therefore needs a name. An unlabelled file input announces
            as "file upload, button" with nothing saying what file, and axe
            rates it critical.
          */}
          <input
            ref={fileRef}
            type="file"
            aria-label={t('settings.importFile')}
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void importFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              fileRef.current?.click();
            }}
            className="w-full"
          >
            <Upload className="size-4" aria-hidden="true" />
            {t('settings.importChoose')}
          </Button>
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-sm font-medium">{t('settings.storageTitle')}</p>
          {/*
            Reported, not assumed. `navigator.storage.persist()` is requested at
            boot and can be DENIED, and a browser that may evict the database is
            exactly when the backup nudge above stops being optional.
          */}
          {persisted === undefined ? null : (
            <p className="text-xs text-muted-foreground">
              {persisted ? t('settings.storagePersisted') : t('settings.storageBestEffort')}
            </p>
          )}
        </div>

        <DeleteData onBackup={exportNow} />
      </CardContent>
    </Card>
  );
}

function ModeOption({
  selected,
  label,
  hint,
  destructive = false,
  disabled = false,
  onSelect,
}: {
  readonly selected: boolean;
  readonly label: string;
  readonly hint: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={
        'rounded-xl border p-3 text-start transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 ' +
        (selected ? 'border-primary bg-accent' : 'border-border hover:bg-muted')
      }
    >
      <span className={`block text-sm font-medium ${destructive ? 'text-destructive' : ''}`}>{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function ageInDays(lastExportedAt: IsoInstant | undefined, today: LocalDate): number | undefined {
  if (lastExportedAt === undefined) return undefined;
  const on = externalTimestampToLocalDate(lastExportedAt);
  return on === undefined ? undefined : daysBetween(on, today);
}

/** "3 days ago", from Intl rather than from a hand-rolled table. */
function relative(days: number, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (days < 1) return format.format(0, 'day');
  if (days < 30) return format.format(-days, 'day');
  return format.format(-Math.round(days / 30), 'month');
}
