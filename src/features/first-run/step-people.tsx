import { cn } from 'cn';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatars/avatar';
import { AvatarPicker, ColorPicker } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  addPerson,
  applyShape,
  canAddPerson,
  removePerson,
  updatePerson,
  validateDraft,
  type DraftIssue,
  type FirstRunDraft,
  type SetupShape,
} from '@/domain/first-run';
import { MAX_PROFILES } from '@/domain/palette';
import { NAME_MAX_LENGTH } from '@/domain/validation';

/**
 * Who is tracking money here.
 *
 * The shape chooser carries the whole point of the screen. A couple who are
 * never offered "two of us plus a shared household" will file joint groceries
 * under whoever happened to pay, notice the imbalance after three months, and
 * then live in "All" forever - at which point profiles were decoration. The
 * pattern cannot be retrofitted without re-filing history, so it has to be
 * offered before any history exists.
 *
 * The privacy line is not boilerplate either. There is no sign-in, so a profile
 * is organisation and not a secret, and a user who assumes otherwise will put
 * something private in a note.
 */
export function StepPeople({
  draft,
  onChange,
  showErrors,
}: {
  draft: FirstRunDraft;
  onChange: (draft: FirstRunDraft) => void;
  showErrors: boolean;
}) {
  const { t } = useTranslation(['common', 'profiles']);
  const issues = validateDraft(draft);
  const issueFor = (key: string, field: DraftIssue['field']) =>
    showErrors ? issues.find((i) => i.key === key && i.field === field) : undefined;

  const shape = (next: SetupShape): void => {
    // The household name comes from i18n rather than being hardcoded English:
    // a Hebrew user should get "משק בית", not "Household".
    onChange(applyShape(draft, next, t('profiles:household')));
  };

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend id="first-run-shape" className="mb-2 text-sm font-medium">
          {t('firstRun.shapeTitle')}
        </legend>
        {/*
          The radiogroup is REQUIRED, not decorative. `role="radio"` with no
          radiogroup ancestor is invalid ARIA: the options are announced as
          standalone radios with no "1 of 2", no group name, and no arrow-key
          semantics. A fieldset/legend groups native inputs, not ARIA roles -
          and Testing Library's getByRole finds an orphan radio perfectly well,
          so the unit tests passed while the markup was wrong.
        */}
        <div role="radiogroup" aria-labelledby="first-run-shape" className="grid gap-2">
          <ShapeOption
            selected={draft.shape === 'solo'}
            title={t('firstRun.shapeSolo')}
            hint={t('firstRun.shapeSoloHint')}
            onSelect={() => {
              shape('solo');
            }}
          />
          <ShapeOption
            selected={draft.shape === 'couple'}
            title={t('firstRun.shapeCouple')}
            hint={t('firstRun.shapeCoupleHint')}
            onSelect={() => {
              shape('couple');
            }}
          />
        </div>
      </fieldset>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        {t('firstRun.peoplePrivacy')}
      </p>

      <ul className="space-y-4">
        {draft.people.map((p, index) => (
          <li key={p.key} className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <Avatar avatar={p.avatar} color={p.color} size="md" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${p.key}-name`}>{t('firstRun.peopleName')}</Label>
                  <Input
                    id={`${p.key}-name`}
                    value={p.name}
                    autoComplete="off"
                    maxLength={NAME_MAX_LENGTH}
                    placeholder={index === 0 ? t('firstRun.peopleNamePlaceholder') : undefined}
                    aria-invalid={issueFor(p.key, 'name') !== undefined}
                    aria-describedby={issueFor(p.key, 'name') ? `${p.key}-name-error` : undefined}
                    onChange={(event) => {
                      onChange(updatePerson(draft, p.key, { name: event.target.value }));
                    }}
                    className="h-11"
                  />
                  <FieldError id={`${p.key}-name-error`} issue={issueFor(p.key, 'name')} />
                </div>

                <div className="space-y-1.5">
                  <span id={`${p.key}-color`} className="text-sm font-medium">
                    {t('profiles:color.label')}
                  </span>
                  <ColorPicker
                    value={p.color}
                    taken={draft.people.map((other) => other.color)}
                    labelledBy={`${p.key}-color`}
                    onChange={(color) => {
                      onChange(updatePerson(draft, p.key, { color }));
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <span id={`${p.key}-avatar`} className="text-sm font-medium">
                    {t('profiles:avatar.label')}
                  </span>
                  <AvatarPicker
                    value={p.avatar}
                    color={p.color}
                    labelledBy={`${p.key}-avatar`}
                    onChange={(avatar) => {
                      onChange(updatePerson(draft, p.key, { avatar }));
                    }}
                  />
                </div>
              </div>

              {draft.people.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('firstRun.peopleRemove', { name: p.name || t('firstRun.peopleName') })}
                  onClick={() => {
                    onChange(removePerson(draft, p.key));
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={!canAddPerson(draft)}
          onClick={() => {
            onChange(addPerson(draft));
          }}
        >
          {/* Plus is non-directional; it needs no RTL treatment. */}
          <Plus className="size-4" aria-hidden="true" />
          {t('firstRun.peopleAdd')}
        </Button>
        {!canAddPerson(draft) ? (
          // A reason, not a form that fails on submit.
          <p className="mt-2 text-sm text-muted-foreground">{t('profiles:limit', { count: MAX_PROFILES })}</p>
        ) : null}
      </div>
    </div>
  );
}

function ShapeOption({
  selected,
  title,
  hint,
  onSelect,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'rounded-xl border p-3 text-start transition',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
        selected ? 'border-primary bg-accent' : 'border-border hover:bg-muted',
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
    </button>
  );
}

function FieldError({ id, issue }: { id: string; issue: DraftIssue | undefined }) {
  const { t } = useTranslation();
  if (issue === undefined) return null;

  const message =
    issue.reason === 'too_long'
      ? t('validation.nameTooLong', { count: NAME_MAX_LENGTH })
      : issue.reason === 'duplicate'
        ? t('validation.nameDuplicate')
        : t('validation.nameRequired');

  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
