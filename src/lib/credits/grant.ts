/** The only way credits are added. The same provider + external id is a no-op. */
export async function grantCredits(
  db: { $transaction: (fn: (tx: any) => Promise<unknown>) => Promise<unknown> },
  userId: string,
  provider: string,
  externalId: string,
  amount: number,
  source: string,
): Promise<{ granted: boolean; balanceAfter: number }> {
  const stripeId = `${provider}:${externalId}`
  return db.$transaction(async (tx: any) => {
    const existing = await tx.creditTransaction.findFirst({ where: { stripeId } })
    if (existing) return { granted: false, balanceAfter: existing.balanceAfter as number }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: amount } },
      select: { creditBalance: true },
    })
    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type: source,
        description: source,
        stripeId,
        balanceAfter: updated.creditBalance,
      },
    })
    return { granted: true, balanceAfter: updated.creditBalance as number }
  }) as Promise<{ granted: boolean; balanceAfter: number }>
}
