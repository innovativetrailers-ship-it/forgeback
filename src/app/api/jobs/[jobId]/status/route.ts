import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseProgressEvents } from '@/lib/jobs/jobProgressEvents'
import { humanStatusText } from '@/lib/jobs/humanStatus'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth()
  const userId = (await requireUser(request))?.id ??  session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId } = await params

  const job = await db.renderJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      type: true,
      status: true,
      progressPct: true,
      phase: true,
      statusMessage: true,
      etaSeconds: true,
      outputUrl: true,
      outputUrls: true,
      errorMessage: true,
      creditsCharged: true,
      modelUsed: true,
      createdAt: true,
      completedAt: true,
      metadata: true,
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status === 'COMPLETE' && job.outputUrl) {
    const { resolveJobPlaybackUrl } = await import('@/lib/storage/persistMedia')
    const resolved = await resolveJobPlaybackUrl(jobId, userId, job.outputUrl)
    if (resolved && resolved !== job.outputUrl) {
      job.outputUrl = resolved
    }
  }

  const streamStatus =
    job.status === 'COMPLETE' ? 'complete'
    : job.status === 'FAILED' ? 'failed'
    : job.status === 'QUEUED' ? 'queued'
    : 'processing'

  const progressEvents = parseProgressEvents(job.metadata)
  const interpreted = await db.shotError.findFirst({
    where: { jobId },
    orderBy: { createdAt: 'desc' },
    select: { userMessage: true },
  })
  const userMessage = humanStatusText(interpreted?.userMessage, undefined)
  const failed = streamStatus === 'failed'

  return NextResponse.json({
    ...job,
    status: streamStatus,
    progress: job.progressPct,
    userMessage,
    message: failed
      ? (userMessage ?? humanStatusText(undefined, job.errorMessage) ?? humanStatusText(undefined, job.statusMessage))
      : humanStatusText(undefined, job.statusMessage),
    error: failed
      ? (userMessage ?? humanStatusText(undefined, job.errorMessage) ?? job.errorMessage)
      : job.errorMessage,
    outputUrl: job.outputUrl,
    result: job.status === 'COMPLETE' ? { outputUrl: job.outputUrl } : null,
    lastEvent: progressEvents.at(-1) ?? null,
  })
}
