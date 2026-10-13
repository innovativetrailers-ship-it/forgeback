import { isGenerationPaused } from '@/lib/generation/pause'

/**
 * Model eval / benchmark harness — triple-gated, default OFF everywhere.
 * Requires RUN_MODEL_EVAL + ALLOW_BILLABLE_EVAL + non-production + explicit enable.
 */
export function modelEvalEnabled(): boolean {
  return (
    process.env.RUN_MODEL_EVAL === 'true' &&
    process.env.ALLOW_BILLABLE_EVAL === 'true' &&
    process.env.NODE_ENV !== 'production'
  )
}

/**
 * Intelligence probe battery (118 FAL videos/model) — opt-in eval harness only.
 */
export function intelligenceProbesEnabled(): boolean {
  if (process.env.DISABLE_INTELLIGENCE_PROBES === 'true') return false
  if (isGenerationPaused()) return false
  if (!modelEvalEnabled()) return false
  return process.env.ENABLE_INTELLIGENCE_PROBES === 'true'
}

export function assertIntelligenceProbesAllowed(context: string): void {
  if (intelligenceProbesEnabled()) return
  throw new Error(
    `Intelligence probes blocked (${context}). Requires RUN_MODEL_EVAL=true, ALLOW_BILLABLE_EVAL=true, ENABLE_INTELLIGENCE_PROBES=true, NODE_ENV≠production, GENERATION_PAUSED=false.`,
  )
}
