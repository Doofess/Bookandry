/** Ordered most to least predictable, which is also least to most surprising. */
export const GROUP_LABELS = {
  recurring: 'breakdown.groupRecurring',
  loans: 'breakdown.groupLoans',
  installments: 'breakdown.groupInstallments',
  yearly: 'breakdown.groupYearly',
  one_time: 'breakdown.groupOneTime',
} as const;
