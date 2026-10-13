import { logCaught } from '@/lib/diagnostics/caught'
// Orchestrates the cognitive agents into a CreativeBrief — every step degrades
// safely. If everything degrades, enrichedPrompt falls back to the raw prompt and
// cognitionUsed is false, so orchestration runs exactly as it did before.

import { nameAppearsInScript, type CreativeLicense } from './license'
import { intentAgent, type Intent } from './agents/intentAgent'
import type { EmotionalArc } from './agents/affectAgent'
import type { CreativeDirection } from './agents/ideationAgent'
import { recallEpisodes, recordEpisode } from './memory/episodic'
import { formatPremise, type PremiseLock } from '@cinema/core'
import { callLLM } from '@/lib/engines/llm'

export interface CreativeBrief {
  intent: Intent
  emotionalArc: EmotionalArc
  direction: CreativeDirection
  enrichedPrompt: string
  /** Mood, pacing, camera, and style. Never a replacement story. */
  treatment: string
  cognitionUsed: boolean // false if everything degraded — render uses raw prompt
}

export interface CharacterDirectorContext {
  name: string
  behavioralPrompt?: string
  wardrobeSummary?: string
  appearanceSummary?: string
}

export async function runCognitiveDirector(params: {
  userId: string
  prompt: string
  durationSec: number
  characterContext?: CharacterDirectorContext | null
  license?: CreativeLicense
  premise?: PremiseLock
  projectId?: string
  onProgress?: (detail: string) => void
}): Promise<CreativeBrief> {
  const { userId, prompt, durationSec, characterContext, onProgress } = params
  const license: CreativeLicense = params.license ?? 'faithful'
  onProgress?.('Planning the film...')
  let pastWins: string[] = []
  try {
    const eps = await recallEpisodes(userId, prompt, 5)
    pastWins = (Array.isArray(eps) ? eps : [])
      .filter(e => (e.outcome?.qualityScore ?? 0) > 0.7)
      .map(e => e.summary)
    if (params.projectId) {
      const { queryProjectRAG } = await import('@/lib/ingest/embed')
      const hits = await queryProjectRAG(userId, params.projectId, prompt, 5).catch((err) => {
        console.warn("[caught] src/lib/cognition/director.ts:66", err instanceof Error ? { name: err.name, message: err.message } : err)
        return ([])
      })
      pastWins = [...hits.map((hit) => hit.summary), ...pastWins].filter(Boolean)
    }
  } catch (e) {
    console.warn('[cognition:recall] degraded:', e instanceof Error ? e.message : String(e))
  }
  const planned = await planOnce({
    prompt,
    durationSec,
    license,
    premise: params.premise ? formatPremise(params.premise) : '',
    pastWins,
  })
  const anyOk = planned.ok
  const intent = planned.intent
  const emotionalArc = planned.emotionalArc
  const direction = planned.direction

  const castBlock = characterContext && nameAppearsInScript(characterContext.name, prompt)
    ? [
        `Lead character ${characterContext.name}.`,
        characterContext.appearanceSummary,
        characterContext.wardrobeSummary,
        characterContext.behavioralPrompt,
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  const treatment = [
    direction.visualStyle ? `Visual style: ${direction.visualStyle}.` : '',
    emotionalArc.shape ? `Rhythm: ${emotionalArc.shape}. ${emotionalArc.rhythmNote ?? ''}`.trim() : '',
    intent.targetEmotion ? `Evoke: ${intent.targetEmotion}.` : '',
    castBlock,
    license === 'interpretive' && direction.concept.trim() && direction.concept.trim() !== prompt.trim()
      ? `Elaboration (keep the user's subject, action, and setting): ${direction.concept.trim()}`
      : '',
  ].filter(Boolean).join(' ')

  const enrichedPrompt = [prompt, treatment].filter(Boolean).join('\n\n')

  recordEpisode({
    userId,
    projectId: params.projectId,
    kind: 'project',
    summary: `${intent.inferredGoal || prompt} — ${direction.concept || 'direct'}`,
    intent,
    brief: { emotionalArc, direction },
    importance: 0.6,
  }).catch((err) => logCaught('lib/cognition/director', err))

  return { intent, emotionalArc, direction, enrichedPrompt, treatment, cognitionUsed: anyOk }
}

async function planOnce(input: {
  prompt: string
  durationSec: number
  license: CreativeLicense
  premise: string
  pastWins: string[]
}): Promise<{ ok: boolean; intent: Intent; emotionalArc: EmotionalArc; direction: CreativeDirection }> {
  const intent = intentAgent.fallback({ userId: '', prompt: input.prompt })
  const emotionalArc: EmotionalArc = {
    shape: 'measured',
    rhythmNote: '',
    beats: [],
  }
  const direction: CreativeDirection = {
    concept: input.prompt,
    visualStyle: '',
    scenes: [],
    novelty: 0,
    feasibility: 1,
    score: 0.5,
  }
  try {
    const { content } = await callLLM({
      model: 'claude-haiku',
      source: 'cognitive.plan',
      maxTokens: 900,
      system: `Plan a short film in ONE JSON object. Keys: intent, tone, rhythm, visualStyle, beats.
intent keeps the user's subject, action, character, and setting.
tone is one emotion. rhythm is one pacing sentence. visualStyle is a look, not a new story.
beats is an array of {position, emotion, pacing}. pacing is lingering, measured, brisk, or rapid.
Do not invent a different subject. Duration ${input.durationSec}s.`,
      messages: [{
        role: 'user',
        content: [
          input.premise ? `PREMISE\n${input.premise}` : '',
          input.pastWins.length ? `PAST\n${input.pastWins.slice(0, 4).join('\n')}` : '',
          `SCRIPT\n${input.prompt}`,
        ].filter(Boolean).join('\n\n'),
      }],
    })
    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim()) as Record<string, unknown>
    if (typeof parsed.intent === 'string' && parsed.intent.trim()) intent.inferredGoal = parsed.intent.trim()
    if (typeof parsed.tone === 'string' && parsed.tone.trim()) intent.targetEmotion = parsed.tone.trim()
    if (typeof parsed.rhythm === 'string') emotionalArc.rhythmNote = parsed.rhythm
    if (typeof parsed.visualStyle === 'string') direction.visualStyle = parsed.visualStyle
    if (Array.isArray(parsed.beats)) {
      emotionalArc.beats = parsed.beats.flatMap((beat) => {
        if (!beat || typeof beat !== 'object') return []
        const row = beat as Record<string, unknown>
        const pacing = row.pacing === 'lingering' || row.pacing === 'brisk' || row.pacing === 'rapid' || row.pacing === 'measured'
          ? row.pacing
          : 'measured'
        return [{
          position: typeof row.position === 'number' ? row.position : 0,
          emotion: typeof row.emotion === 'string' ? row.emotion : intent.targetEmotion,
          intensity: 0.5,
          pacing,
          purpose: '',
        }]
      })
    }
    direction.concept = input.prompt
    return { ok: true, intent, emotionalArc, direction }
  } catch (err) {
    console.warn('[cognitive.plan] degraded', err instanceof Error ? err.message : err)
    return { ok: false, intent, emotionalArc, direction }
  }
}

/** Shot-scale hint for breakdown. Slow beats stay wide; rapid beats go tighter. */
export function pacingNote(arc: EmotionalArc): string {
  if (!Array.isArray(arc.beats) || arc.beats.length === 0) return arc.rhythmNote || arc.shape || ''
  return arc.beats
    .map((beat) => `${Math.round(beat.position * 100)}% ${beat.pacing} (${beat.emotion})`)
    .join('; ')
}
