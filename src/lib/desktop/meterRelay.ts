import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { openHold, releaseHold, settleHold } from '@/lib/credits/escrow'
import { isUngatedAccount } from '@/lib/billing/accountAllow'
import { RelayRefused, runMetered } from '@/lib/billing/relayMeter'

const ESTIMATE = { think: 2, learn: 1, feedback: 1 } as const

export async function meterDesktopRelay<T>(
  userId: string,
  kind: keyof typeof ESTIMATE,
  run: () => Promise<T>,
): Promise<T> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true, isInternal: true, email: true },
  })
  if (!user) throw new RelayRefused('User not found')
  const estimate = ESTIMATE[kind]
  const jobId = randomUUID()
  return runMetered({
    balance: user.creditBalance,
    isInternal: isUngatedAccount(user.email, user.isInternal),
    estimate,
    run,
    openHold: async () => {
      await openHold(userId, jobId, estimate)
    },
    settle: async () => { await settleHold(jobId) },
    release: async () => { await releaseHold(jobId) },
  })
}
