/**
 * Quality Gate Worker
 * Reviews high-quality training signals and decides whether to
 * promote them to the distillation dataset or flag for human review.
 * Run with: tsx src/workers/quality-gate.ts
 */

import { Worker } from 'bullmq'
import { bullmqRedis, bullMQPrefix } from '../lib/redis'
import { db } from '../lib/db'
import { runModel1 } from '../lib/brain/model1'
import { rlhfMeta } from '../lib/brain/rlhf-meta'

const QUALITY_GATE_THRESHOLD = 0.85

const worker = new Worker(
  'quality-gate',
  async (job) => {
    const { signalId, qualityScore } = job.data as {
      signalId: string
      qualityScore: number
      trainingSignal: string
    }

    if (qualityScore < QUALITY_GATE_THRESHOLD) {
      console.log(`[quality-gate] Signal ${signalId} score ${qualityScore} below threshold ${QUALITY_GATE_THRESHOLD} — skipped`)
      return
    }

    const signal = await db.rLHFLog.findUnique({ where: { id: signalId } })
    if (!signal) return

    const meta = rlhfMeta(signal)

    // Final quality review with Model 1
    const review = await runModel1({
      systemPrompt: `You are a quality gate for an AI video training dataset.
Evaluate if this video generation result is good enough to be a training example.
Return JSON: { "approved": boolean, "reason": "string", "dataset": "routing|quality|style|character" }`,
      userMessage: `Prompt: "${meta.promptRaw}"\nEnhanced: "${meta.promptEnhanced}"\nQuality Score: ${qualityScore}\nVideo: ${meta.videoUrl}`,
      requireJSON: true,
    })

    let parsed: { approved: boolean; reason: string; dataset: string }
    try {
      parsed = JSON.parse(review.content)
    } catch {
      console.error('[quality-gate] Failed to parse review for signal', signalId)
      return
    }

    if (parsed.approved) {
      await db.trainingData.create({
        data: {
          userId: signal.userId,
          type: parsed.dataset,
          instruction: meta.promptEnhanced,
          originalUrl: meta.videoUrl || null,
          metadata: {
            promptRaw: meta.promptRaw,
            qualityScore,
            sourceSignalId: signalId,
            approved: true,
          },
        },
      }).catch((err) => {
        console.warn("[caught] src/workers/quality-gate.ts:66", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* table may not exist yet */ })

      console.log(`[quality-gate] Signal ${signalId} APPROVED for ${parsed.dataset} dataset`)
    } else {
      console.log(`[quality-gate] Signal ${signalId} REJECTED — ${parsed.reason}`)
    }
  },
  { connection: bullmqRedis, prefix: bullMQPrefix, concurrency: 1 }
)

worker.on('completed', (job) => console.log(`[quality-gate] Job ${job.id} done`))
worker.on('failed', (job, err) => console.error(`[quality-gate] Job ${job?.id} failed:`, err))

console.log('[quality-gate] Worker started')
