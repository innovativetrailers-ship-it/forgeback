/** Sum of every ledger row. Hold and release rows are already inside that sum. */
export function ledgerBalance(rows: Array<{ amount: number }>): number {
  return rows.reduce((sum, row) => sum + row.amount, 0)
}

/** Internal accounts are unmetered. A user with too few credits is blocked. */
export function shouldMeter(input: { isInternal: boolean; balance: number; required: number }): {
  allowed: boolean
  hold: number
  metered: boolean
} {
  if (input.isInternal) return { allowed: true, hold: 0, metered: false }
  if (input.required > 0 && input.balance < input.required) {
    return { allowed: false, hold: 0, metered: true }
  }
  return { allowed: true, hold: Math.max(0, input.required), metered: input.required > 0 }
}
