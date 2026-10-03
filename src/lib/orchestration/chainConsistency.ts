import { CONTINUITY_SCORE_MIN, llmModelForTask } from '@cinema/core'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { isGenerationPausedError } from '@/lib/generation/pause'

export interface ChainConsistency {
  score: number
  passed: boolean
  reason: string
}

export function parseContinuityScore(text: string): number | null {
  const match = text.match(/"similarity"\s*:\s*(0?\.\d+|1(?:\.0+)?|0)/)
  if (!match) return null
  const score = Number(match[1])
  if (!Number.isFinite(score)) return null
  return Math.min(1, Math.max(0, score))
}

/** Compare shot A's last frame with shot B's first frame. A missing score is a fail, not a pass. */
export async function scoreChainLink(
  priorFrame: string | undefined,
  nextFrame: string | undefined,
): Promise<ChainConsistency> {
  if (!priorFrame?.trim() || !nextFrame?.trim()) {
    return { score: 0, passed: false, reason: 'continuity frames missing' }
  }
  try {
    const message = await claudeCall({
      model: llmModelForTask('mechanical').model,
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: priorFrame } },
          { type: 'image', source: { type: 'url', url: nextFrame } },
          {
            type: 'text',
            text: 'The first image is the end of shot A. The second is the start of shot B. Return JSON only: {"similarity": 0-1}. 1 means the same place, light, and subject.',
          },
        ],
      }],
    }, { source: 'chain.continuity', tier: 'mechanical' })
    const score = parseContinuityScore(claudeText(message))
    if (score == null) {
      return { score: 0, passed: false, reason: 'continuity check returned no score' }
    }
    const passed = score >= CONTINUITY_SCORE_MIN
    return {
      score,
      passed,
      reason: passed ? 'continuous' : 'continuity drift',
    }
  } catch (err) {
    if (isGenerationPausedError(err)) throw err
    console.warn('[chain_consistency]', err instanceof Error ? err.message : err)
    return { score: 0, passed: false, reason: 'continuity check failed' }
  }
}
