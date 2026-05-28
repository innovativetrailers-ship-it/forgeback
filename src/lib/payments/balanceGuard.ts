/* eslint-disable @typescript-eslint/no-explicit-any */
export const LOW_BALANCE_THRESHOLD_CREDITS = 50
export const CRITICAL_BALANCE_CREDITS      = 10

export async function checkBalance(
  db:              any,
  userId:          string,
  requiredCredits: number
): Promise<{ canProceed: boolean; warning?: string }> {
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })

  if (user?.role === 'ADMIN') return { canProceed: true }

  const balance = user?.creditBalance ?? 0

  if (balance < requiredCredits) {
    return {
      canProceed: false,
      warning:    `Insufficient credits. You have ${balance} credits, this operation needs ${requiredCredits}.`,
    }
  }

  if (balance < LOW_BALANCE_THRESHOLD_CREDITS) {
    return {
      canProceed: true,
      warning:    `Low balance: ${balance} credits remaining. Consider topping up.`,
    }
  }

  return { canProceed: true }
}
