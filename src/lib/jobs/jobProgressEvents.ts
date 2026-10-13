import { db } from '@/lib/db'
import type { JobStatus, Prisma } from '@/generated/prisma/client'

export interface JobProgressEvent {
  id: number
  phase: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  detail?: string
  pct?: number
  at: number
}

export function parseProgressEvents(metadata: unknown): JobProgressEvent[] {
  if (!metadata || typeof metadata !== 'object') return []
  const events = (metadata as { progressEvents?: unknown }).progressEvents
  if (!Array.isArray(events)) return []
  return events.filter(
    (e): e is JobProgressEvent =>
      e != null &&
      typeof e === 'object' &&
      typeof (e as JobProgressEvent).id === 'number' &&
      typeof (e as JobProgressEvent).phase === 'string',
  )
}

export async function appendJobProgressEvent(
  jobId: string,
  event: {
    phase: string
    status: JobProgressEvent['status']
    detail?: string
    pct?: number
  },
  fields?: {
    status?: JobStatus
    progressPct?: number
    phase?: string
    statusMessage?: string
    etaSeconds?: number
    errorMessage?: string
    outputUrl?: string
    completedAt?: Date
  },
): Promise<void> {
  const job = await db.renderJob.findUnique({
    where: { id: jobId },
    select: { metadata: true },
  })
  const meta = (job?.metadata as Record<string, unknown>) ?? {}
  const events = parseProgressEvents(meta)
  const entry: JobProgressEvent = {
    id: events.length + 1,
    phase: event.phase,
    status: event.status,
    detail: event.detail,
    pct: event.pct,
    at: Date.now(),
  }
  const progressEvents = [...events, entry]

  const data: Prisma.RenderJobUpdateInput = {
    ...fields,
    metadata: { ...meta, progressEvents } as unknown as Prisma.InputJsonValue,
  }

  await db.renderJob.update({ where: { id: jobId }, data })
}
