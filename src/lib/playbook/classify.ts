import {
  PLAYBOOK_CLASSIFY_SOURCE,
  classifyRule,
  llmModelForTier,
  parseClassifiedRuleJson,
  stripUnsafeRules,
  type ClassifiedRule,
} from '@cinema/core'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'

function jsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch (err) {
    console.warn("[caught] src/lib/playbook/classify.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

/** Heuristic first. Optional mechanical Claude pass when generation is unpaused. */
export async function classifyPlaybookRules(rules: string[]): Promise<ClassifiedRule[]> {
  const { kept } = stripUnsafeRules(rules)
  const local = kept.map(classifyRule)
  try {
    const message = await claudeCall({
      model: llmModelForTier('mechanical'),
      max_tokens: 800,
      system: 'Classify film playbook rules. Return ONLY a JSON array of {text, kind:"hard"|"soft", action}. action.type is max_duration (seconds), no_onscreen_text, no_dialogue_establishing, max_chain (shots), end_scene_wide, or prompt_inject (fragment). Reject safety/billing/pause/gate rules with action.type rejected. Creative rules only.',
      messages: [{ role: 'user', content: JSON.stringify(kept) }],
    }, { source: PLAYBOOK_CLASSIFY_SOURCE, tier: 'mechanical' })
    const parsed = jsonObject(claudeText(message))
    if (!Array.isArray(parsed)) return local
    return parsed.map((item, i) => parseClassifiedRuleJson(item, kept[i] ?? '')).filter((rule) => rule.text)
  } catch (err) {
    console.warn("[caught] src/lib/playbook/classify.ts:33", err instanceof Error ? { name: err.name, message: err.message } : err)

    return local
  }
}
