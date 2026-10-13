import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { JobEvent } from '@/lib/queue/events'
import { humanStatusText } from '@/lib/jobs/humanStatus'
import { parseProgressEvents, type JobProgressEvent } from '@/lib/jobs/jobProgressEvents'

const TERMINAL = new Set(['COMPLETE', 'FAILED', 'CANCELLED'])
const ROTATE_MS = 280_000
const HEARTBEAT_MS = 25_000
const POLL_MS = 1_000

const STATUS_MAP: Record<string, JobEvent['status']> = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

function parseLastEventId(request: NextRequest): number {
  const parse = (raw: string | null): number => {
    const n = parseInt(raw ?? '', 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  // Browser reconnects send Last-Event-ID while the original URL may still say 0.
  return Math.max(
    parse(request.nextUrl.searchParams.get('lastEventId')),
    parse(request.headers.get('last-event-id')),
  )
}

function progressEventToJobEvent(jobId: string, event: JobProgressEvent, job: {
  status: string
  progressPct: number | null
  outputUrl: string | null
  outputUrls: string[] | null
  errorMessage: string | null
  userMessage?: string | null
}): JobEvent {
  const mapped = STATUS_MAP[job.status] ?? 'processing'
  const userMessage = humanStatusText(job.userMessage, undefined)
  const failed = mapped === 'failed'
  return {
    jobId,
    status: mapped,
    progress: event.pct ?? job.progressPct ?? undefined,
    message: humanStatusText(failed ? userMessage : undefined, event.detail) ?? userMessage,
    userMessage,
    outputUrl: job.outputUrl ?? undefined,
    outputUrls: job.outputUrls?.length ? job.outputUrls : undefined,
    error: failed ? (userMessage ?? job.errorMessage ?? undefined) : (job.errorMessage ?? undefined),
  }
}

function snapshotToJobEvent(
  jobId: string,
  job: {
    status: string
    progressPct: number | null
    outputUrl: string | null
    outputUrls: string[] | null
    errorMessage: string | null
    statusMessage: string | null
    userMessage?: string | null
  },
): JobEvent {
  const status = STATUS_MAP[job.status] ?? 'processing'
  const userMessage = humanStatusText(job.userMessage, undefined)
  const failed = status === 'failed'
  const message = failed
    ? (userMessage ?? humanStatusText(undefined, job.errorMessage) ?? humanStatusText(undefined, job.statusMessage))
    : humanStatusText(undefined, job.statusMessage)
  return {
    jobId,
    status,
    progress: job.progressPct ?? undefined,
    message,
    userMessage,
    outputUrl: job.outputUrl ?? undefined,
    outputUrls: job.outputUrls?.length ? job.outputUrls : undefined,
    error: failed ? (userMessage ?? humanStatusText(undefined, job.errorMessage) ?? job.errorMessage ?? undefined) : (job.errorMessage ?? undefined),
  }
}

/** DB-polling SSE with heartbeat, Last-Event-ID, and proactive rotation before Vercel 300s ceiling. */
export function createJobEventStream(request: NextRequest, jobId: string, userId: string): ReadableStream {
  const encoder = new TextEncoder()
  let lastEventId = parseLastEventId(request)

  return new ReadableStream({
    start(controller) {
      let closed = false
      let missingPolls = 0
      let pollTimer: ReturnType<typeof setInterval> | undefined
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let rotateTimer: ReturnType<typeof setTimeout> | undefined
      let lastSnapshotKey = ''

      const cleanup = () => {
        if (closed) return
        closed = true
        if (pollTimer) clearInterval(pollTimer)
        if (heartbeat) clearInterval(heartbeat)
        if (rotateTimer) clearTimeout(rotateTimer)
        try {
          controller.close()
        } catch (err) {
          console.warn("[caught] src/lib/jobs/jobEventStream.ts:94", err instanceof Error ? { name: err.name, message: err.message } : err)

          // already closed
        }
      }

      const sendId = (id: number, data: JobEvent) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`id:${id}\ndata:${JSON.stringify(data)}\n\n`),
          )
        } catch (err) {
          console.warn("[caught] src/lib/jobs/jobEventStream.ts:105", err instanceof Error ? { name: err.name, message: err.message } : err)

          cleanup()
        }
      }

      const poll = async () => {
        if (closed) return
        try {
          const job = await db.renderJob.findFirst({
            where: { id: jobId, userId },
            select: {
              status: true,
              progressPct: true,
              outputUrl: true,
              outputUrls: true,
              errorMessage: true,
              statusMessage: true,
              metadata: true,
            },
          })
          const interpreted = job
            ? await db.shotError.findFirst({
                where: { jobId },
                orderBy: { createdAt: 'desc' },
                select: { userMessage: true },
              })
            : null
          const userMessage = interpreted?.userMessage ?? null

          if (!job) {
            missingPolls += 1
            if (missingPolls < 4) return
            sendId(lastEventId + 1, { jobId, status: 'failed', error: 'Job not found' })
            cleanup()
            return
          }
          missingPolls = 0

          const events = parseProgressEvents(job.metadata)
          for (const event of events) {
            if (event.id > lastEventId) {
              sendId(event.id, progressEventToJobEvent(jobId, event, { ...job, userMessage }))
              lastEventId = event.id
            }
          }

          // Fallback for jobs without progressEvents (simple generate, legacy rows).
          if (events.length === 0) {
            const snapshotKey = `${job.status}|${job.progressPct ?? ''}|${job.statusMessage ?? ''}|${userMessage ?? ''}|${job.outputUrl ?? ''}`
            if (snapshotKey !== lastSnapshotKey) {
              lastSnapshotKey = snapshotKey
              const snapId = lastEventId + 1
              sendId(snapId, snapshotToJobEvent(jobId, { ...job, userMessage }))
              lastEventId = snapId
            }
          }

          if (TERMINAL.has(job.status)) cleanup()
        } catch (err) {
          console.warn("[caught] src/lib/jobs/jobEventStream.ts:155", err instanceof Error ? { name: err.name, message: err.message } : err)

          // transient DB error — keep polling
        }
      }

      void poll()
      pollTimer = setInterval(poll, POLL_MS)

      heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch (err) {
          console.warn("[caught] src/lib/jobs/jobEventStream.ts:167", err instanceof Error ? { name: err.name, message: err.message } : err)

          cleanup()
        }
      }, HEARTBEAT_MS)

      rotateTimer = setTimeout(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': rotate\n\n'))
        } catch (err) {
          // Best-effort stream write. The rotate still closes the controller.
          console.debug('[job-stream] rotate enqueue failed', {
            jobId,
            err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          })
        }
        cleanup()
      }, ROTATE_MS)

      request.signal.addEventListener('abort', cleanup)
    },
  })
}

export function jobStreamResponseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}
