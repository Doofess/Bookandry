import { Archive, Pencil, Percent, ReceiptText, Sparkles } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PopupItemContent, useAnchoredPopup } from '@/components/ui/popup-parts';
import type { PaymentMethod } from '@/types/domain';

export type CardMenuAction = 'edit' | 'rates' | 'transactions' | 'import' | 'archive';

export type CardMenuTarget = { readonly card: PaymentMethod; readonly anchor: HTMLElement };

/**
 * Everything to do with one card, from its face or its ⋯: ONE menu for the
 * screen, anchored to whichever was pressed, as the feed's row menu is.
 *
 *  - The INTEREST TABLE is offered only for a card linked to the card
 *    catalog, which is where its rates come from. It opens the card's editor
 *    on the rates, so an override is saved where every other edit is.
 *  - IMPORT A STATEMENT needs the account server, which reads the file. Without
 *    one it is shown disabled with the reason, as the Add menu's import is.
 *  - ARCHIVE puts the card away, with the same Undo toast as the row menu's.
 */
export function CardMenu({
  target,
  aiAvailable,
  onClose,
  onAction,
}: {
  /** The card whose menu is open, with what was pressed; undefined when closed. */
  readonly target: CardMenuTarget | undefined;
  /** Whether Smart import can run: there is an account server to read the file. */
  readonly aiAvailable: boolean;
  readonly onClose: () => void;
  readonly onAction: (action: CardMenuAction, card: PaymentMethod) => void;
}) {
  const { t } = useTranslation(['cards', 'common']);
  const { shown, anchor, popupRef, finalFocus } = useAnchoredPopup(target, onClose);

  const card = shown?.card;
  const act = (action: CardMenuAction) => () => {
    if (card !== undefined) onAction(action, card);
  };

  return (
    <DropdownMenu
      open={target !== undefined}
      // Not modal, as the row menu: the page still scrolls under it, and a
      // scroll closes it. A tap outside presses nothing underneath: the arrowed
      // content's backdrop catches it.
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuContent
        anchor={anchor}
        arrow
        side="bottom"
        align="end"
        className="w-64 p-1.5"
        data-testid="card-menu"
        ref={popupRef}
        finalFocus={finalFocus}
      >
        {card === undefined ? null : (
          <>
            <MenuRow icon={Pencil} label={t('cardMenu.edit')} onClick={act('edit')} />
            {card.card?.catalog === undefined ? null : (
              <MenuRow icon={Percent} label={t('cardMenu.rates')} onClick={act('rates')} />
            )}
            <MenuRow icon={ReceiptText} label={t('cardMenu.transactions')} onClick={act('transactions')} />
            <MenuRow
              icon={Sparkles}
              label={t('cardMenu.import')}
              hint={aiAvailable ? undefined : t('common:addMenu.aiUnavailable')}
              disabled={!aiAvailable}
              onClick={act('import')}
            />
            <DropdownMenuSeparator />
            <MenuRow icon={Archive} label={t('cardMenu.archive')} onClick={act('archive')} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* None of these icons encodes a direction, so none is flipped in Hebrew. */
function MenuRow({
  disabled = false,
  onClick,
  ...content
}: ComponentProps<typeof PopupItemContent> & {
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <DropdownMenuItem className="gap-3 px-2.5 py-2" disabled={disabled} onClick={onClick}>
      <PopupItemContent {...content} />
    </DropdownMenuItem>
  );
}
