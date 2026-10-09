import { BanknoteArrowDown, BanknoteArrowUp, HandCoins, ShoppingBag, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AddButton } from '@/components/add-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddItem } from '@/features/feed/add-menu';

/**
 * The cash tab's own Add pill. The moves that never touch the balance come
 * first - out of the ATM, into the bank, and a count - then, past a divider,
 * the ordinary form preset to cash. The moves wait until someone in view has
 * said how much cash they have: before that there is nothing for them to move.
 */
export function CashAddMenu({
  disabled,
  canMove,
  onMove,
  onCount,
  onCashExpense,
  onCashIncome,
}: {
  readonly disabled: boolean;
  readonly canMove: boolean;
  readonly onMove: (kind: 'withdraw' | 'deposit') => void;
  readonly onCount: () => void;
  readonly onCashExpense: () => void;
  readonly onCashIncome: () => void;
}) {
  const { t } = useTranslation();
  const blocked = t('cash.menu.setUpFirst');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<AddButton />} disabled={disabled} />
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-72 p-1.5"
        data-testid="cash-add-menu"
      >
        <AddItem
          icon={BanknoteArrowDown}
          title={t('cash.menu.withdraw')}
          hint={canMove ? t('cash.menu.withdrawHint') : blocked}
          disabled={!canMove}
          onClick={() => {
            onMove('withdraw');
          }}
        />
        <AddItem
          icon={BanknoteArrowUp}
          title={t('cash.menu.deposit')}
          hint={canMove ? t('cash.menu.depositHint') : blocked}
          disabled={!canMove}
          onClick={() => {
            onMove('deposit');
          }}
        />
        <AddItem
          icon={Wallet}
          title={t('cash.menu.count')}
          hint={canMove ? t('cash.menu.countHint') : blocked}
          disabled={!canMove}
          onClick={onCount}
        />
        <DropdownMenuSeparator />
        <AddItem
          icon={ShoppingBag}
          title={t('cash.menu.expense')}
          hint={t('cash.menu.expenseHint')}
          onClick={onCashExpense}
        />
        <AddItem
          icon={HandCoins}
          title={t('cash.menu.income')}
          hint={t('cash.menu.incomeHint')}
          onClick={onCashIncome}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
