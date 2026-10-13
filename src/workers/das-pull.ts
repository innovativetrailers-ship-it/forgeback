import { rememberObject } from '@/lib/storage/objects'
import { opaqueObjectKey } from '@/lib/upload/sniff'
/**
 * DAS Pull Worker — Run as standalone process: `npx tsx src/workers/das-pull.ts`
 * Continuously dequeues completed video jobs from Redis and:
 *   1. Streams video URL → local DAS storage
 *   2. Uploads to Cloudflare R2 for CDN delivery
 *   3. Updates RenderJob.outputUrl with R2 signed URL
 *   4. Broadcasts SSE 'stored' event
 *   5. Copies to training path for RLHF data collection
 */

import 'dotenv/config'
import { saveToDas, getDasPath, getTrainingPath } from '../lib/storage/das'

// Lazy-load these to avoid issues at module init
async function getDb() {
  const { db } = await import('../lib/db')
  return db
}

async function getRedis() {
  const { redis } = await import('../lib/redis')
  return redis
}

interface DASQueueItem {
  jobId: string
  videoUrl: string
  projectId?: string
  userId: string
  type: string
}

async function dasSelfTest(): Promise<boolean> {
  try {
    await saveToDas('.healthcheck', 'ok')
    console.log('[das-pull] DAS (Neon) health check passed')
    return true
  } catch (err) {
    console.warn('[das-pull] DAS (Neon) not available, falling back to R2-only mode:', (err as Error).message)
    return false
  }
}

async function uploadToR2FromBuffer(buffer: Buffer, key: string): Promise<string> {
  const { r2, uploadToR2: upload } = await import('../lib/storage/r2')
  void r2 // ensure client initialised
  return upload(buffer, key, 'video/mp4')
}

async function processItem(item: DASQueueItem, dasAvailable: boolean): Promise<void> {
  const db = await getDb()
  const redis = await getRedis()
  const { broadcastJobEvent } = await import('../lib/queue/events')

  console.log(`[das-pull] Processing job ${item.jobId}`)

  let outputUrl = item.videoUrl
  const r2Key = opaqueObjectKey('mp4')

  // Fetch the video data
  const response = await fetch(item.videoUrl)
  if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (dasAvailable) {
    try {
      const dasPath = getDasPath(item.projectId ?? 'global', `${item.jobId}.mp4`)
      await saveToDas(dasPath, buffer)
      console.log(`[das-pull] Saved to DAS (Neon): ${dasPath}`)

      // Upload to R2 from buffer
      await rememberObject(item.userId, r2Key)
      outputUrl = await uploadToR2FromBuffer(buffer, r2Key)
      console.log(`[das-pull] Uploaded to R2: ${outputUrl}`)

      // Copy to training path
      const trainingPath = getTrainingPath(item.userId, `${item.jobId}.mp4`)
      await saveToDas(trainingPath, buffer)
    } catch (dasErr) {
      console.warn(`[das-pull] DAS write failed, falling back to direct R2 upload:`, (dasErr as Error).message)
      dasAvailable = false
    }
  }

  if (!dasAvailable) {
    const { uploadToR2: upload } = await import('../lib/storage/r2')
    outputUrl = await upload(buffer, r2Key, 'video/mp4')
    console.log(`[das-pull] Uploaded directly to R2: ${outputUrl}`)
  }

  // Update DB with R2 URL
  const { objectKeyFromStored } = await import('../lib/storage/r2')
  await db.renderJob.update({
    where: { id: item.jobId },
    data: { outputUrl, storageKey: objectKeyFromStored(outputUrl) ?? r2Key },
  })

  // Broadcast 'stored' SSE event
  await broadcastJobEvent({
    jobId: item.jobId,
    status: 'complete',
    progress: 100,
    message: 'Video stored and ready',
    outputUrl,
  })

  // Add to training data queue
  await redis.rpush(
    'training:queue',
    JSON.stringify({ jobId: item.jobId, videoUrl: outputUrl, userId: item.userId })
  )

  console.log(`[das-pull] Job ${item.jobId} complete. URL: ${outputUrl}`)
}

async function main(): Promise<void> {
  console.log('[das-pull] Starting DAS pull worker…')
  const redis = await getRedis()

  const dasAvailable = await dasSelfTest()

  console.log('[das-pull] Waiting for jobs on das:queue…')

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Blocking pop with 5-second timeout
      const result = await redis.blpop('das:queue', 5)

      if (result) {
        const [, data] = result
        const item = JSON.parse(data) as DASQueueItem
        await processItem(item, dasAvailable)
      }
    } catch (err) {
      console.error('[das-pull] Error processing item:', (err as Error).message)
      // Brief pause before retrying on error
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

main().catch((err) => {
  console.error('[das-pull] Fatal error:', err)
  process.exit(1)
})
