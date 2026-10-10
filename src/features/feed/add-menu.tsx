import { HandCoins, type LucideIcon, Plus, ShoppingBag, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useDesktop } from '@/app/use-desktop';
import { AddButton } from '@/components/add-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Kind } from '@/types/money';

/**
 * The Add pill, and the ways to add: an expense, income, or a file for the
 * AI to read.
 *
 * The pill is the menu's trigger, rendered through it so it keeps its fixed
 * place and its test id while the menu adds the popup's ARIA state. The menu
 * opens above it, and Expense comes first, so Enter, Enter is still the
 * quickest way to the form. On a desktop the same menu hangs from the rail's Add.
 */
export function AddMenu({
  placement = 'floating',
  disabled,
  aiAvailable,
  onAdd,
  onAddWithAi,
}: {
  /** 'floating': the phone's pill, above the tab bar. 'rail': the solid pill at the top of the desktop rail. */
  readonly placement?: 'floating' | 'rail';
  readonly disabled: boolean;
  /** False in a build without accounts: reading a file needs the account's server. */
  readonly aiAvailable: boolean;
  readonly onAdd: (kind: Kind) => void;
  readonly onAddWithAi: () => void;
}) {
  const { t } = useTranslation();
  const desktop = useDesktop();
  // From lg, Add is in the rail on every screen (§4.2): the floating pill is the phone's.
  if (placement === 'floating' && desktop) return null;
  const rail = placement === 'rail';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          rail ? <Button variant="pill-solid" data-testid="rail-add" className="w-full" /> : <AddButton />
        }
        disabled={disabled}
      >
        {rail ? (
          <>
            {/* Plus is non-directional: it must NOT carry rtl:rotate-180. */}
            <Plus aria-hidden="true" />
            {t('addMenu.add')}
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={rail ? 'bottom' : 'top'}
        align={rail ? 'start' : 'center'}
        sideOffset={10}
        className="w-72 p-1.5"
        data-testid="add-menu"
      >
        <AddItem
          icon={ShoppingBag}
          title={t('addMenu.expense')}
          hint={t('addMenu.expenseHint')}
          onClick={() => {
            onAdd('expense');
          }}
        />
        <AddItem
          icon={HandCoins}
          title={t('addMenu.income')}
          hint={t('addMenu.incomeHint')}
          onClick={() => {
            onAdd('income');
          }}
        />
        <DropdownMenuSeparator />
        <AddItem
          icon={Sparkles}
          title={t('addMenu.ai')}
          hint={aiAvailable ? t('addMenu.aiHint') : t('addMenu.aiUnavailable')}
          disabled={!aiAvailable}
          onClick={onAddWithAi}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One item of an Add menu: an icon on the sapphire tint, a title and a hint. Also the cash tab's. */
export function AddItem({
  icon: Icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <DropdownMenuItem className="min-h-12 gap-3 px-2.5 py-2" disabled={disabled} onClick={onClick}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="text-base font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}
