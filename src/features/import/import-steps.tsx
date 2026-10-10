import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { CardFace } from '@/components/ui/card-face';
import { Chip } from '@/components/ui/chip';
import { HuePill } from '@/components/ui/hue-pill';
import type { MethodReviewItem } from '@/domain/import-cards';
import { bankKey, issuerKey, type MoneyKey } from '@/domain/money-key';

import { foundName } from './found-methods';

function keyOf(found: MethodReviewItem): MoneyKey {
  return found.kind === 'card' ? issuerKey(found.found.issuer) : bankKey(found.found.bank);
}

/** The card found, as it will look: its face on the ink sheet, then a sample row in its colour. */
export function ImportPreview({
  found,
  language,
}: {
  readonly found: MethodReviewItem | undefined;
  readonly language: string;
}) {
  const { t } = useTranslation('import');
  if (found === undefined) {
    return (
      <p data-slot="import-preview-empty" className="text-base font-light">
        {t('preview.empty')}
      </p>
    );
  }
  const name = foundName(found, language);
  const moneyKey = keyOf(found);
  const last = found.kind === 'card' ? found.found.lastDigits : undefined;
  return (
    <div data-slot="import-preview" className="flex flex-col gap-6">
      <CardFace
        variant="preview"
        moneyKey={moneyKey}
        issuerName={name}
        {...(last === undefined ? {} : { lastDigits: last })}
      />
      <div className="flex items-center gap-3" aria-hidden="true">
        <HuePill hue={undefined} />
        <Chip moneyKey={moneyKey}>{name}</Chip>
      </div>
    </div>
  );
}

/** Puts its children into the pop-out's footer once that exists; nothing before. */
export function FooterPortal({
  target,
  children,
}: {
  readonly target: HTMLElement | null;
  readonly children: React.ReactNode;
}) {
  return target === null ? null : createPortal(children, target);
}
