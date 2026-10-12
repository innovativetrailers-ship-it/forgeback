import { db } from '@/lib/db'
import { releaseHold } from '@/lib/credits/escrow'

const STUCK_AFTER_MS = 15 * 60 * 1000

export async function sweepStuckShots(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS)
  const stuck = await db.studioClip.findMany({
    where: { status: 'GENERATING', generatingAt: { lt: cutoff } },
    select: { id: true, generateClaimJobId: true },
  })
  if (stuck.length === 0) return 0
  await db.studioClip.updateMany({
    where: { id: { in: stuck.map((clip) => clip.id) } },
    data: { status: 'FAILED', generatingAt: null, statusReason: 'Stuck generation was stopped' },
  })
  for (const clip of stuck) {
    if (!clip.generateClaimJobId) continue
    try {
      await releaseHold(clip.generateClaimJobId)
    } catch (err) {
      console.warn('[watchdog] release', clip.id, err instanceof Error ? err.message : err)
    }
  }
  console.warn('[watchdog] swept stuck shots:', stuck.length)
  return stuck.length
}

export function startShotWatchdog(): () => void {
  void sweepStuckShots()
  const timer = setInterval(() => { void sweepStuckShots() }, 2 * 60 * 1000)
  return () => clearInterval(timer)
}
