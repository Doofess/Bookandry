import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/person-avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import type { Profile } from '@/types/domain';

/**
 * Deleting a profile that still owns money.
 *
 * The repo REFUSES, with a count, rather than cascading - and this is the other
 * half of that decision. A dialog that says "move 214 transactions to Yossi" is
 * a choice the user makes; a silent cascade is data loss they discover a month
 * later when a year of rent is missing from the chart.
 *
 * Two cases the plan names explicitly:
 *  - The LAST profile cannot be deleted. Every transaction belongs to exactly
 *    one, and the Add form has no options without one, so an app with zero
 *    profiles is an app that cannot be used.
 *  - Personal payment methods go WITH the profile - deleted if nothing is
 *    reassigned - and the dialog says how many. Shared household methods belong
 *    to nobody and are untouched.
 */
export function DeleteProfileDialog({
  profile,
  others,
  transactionCount,
  paymentMethodCount,
  onOpenChange,
  onConfirm,
  busy,
}: {
  /** The profile being deleted, or undefined when closed. */
  readonly profile: Profile | undefined;
  readonly others: readonly Profile[];
  readonly transactionCount: number;
  readonly paymentMethodCount: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (reassignTo: string | undefined) => void;
  readonly busy: boolean;
}) {
  const { t } = useTranslation(['common', 'profiles']);
  const groupId = useId();
  const [reassignTo, setReassignTo] = useState<string | undefined>(undefined);

  const isLast = others.length === 0;
  const needsTarget = transactionCount > 0;
  const target = reassignTo ?? others[0]?.id;
  const canDelete = !busy && !isLast && (!needsTarget || target !== undefined);

  return (
    <AlertDialog
      open={profile !== undefined}
      onOpenChange={(next) => {
        if (!next) setReassignTo(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('profiles:screen.deleteTitle', { name: profile?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isLast
              ? t('profiles:screen.deleteLast')
              : needsTarget
                ? t('profiles:screen.deleteBusyBody', { count: transactionCount })
                : t('profiles:screen.deleteEmptyBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLast || !needsTarget ? null : (
          <div className="space-y-2 px-1">
            <Label id={groupId}>{t('profiles:screen.deleteMoveTo')}</Label>
            {/*
              A radiogroup, not a select: with two or three profiles the whole
              choice fits on screen, and the consequence of picking wrong is
              hundreds of transactions filed under the wrong person.
            */}
            <div role="radiogroup" aria-labelledby={groupId} className="grid gap-1.5">
              {others.map((other) => {
                const selected = other.id === target;
                return (
                  <button
                    key={other.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setReassignTo(other.id);
                    }}
                    className={
                      'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-start transition ' +
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ' +
                      (selected ? 'border-primary bg-accent' : 'border-border hover:bg-muted')
                    }
                  >
                    <PersonAvatar person={other} size="sm" />
                    <span className="truncate text-sm">{other.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isLast || needsTarget || paymentMethodCount === 0 ? null : (
          <p className="px-1 text-sm text-muted-foreground">
            {t('profiles:screen.deleteMethodsWarning', { count: paymentMethodCount })}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
          {isLast ? null : (
            <AlertDialogAction
              variant="destructive"
              disabled={!canDelete}
              onClick={() => {
                onConfirm(needsTarget ? target : undefined);
              }}
            >
              {t('profiles:screen.deleteConfirm')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
