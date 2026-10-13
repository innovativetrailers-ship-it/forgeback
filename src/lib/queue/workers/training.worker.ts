const TEARDOWN_MSGS = ['Connection is closed', "stream isn't writeable", 'ECONNRESET']
process.on('uncaughtException', (err) => {
  if (TEARDOWN_MSGS.some((m) => err.message?.includes(m))) return
  console.error('[training-worker] Uncaught exception:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  const msg = (reason as Error)?.message ?? String(reason)
  if (TEARDOWN_MSGS.some((m) => msg.includes(m))) return
  console.error('[training-worker] Unhandled rejection:', reason)
})

import { Worker } from 'bullmq'
import { bullmqRedis, bullMQPrefix } from '../../redis'
import { processTrainingJob } from '../../jobs/processTrainingJob'
import type { TrainingJobPayload } from '../../jobs/processTrainingJob'

export const trainingWorker = new Worker<TrainingJobPayload>(
  'training',
  async (job) => {
    await processTrainingJob(job.data)
  },
  {
    connection: bullmqRedis,
    prefix: bullMQPrefix,
    concurrency: 2,
  }
)

trainingWorker.on('failed', (job, err) => {
  console.error(`[training-worker] Job ${job?.id} failed:`, err.message)
})
