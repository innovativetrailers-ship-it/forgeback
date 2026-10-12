/**
 * Layer 1 — credit escrow: hold at job start, consume per delivered segment, settle on end.
 */

import { db } from '@/lib/db'

export class EscrowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EscrowError'
  }
}

export async function openHold(
  userId: string,
  jobId: string,
  estimateCredits: number,
  budgetCap?: number,
): Promise<number> {
  if (!Number.isFinite(estimateCredits) || estimateCredits <= 0) {
    throw new EscrowError('Cost estimate was not a finite credit number')
  }
  const held = Math.ceil(estimateCredits * 1.2)

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true, role: true, heldCredits: true, isInternal: true },
  })
  if (!user) throw new EscrowError('User not found')
  if (user.isInternal) {
    await db.creditHold.upsert({
      where: { jobId },
      create: { userId, jobId, amountHeld: 0, amountUsed: 0, status: 'ACTIVE', budgetCap },
      update: { budgetCap },
    })
    return 0
  }

  const available = user.creditBalance
  if (available < held) {
    throw new EscrowError(`Insufficient credits: need ${held} held, have ${available}`)
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gte: held } },
      data: {
        creditBalance: { decrement: held },
        heldCredits: { increment: held },
      },
    })
    if (updated.count !== 1) {
      throw new EscrowError(`Insufficient credits: need ${held} held`)
    }
    await tx.creditHold.upsert({
      where: { jobId },
      create: { userId, jobId, amountHeld: held, amountUsed: 0, status: 'ACTIVE', budgetCap },
      update: { amountHeld: held, amountUsed: 0, status: 'ACTIVE', budgetCap },
    })
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -held,
        type: 'hold',
        description: `Escrow hold for job ${jobId}`,
        balanceAfter: available - held,
      },
    })
  })

  return held
}

export async function consumeFromHold(
  jobId: string,
  segmentId: string,
  cost: number,
): Promise<void> {
  if (cost <= 0) return

  const hold = await db.creditHold.findUnique({ where: { jobId } })
  if (!hold || hold.status !== 'ACTIVE') return

  await db.$transaction([
    db.creditHold.update({
      where: { jobId },
      data: { amountUsed: { increment: cost } },
    }),
    db.segmentLedger.create({
      data: { jobId, segmentId, cost },
    }),
  ])
}

export async function getHold(jobId: string) {
  return db.creditHold.findUnique({ where: { jobId } })
}

export async function settleHold(jobId: string): Promise<{ used: number; refunded: number } | null> {
  const hold = await db.creditHold.findUnique({ where: { jobId } })
  if (!hold || hold.status !== 'ACTIVE') return null

  const unused = Math.max(0, hold.amountHeld - hold.amountUsed)
  const user = await db.user.findUnique({
    where: { id: hold.userId },
    select: { creditBalance: true, isInternal: true },
  })

  if (user?.isInternal || hold.amountHeld <= 0) {
    await db.creditHold.update({
      where: { jobId },
      data: { status: 'SETTLED', settledAt: new Date() },
    })
    return { used: hold.amountUsed, refunded: 0 }
  }

  const afterRelease = (user?.creditBalance ?? 0) + hold.amountHeld
  const afterDeduction = afterRelease - hold.amountUsed

  await db.$transaction([
    db.user.update({
      where: { id: hold.userId },
      data: {
        creditBalance: { increment: unused },
        heldCredits: { decrement: hold.amountHeld },
      },
    }),
    db.creditHold.update({
      where: { jobId },
      data: { status: 'SETTLED', settledAt: new Date() },
    }),
    db.creditTransaction.create({
      data: {
        userId: hold.userId,
        amount: hold.amountHeld,
        type: 'release',
        description: `Escrow release for job ${jobId}`,
        jobId,
        balanceAfter: afterRelease,
      },
    }),
    ...(hold.amountUsed > 0
      ? [db.creditTransaction.create({
          data: {
            userId: hold.userId,
            amount: -hold.amountUsed,
            type: 'deduction',
            description: `Render deduction for job ${jobId}`,
            jobId,
            balanceAfter: afterDeduction,
          },
        })]
      : []),
  ])

  return { used: hold.amountUsed, refunded: unused }
}

/** Failure or cancel: give the whole hold back. No charge. */
export async function releaseHold(jobId: string): Promise<void> {
  const hold = await db.creditHold.findUnique({ where: { jobId } })
  if (!hold || hold.status !== 'ACTIVE') return
  const user = await db.user.findUnique({
    where: { id: hold.userId },
    select: { creditBalance: true, isInternal: true },
  })
  if (!user || user.isInternal || hold.amountHeld <= 0) {
    await db.creditHold.update({
      where: { jobId },
      data: { status: 'REFUNDED', settledAt: new Date() },
    })
    return
  }
  const balanceAfter = user.creditBalance + hold.amountHeld
  await db.$transaction([
    db.user.update({
      where: { id: hold.userId },
      data: {
        creditBalance: { increment: hold.amountHeld },
        heldCredits: { decrement: hold.amountHeld },
      },
    }),
    db.creditHold.update({
      where: { jobId },
      data: { status: 'REFUNDED', settledAt: new Date() },
    }),
    db.creditTransaction.create({
      data: {
        userId: hold.userId,
        amount: hold.amountHeld,
        type: 'release',
        description: `Released hold for job ${jobId}`,
        jobId,
        balanceAfter,
      },
    }),
  ])
}
