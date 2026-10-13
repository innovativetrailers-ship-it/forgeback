import { claudeCall } from '@/lib/llm/anthropicClient'
import {
  type CutStyle,
  type CutTone,
  type RoughCutClipSelection,
  type RoughCutResult,
} from '@/lib/editing/roughCutShape'

export type { CutStyle, CutTone, RoughCutClipSelection, RoughCutResult } from '@/lib/editing/roughCutShape'
export { applyRoughCutToRecipe } from '@/lib/editing/roughCutShape'

export interface RoughCutRequest {
  projectId: string
  userId: string
  clips: Array<{
    id: string
    prompt: string
    duration: number
    trackId: string
    videoUrl: string | null
  }>
  targetDuration: number
  style: CutStyle
  tone: CutTone
}

// ─── Pacing profiles ──────────────────────────────────────────────────────────

interface PacingProfile {
  avgClipDuration: [number, number]
  transitionBias: string
  rhythmDescription: string
}

const PACING_PROFILES: Record<CutStyle, PacingProfile> = {
  'fast-paced': {
    avgClipDuration: [1.5, 4],
    transitionBias: 'hard cuts, jump cuts, whip pans',
    rhythmDescription: 'Rapid-fire montage energy. Short bursts, never linger.',
  },
  cinematic: {
    avgClipDuration: [4, 12],
    transitionBias: 'dissolves, slow fades, match cuts',
    rhythmDescription: 'Languid, purposeful. Let shots breathe. Hold wide shots longer.',
  },
  documentary: {
    avgClipDuration: [3, 8],
    transitionBias: 'hard cuts with occasional L-cuts for audio overlap',
    rhythmDescription: 'Observational pacing. Alternate wide establishing shots with detail inserts.',
  },
  interview: {
    avgClipDuration: [5, 15],
    transitionBias: 'hard cuts, J-cuts for question/answer flow',
    rhythmDescription: 'Conversational rhythm. Cut on dialogue beats, use B-roll to cover jump cuts.',
  },
  'music-video': {
    avgClipDuration: [1, 3],
    transitionBias: 'beat-synced cuts, flash frames, rhythmic match cuts',
    rhythmDescription: 'Cut to the beat. Visual rhythm mirrors audio. Energy builds toward chorus.',
  },
}

const TONE_INSTRUCTIONS: Record<CutTone, string> = {
  energetic: 'Favour high-motion clips. Accelerate pacing over time. Front-load impact.',
  serious: 'Favour measured compositions. Avoid whiplash. Let gravity build naturally.',
  humorous: 'Juxtapose unexpected clips for comic effect. Use timing pauses before punchlines.',
  emotional: 'Build slowly. Place the most emotionally resonant clip at 70% mark. End quietly.',
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isRoughCutSelection(v: unknown): v is RoughCutClipSelection {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj.clipId === 'string' &&
    typeof obj.startTime === 'number' &&
    typeof obj.duration === 'number' &&
    typeof obj.trimIn === 'number' &&
    typeof obj.trimOut === 'number' &&
    typeof obj.reason === 'string'
  )
}

function isBrollGap(v: unknown): v is RoughCutResult['brollGaps'][number] {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj.startTime === 'number' &&
    typeof obj.duration === 'number' &&
    typeof obj.suggestion === 'string'
  )
}

function isRoughCutResultPayload(v: unknown): v is RoughCutResult {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    Array.isArray(obj.selections) &&
    obj.selections.every(isRoughCutSelection) &&
    typeof obj.totalDuration === 'number' &&
    typeof obj.styleNotes === 'string' &&
    Array.isArray(obj.brollGaps) &&
    obj.brollGaps.every(isBrollGap)
  )
}

// ─── Main: generate rough cut ─────────────────────────────────────────────────

export async function generateRoughCut(req: RoughCutRequest): Promise<RoughCutResult> {
  if (req.clips.length === 0) throw new Error('Cannot generate rough cut: no clips in project')

  const totalAvailable = req.clips.reduce((sum, c) => sum + c.duration, 0)
  const pacing = PACING_PROFILES[req.style]
  const toneNote = TONE_INSTRUCTIONS[req.tone]

  const clipInventory = req.clips
    .map(
      (c, i) =>
        `  ${i + 1}. id="${c.id}" | duration=${c.duration}s | hasVideo=${c.videoUrl !== null} | prompt="${c.prompt}"`,
    )
    .join('\n')

  const systemPrompt = `You are a professional film editor AI for Cinematic Forge.
Output ONLY valid JSON matching this schema (no markdown, no explanation outside JSON):
{
  "selections": [{ "clipId": "string", "startTime": 0, "duration": 5.0, "trimIn": 0.0, "trimOut": 0.0, "reason": "string" }],
  "totalDuration": 60,
  "styleNotes": "string",
  "brollGaps": [{ "startTime": 30, "duration": 3, "suggestion": "string" }]
}
Rules:
- Every clipId must exist in the inventory provided.
- trimIn + duration must not exceed the clip's original duration.
- Clips are sequenced: startTime = cumulative sum of previous durations.
- totalDuration = sum of all selected clip durations.`

  const userPrompt = `## PROJECT
Project ID: ${req.projectId}
Target Duration: ${req.targetDuration}s
Available Material: ${totalAvailable}s
Style: ${req.style} | Tone: ${req.tone}

## PACING
Avg clip: ${pacing.avgClipDuration[0]}–${pacing.avgClipDuration[1]}s | Transitions: ${pacing.transitionBias}
${pacing.rhythmDescription}

## TONE
${toneNote}

## CLIPS (${req.clips.length} total)
${clipInventory}
${totalAvailable < req.targetDuration ? `\n⚠ Material shorter than target by ${Math.round(req.targetDuration - totalAvailable)}s. Note in styleNotes.` : ''}

Output ONLY the JSON object.`

  const response = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }, { source: 'editing.roughcut' })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Anthropic returned no text content')
  }

  let jsonText = (textBlock.text ?? '').trim()
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonText = fenceMatch[1].trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error(
      `Failed to parse Anthropic response as JSON. Raw (first 500 chars): ${jsonText.slice(0, 500)}`,
    )
  }

  if (!isRoughCutResultPayload(parsed)) {
    const keys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).join(', ') : 'unknown'
    throw new Error(`Anthropic response does not match RoughCutResult schema. Keys: ${keys}`)
  }

  // Cross-validate clipIds
  const validIds = new Set(req.clips.map((c) => c.id))
  for (const sel of parsed.selections) {
    if (!validIds.has(sel.clipId)) {
      throw new Error(`Hallucinated clipId "${sel.clipId}" — not in project inventory`)
    }
  }

  // Clamp trim bounds
  const clipDurationMap = new Map(req.clips.map((c) => [c.id, c.duration]))
  for (const sel of parsed.selections) {
    const orig = clipDurationMap.get(sel.clipId) ?? 0
    if (sel.trimIn + sel.duration > orig + 0.01) {
      sel.duration = Math.max(0, orig - sel.trimIn)
      sel.trimOut = 0
    }
  }

  // Recalculate sequential startTimes — server is source of truth
  let cursor = 0
  for (const sel of parsed.selections) {
    sel.startTime = cursor
    cursor += sel.duration
  }
  parsed.totalDuration = cursor

  return parsed
}

