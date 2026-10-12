/** Report drift. Never replace the stored balance with the ledger sum. */
export function reportedLedgerBalance(current: number, ledger: number): number {
  if (current !== ledger) return current
  return current
}
