import { randomUUID } from 'node:crypto'
import { consumeFromHold, EscrowError, openHold, releaseHold, settleHold } from '@/lib/credits/escrow'

export { EscrowError }

/** Hold the estimate, charge it when the paid call returns, give it back if the call throws. */
export async function withCreditHold<T>(userId: string, estimate: number, run: () => Promise<T>): Promise<T> {
  const jobId = randomUUID()
  const amount = Math.max(1, Math.ceil(estimate))
  await openHold(userId, jobId, amount)
  try {
    const value = await run()
    await consumeFromHold(jobId, 'delivery', amount)
    await settleHold(jobId)
    return value
  } catch (err) {
    try {
      await releaseHold(jobId)
    } catch (releaseErr) {
      console.warn('[hold] release', releaseErr instanceof Error ? releaseErr.message : releaseErr)
    }
    throw err
  }
}
