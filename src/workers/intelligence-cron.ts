/**
 * Intelligence cron is disabled.
 * The probe battery billed FAL and Anthropic on a schedule.
 * Do not register node-cron jobs here. Manual probes go through
 * /api/intelligence/probe, which returns 403 unless intelligenceProbesEnabled().
 */

import { runIntelligenceSchedule } from '@/lib/intelligence/schedule'

console.error(
  '[Intelligence Cron] Probe battery stays off. Debates and the reward consumer run on a cadence.',
)

void runIntelligenceSchedule().catch((err) => {
  console.warn('[Intelligence Cron] schedule', err instanceof Error ? err.message : err)
})
setInterval(() => {
  void runIntelligenceSchedule().catch((err) => {
    console.warn('[Intelligence Cron] schedule', err instanceof Error ? err.message : err)
  })
}, 60 * 60 * 1000)
