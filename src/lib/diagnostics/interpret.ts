import { logCaught } from '@/lib/diagnostics/caught'
import {
  interpretErrorRules,
  isErrorAction,
  isErrorCategory,
  normalizeErrorSignature,
  type InterpretedError,
} from '@cinema/core'
import { db } from '@/lib/db'
import { isGenerationPaused } from '@/lib/generation/pause'
import { interpretedErrorSchema, parseBoundary } from './boundary'

function asInterpreted(row: {
  userMessage: string
  suggestedAction: string
  category: string
  correctable: boolean
  correction: string | null
}): InterpretedError | null {
  if (!isErrorCategory(row.category) || !isErrorAction(row.suggestedAction)) return null
  return {
    userMessage: row.userMessage,
    suggestedAction: row.suggestedAction,
    category: row.category,
    correctable: row.correctable,
    correction: row.correction ?? undefined,
  }
}

async function interpretWithClaude(rawError: string): Promise<InterpretedError | null> {
  if (isGenerationPaused()) return null
  try {
    const { claudeCall, claudeText } = await import('@/lib/llm/anthropicClient')
    const { llmModelForTier } = await import('@cinema/core')
    const message = await claudeCall({
      model: llmModelForTier('mechanical'),
      max_tokens: 300,
      system: `Classify a video-generation provider error. Return ONLY JSON:
{"userMessage":string,"suggestedAction":"retry"|"alter_prompt"|"reduce_refs"|"change_model"|"wait_retry"|"reduce_duration","category":"content_flag"|"payload_over_limit"|"field_mismatch"|"namespace_bad"|"provider_transient"|"auth_config"|"unsupported_mode"|"code_error"|"unknown","correctable":boolean,"correction":string|null}
userMessage is one short sentence for the filmmaker. No status codes.`,
      messages: [{ role: 'user', content: rawError.slice(0, 4000) }],
    }, { source: 'diagnostics.interpret', tier: 'mechanical' })
    const parsed = parseBoundary(
      interpretedErrorSchema,
      JSON.parse(claudeText(message).replace(/```json|```/g, '').trim() || '{}'),
      'error interpretation',
    )
    return {
      userMessage: parsed.userMessage.trim(),
      suggestedAction: parsed.suggestedAction,
      category: parsed.category,
      correctable: parsed.correctable,
      correction: parsed.correction ?? undefined,
    }
  } catch (err) {
    console.warn("[caught] src/lib/diagnostics/interpret.ts:55", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

export async function interpretShotError(
  rawError: string,
  httpStatus?: number,
): Promise<{ interpreted: InterpretedError; interpretedBy: 'rules' | 'cache' | 'claude' }> {
  const signature = normalizeErrorSignature(rawError)
  const cached = await db.errorInterpretationCache.findUnique({ where: { signature } }).catch((err) => {
    console.warn("[caught] src/lib/diagnostics/interpret.ts:67", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  if (cached) {
    const hit = asInterpreted(cached)
    if (hit) return { interpreted: hit, interpretedBy: 'cache' }
  }

  const rules = interpretErrorRules(rawError, httpStatus)
  if (rules.category !== 'unknown') {
    await db.errorInterpretationCache.upsert({
      where: { signature },
      create: {
        signature,
        userMessage: rules.userMessage,
        suggestedAction: rules.suggestedAction,
        category: rules.category,
        correctable: rules.correctable,
        correction: rules.correction ?? null,
      },
      update: {},
    }).catch((err) => logCaught('lib/diagnostics/interpret', err))
    return { interpreted: rules, interpretedBy: 'rules' }
  }

  const fromClaude = await interpretWithClaude(rawError)
  const interpreted = fromClaude ?? rules
  await db.errorInterpretationCache.upsert({
    where: { signature },
    create: {
      signature,
      userMessage: interpreted.userMessage,
      suggestedAction: interpreted.suggestedAction,
      category: interpreted.category,
      correctable: interpreted.correctable,
      correction: interpreted.correction ?? null,
    },
    update: {
      userMessage: interpreted.userMessage,
      suggestedAction: interpreted.suggestedAction,
      category: interpreted.category,
      correctable: interpreted.correctable,
      correction: interpreted.correction ?? null,
    },
  }).catch((err) => logCaught('lib/diagnostics/interpret', err))
  return { interpreted, interpretedBy: fromClaude ? 'claude' : 'rules' }
}
