import { storeForUser } from '@/lib/storage/objects'
const TEARDOWN_MSGS = ['Connection is closed', "stream isn't writeable", 'ECONNRESET']
process.on('uncaughtException', (err) => {
  if (TEARDOWN_MSGS.some((m) => err.message?.includes(m))) return
  console.error('[export-worker] Uncaught exception:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  const msg = (reason as Error)?.message ?? String(reason)
  if (TEARDOWN_MSGS.some((m) => msg.includes(m))) return
  console.error('[export-worker] Unhandled rejection:', reason)
})

import { Worker } from 'bullmq'
import { bullmqRedis, bullMQPrefix } from '../../redis'
import { db } from '../../db'
import { broadcastJobEvent } from '../events'
import { refundCredits } from '../../credits'
import { uploadToR2 } from '../../storage/r2'
import { nanoid } from 'nanoid'

interface ExportJobPayload {
  jobId: string
  userId: string
  projectId: string
  format: 'mp4_1080p' | 'mp4_4k' | 'prores_422' | 'prores_4444' | 'dcp'
  timelineJson: unknown
  resolution?: string
}

export const exportWorker = new Worker<ExportJobPayload>(
  'export',
  async (job) => {
    const { jobId, userId, projectId, format } = job.data

    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    })

    await broadcastJobEvent({
      jobId,
      status: 'processing',
      progress: 5,
      message: `Preparing ${format} export…`,
    })

    try {
      // Import FFmpeg renderer
      const { renderTimeline } = await import('../../timeline/renderer')
      const { tmpdir } = await import('os')
      const path = await import('path')
      const { readFileSync, mkdirSync } = await import('fs')

      await broadcastJobEvent({ jobId, status: 'processing', progress: 20, message: 'Rendering clips…' })

      const tempDir = path.join(tmpdir(), `cinema_export_${jobId}`)
      mkdirSync(tempDir, { recursive: true })
      const ext = format.startsWith('prores') ? 'mov' : format === 'dcp' ? 'mxf' : 'mp4'
      const outputPath = path.join(tempDir, `output.${ext}`)

      await renderTimeline(
        job.data.timelineJson as Parameters<typeof renderTimeline>[0],
        outputPath,
        format,
        (p) => broadcastJobEvent({ jobId, status: 'processing', progress: 20 + Math.round(p.percent * 0.6), message: `Encoding ${p.stage}…` })
      )

      await broadcastJobEvent({ jobId, status: 'processing', progress: 80, message: 'Uploading export…' })

      const outputBuffer = readFileSync(outputPath)
      const exportUrl = await storeForUser(userId, outputBuffer, ext, `video/${ext === 'mp4' ? 'mp4' : 'quicktime'}`)

      await db.renderJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETE',
          outputUrl: exportUrl,
          progressPct: 100,
          completedAt: new Date(),
        },
      })

      await broadcastJobEvent({
        jobId,
        status: 'complete',
        progress: 100,
        message: 'Export ready!',
        outputUrl: exportUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'

      const renderJob = await db.renderJob.findUnique({
        where: { id: jobId },
        select: { creditsCharged: true },
      })

      if (renderJob?.creditsCharged) {
        await refundCredits(userId, renderJob.creditsCharged, `Refund for failed export ${jobId}`)
      }

      await db.renderJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: message, completedAt: new Date() },
      })

      await broadcastJobEvent({ jobId, status: 'failed', error: message })
      throw err
    }
  },
  {
    connection: bullmqRedis,
    prefix: bullMQPrefix,
    concurrency: 3,
  }
)

exportWorker.on('failed', (job, err) => {
  console.error(`[export-worker] Job ${job?.id} failed:`, err.message)
})
