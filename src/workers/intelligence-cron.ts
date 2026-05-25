/**
 * Intelligence Cron Worker
 *
 * Runs as a standalone Node.js process — never on the production API server.
 * Start with: npx ts-node src/workers/intelligence-cron.ts
 *
 * Schedule:
 *   Every 6 hours  — model update detection
 *   Weekly Monday  — full probe battery on all models
 *   Monthly 1st    — cross-model comparison + routing suggestions
 *   Hourly poll    — training queue monitor (trigger fine-tune at 1000 items)
 */

import cron from 'node-cron'
import { ModelUpdateWatcher, runWeeklyProbeBattery, generateCrossModelComparisonReport, suggestRoutingMatrixUpdates } from '../lib/intelligence/update-watcher'
import { getIntelligenceQueueLength } from '../lib/firewall/domain-guard'

console.log('[Intelligence Cron] Starting — PID', process.pid)

// Every 6 hours: check for model updates and handle them
cron.schedule('0 */6 * * *', async () => {
  console.log('[Intelligence Cron] Running update detection...')
  try {
    const watcher = new ModelUpdateWatcher()
    const updates = await watcher.detectUpdates()
    console.log(`[Intelligence Cron] Detected ${updates.length} model update(s)`)

    for (const update of updates) {
      await watcher.handleUpdate(update)
    }
  } catch (err) {
    console.error('[Intelligence Cron] Update detection failed:', err)
  }
})

// Weekly Monday 02:00 UTC: run full probe battery on all models
cron.schedule('0 2 * * 1', async () => {
  console.log('[Intelligence Cron] Starting weekly probe battery...')
  try {
    await runWeeklyProbeBattery()
    console.log('[Intelligence Cron] Weekly probe battery complete')
  } catch (err) {
    console.error('[Intelligence Cron] Weekly probe battery failed:', err)
  }
})

// Monthly 1st 03:00 UTC: cross-model comparison + routing suggestions
cron.schedule('0 3 1 * *', async () => {
  console.log('[Intelligence Cron] Running monthly cross-model comparison...')
  try {
    await generateCrossModelComparisonReport()
    await suggestRoutingMatrixUpdates()
    console.log('[Intelligence Cron] Monthly comparison complete')
  } catch (err) {
    console.error('[Intelligence Cron] Monthly comparison failed:', err)
  }
})

// Hourly: monitor training queue and trigger fine-tune at threshold
async function monitorTrainingQueue(): Promise<void> {
  try {
    const queueLength = await getIntelligenceQueueLength('training:probe_signals')
    console.log(`[Intelligence Cron] Training queue depth: ${queueLength}`)

    if (queueLength >= 1000) {
      await triggerTrainingRun()
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes('ETIMEDOUT') ||
      msg.includes("Stream isn't writeable") ||
      msg.includes('Connection is closed') ||
      msg.includes('ECONNRESET')
    ) {
      console.warn('[Intelligence Cron] Redis unavailable, skipping tick:', msg)
      return
    }
    console.error('[Intelligence Cron] Training queue monitor failed:', err)
  }
}

async function triggerTrainingRun(): Promise<void> {
  console.log('[Intelligence Cron] Training queue threshold reached — triggering fine-tune run')
  // In production this would dispatch a job to the training cluster
  // For now, push a signal to the training queue
  const { pushIntelligenceSignal } = await import('../lib/firewall/domain-guard')
  await pushIntelligenceSignal('training:trigger', {
    triggered_at: new Date().toISOString(),
    reason: 'queue_threshold_1000',
  })
}

// Run hourly training queue monitor
setInterval(monitorTrainingQueue, 60 * 60 * 1000)
// Also run at startup
monitorTrainingQueue().catch(err => console.error('[Intelligence Cron] Startup queue check failed:', err))

console.log('[Intelligence Cron] All schedules registered')
console.log('  - Every 6h: model update detection')
console.log('  - Weekly Mon 02:00: full probe battery')
console.log('  - Monthly 1st 03:00: cross-model comparison')
console.log('  - Hourly: training queue monitor')
