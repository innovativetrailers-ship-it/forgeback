/**
 * Distillation Worker
 * Periodically reads approved training data and generates
 * routing optimisation reports for model delegation.
 * Run with: tsx src/workers/distillation.ts
 */

import IORedis from 'ioredis'
import { db } from '../lib/db'
import { runModel1 } from '../lib/brain/model1'

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  keyPrefix: 'cinema:',
})

const DISTILLATION_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

async function runDistillation() {
  console.log('[distillation] Starting distillation run...')

  const rows = await db.trainingData.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  }).catch((err) => {
    console.warn("[caught] src/workers/distillation.ts:25", err instanceof Error ? { name: err.name, message: err.message } : err)
    return ([] as Awaited<ReturnType<typeof db.trainingData.findMany>>)
  })

  const signals = rows.filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    return meta.approved === true
  })

  if (signals.length === 0) {
    console.log('[distillation] No approved signals found, skipping.')
    return
  }

  const byDataset: Record<string, typeof signals> = {}
  for (const sig of signals) {
    const meta = (sig.metadata ?? {}) as Record<string, unknown>
    const ds = typeof meta.dataset === 'string' ? meta.dataset : 'general'
    byDataset[ds] = [...(byDataset[ds] ?? []), sig]
  }

  for (const [dataset, datasetSignals] of Object.entries(byDataset)) {
    const summary = datasetSignals.map((s) => {
      const meta = (s.metadata ?? {}) as Record<string, unknown>
      const promptRaw = typeof meta.promptRaw === 'string' ? meta.promptRaw : s.instruction ?? ''
      const qualityScore = typeof meta.qualityScore === 'number' ? meta.qualityScore : null
      return `Prompt: "${promptRaw}" | Quality: ${qualityScore?.toFixed(2) ?? 'n/a'} | Dataset: ${dataset}`
    }).join('\n')

    const report = await runModel1({
      systemPrompt: `You are analysing a batch of high-quality AI video generation examples for the "${dataset}" dataset.
Identify patterns, routing recommendations, and lessons learned.
Return JSON: {
  "top_patterns": ["string"],
  "routing_updates": [{"scene_type": "string", "recommended_engine": "string", "reason": "string"}],
  "prompt_patterns": ["string"],
  "summary": "string"
}`,
      userMessage: summary,
      requireJSON: true,
    })

    const reportKey = `cinema:distillation:${dataset}:${Date.now()}`
    await redis.set(reportKey, report.content, 'EX', 7 * 24 * 60 * 60) // 7 days TTL

    console.log(`[distillation] Report for "${dataset}" stored at ${reportKey}`)
  }

  console.log(`[distillation] Distillation complete. Processed ${signals.length} signals.`)
}

// Run immediately then on interval
runDistillation().catch((err) => {
  console.warn("[caught] src/workers/distillation.ts:75", err instanceof Error ? { name: err.name, message: err.message } : err)
  console.error(err)
})
setInterval(() => runDistillation().catch((err) => {
  console.warn("[caught] src/workers/distillation.ts:76", err instanceof Error ? { name: err.name, message: err.message } : err)
  console.error(err)
}), DISTILLATION_INTERVAL_MS)

process.on('SIGTERM', () => { redis.quit(); process.exit(0) })
