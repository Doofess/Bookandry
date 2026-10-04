import type { SheetTarget } from '@/features/transaction/use-transaction-sheet';
import type { Category, PaymentMethod, Profile } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type ImportSheetProps = {
  readonly target: Extract<SheetTarget, { mode: 'import' }>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenRow: (row: number | undefined) => void;
  readonly profiles: readonly Profile[];
  readonly categories: readonly Category[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly activeProfileId: string;
  readonly baseCurrency: Currency;
  readonly today: LocalDate;
  readonly onSaved: (date: LocalDate) => void;
};

/** "Add with AI". Filled in by the import stages. */
export function ImportSheet(_props: ImportSheetProps) {
  return null;
}
