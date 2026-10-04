import { Pencil, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Fab } from '@/components/fab';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The + button, and the two ways to add: by hand, or by handing over a file
 * for the AI to read.
 *
 * The FAB is the menu's trigger, rendered through it so it keeps its fixed
 * place, its look and its test id while the menu adds the popup's ARIA state.
 * The menu opens above the button - it sits at the bottom of the screen - and
 * "Add manually" comes first, so Enter, Enter is still the quickest way to the
 * form.
 */
export function AddMenu({
  disabled,
  aiAvailable,
  onAddManually,
  onAddWithAi,
}: {
  readonly disabled: boolean;
  /** False in a build without accounts: reading a file needs the account's server. */
  readonly aiAvailable: boolean;
  readonly onAddManually: () => void;
  readonly onAddWithAi: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Fab />} disabled={disabled} />
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-max min-w-60 p-1.5"
        data-testid="add-menu"
      >
        <DropdownMenuItem className="min-h-12 gap-3 px-3 text-base" onClick={onAddManually}>
          <Pencil className="size-5" aria-hidden="true" />
          {t('addMenu.manual')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-12 gap-3 px-3 text-base"
          disabled={!aiAvailable}
          onClick={onAddWithAi}
        >
          <Sparkles className="size-5" aria-hidden="true" />
          <span className="flex flex-col">
            <span>{t('addMenu.ai')}</span>
            <span className="text-xs text-muted-foreground">
              {aiAvailable ? t('addMenu.aiHint') : t('addMenu.aiUnavailable')}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
