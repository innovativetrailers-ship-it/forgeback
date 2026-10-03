import { claudeCall } from '@/lib/llm/anthropicClient'
import {
  isEmotionLatticeResult,
  type EmotionLatticeResult,
} from '@/lib/emotion/emotionShape'

export type {
  EmotionType,
  ArcPosition,
  OverallArc,
  EmotionalBeat,
  ThreeActStructure,
  NarrativePace,
  WeakPoint,
  EmotionLatticeResult,
} from '@/lib/emotion/emotionShape'
export { isEmotionLatticeResult, computeArcPath, EMOTION_COLORS } from '@/lib/emotion/emotionShape'

export interface EmotionLatticeRequest {
  projectId: string
  userId: string
  clips: Array<{ id: string; prompt: string; duration: number; startTime: number }>
}

// ─── Main analysis ────────────────────────────────────────────────────────────

export async function analyzeEmotionalArc(req: EmotionLatticeRequest): Promise<EmotionLatticeResult> {
  if (req.clips.length < 3) throw new Error('At least 3 clips are required for emotional arc analysis')

  const totalDuration = req.clips.reduce((sum, c) => Math.max(sum, c.startTime + c.duration), 0)
  const clipInventory = req.clips
    .map((c, i) => `  ${i + 1}. id="${c.id}" | start=${c.startTime}s | dur=${c.duration}s | prompt="${c.prompt}"`)
    .join('\n')

  const systemPrompt = `You are a professional script analyst AI for Cinematic Forge video editor.
Analyse video clip sequences and produce emotional arc analysis in JSON.
Output ONLY valid JSON — no markdown, no text outside JSON.

Valid EmotionType values: "tension" | "joy" | "sadness" | "confusion" | "resolution" | "climax"
Valid ArcPosition values: "build" | "peak" | "resolution" | "transition"
Valid OverallArc values: "rising" | "falling" | "circular" | "broken" | "flat"

Ranges: intensity 0-10 integer, confidence 0.0-1.0, cutTension 0-10, musicAlignment 0-1, silenceRatio 0-1

OUTPUT SCHEMA:
{
  "beats": [{ "clipId": "string", "timestamp": 0, "emotion": "tension", "intensity": 7, "confidence": 0.85, "drivingElement": "string", "arcPosition": "build" }],
  "overallArc": "rising",
  "threeActStructure": { "act1End": 0, "act2End": 0, "act1Emotion": "tension", "act2Emotion": "climax", "act3Emotion": "resolution" },
  "paceRecommendations": { "avgShotLength": 5, "cutTension": 5, "musicAlignment": 0.7, "silenceRatio": 0.1, "recommendations": { "cutFaster": false, "addSilence": false, "increaseMusicProminence": false, "extendEmotionalMoments": false } },
  "weakPoints": [{ "timestamp": 0, "clipId": "string", "issue": "string", "suggestion": "string" }]
}`

  const userPrompt = `Project: ${req.projectId} | Duration: ${totalDuration.toFixed(1)}s | Clips: ${req.clips.length}

CLIP INVENTORY:
${clipInventory}

Analyse each clip's emotional content from its prompt. Map beats, 3-act structure, pacing, and weak points.
act1End should be at ~25% of total duration, act2End at ~75%.
Output ONLY the JSON object.`

  const response = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }, { source: 'emotion.lattice' })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text content from Anthropic')

  let jsonText = (textBlock.text ?? '').trim()
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonText = fence[1].trim()

  let parsed: unknown
  try { parsed = JSON.parse(jsonText) } catch {
    throw new Error(`Failed to parse emotion analysis JSON. Raw: ${jsonText.slice(0, 400)}`)
  }

  if (!isEmotionLatticeResult(parsed)) {
    throw new Error('Emotion analysis response does not match schema')
  }

  // Validate all clipIds reference actual clips
  const validIds = new Set(req.clips.map((c) => c.id))
  for (const beat of parsed.beats) {
    if (!validIds.has(beat.clipId)) beat.clipId = req.clips[0]?.id ?? beat.clipId
  }

  // Clamp act boundaries
  const acts = parsed.threeActStructure
  parsed.threeActStructure.act1End = Math.min(acts.act1End, totalDuration * 0.45)
  parsed.threeActStructure.act2End = Math.min(Math.max(acts.act2End, acts.act1End + 1), totalDuration * 0.9)

  return parsed
}
