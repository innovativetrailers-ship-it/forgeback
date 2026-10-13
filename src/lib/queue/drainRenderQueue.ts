import { Queue } from 'bullmq'
import { bullmqRedis, bullMQPrefix } from '@/lib/redis'
import { isGenerationPaused } from '@/lib/generation/pause'
import { RENDER_QUEUE_NAME } from './names'

/** Remove waiting/delayed/paused jobs when generation is paused (pre-deploy backlog). */
export async function drainRenderQueueIfPaused(force = false): Promise<void> {
  if (!force && !isGenerationPaused()) return

  const queue = new Queue(RENDER_QUEUE_NAME, {
    connection: bullmqRedis,
    prefix: bullMQPrefix,
  })

  try {
    const counts = await queue.getJobCounts('waiting', 'delayed', 'paused', 'active')
    console.log('[queue_drain] pre-obliterate', counts)
    await queue.obliterate({ force: true })
    console.log('[queue_drain] render queue obliterated', { GENERATION_PAUSED: process.env.GENERATION_PAUSED })
  } finally {
    await queue.close()
  }
}
