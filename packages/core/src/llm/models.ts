import { llmModelForTask, type BrainTask } from './routing'

export type LlmTier = 'mechanical' | 'creative' | 'hard'

const TIER_TASK: Record<LlmTier, BrainTask> = {
  mechanical: 'mechanical',
  creative: 'script',
  hard: 'premise',
}

/** One place to retune director models. Env overrides the routing-table default. */
export function llmModelForTier(tier: LlmTier = 'creative'): string {
  if (tier === 'mechanical') {
    return process.env.LLM_MECHANICAL?.trim() || llmModelForTask('mechanical').model
  }
  if (tier === 'hard') {
    return process.env.LLM_HARD?.trim() || llmModelForTask('premise').model
  }
  return process.env.LLM_CREATIVE?.trim() || llmModelForTask(TIER_TASK.creative).model
}
