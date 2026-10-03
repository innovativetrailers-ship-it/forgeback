// src/lib/orchestration/scriptBreakdown.ts
// VideoGen-of-Thought style: prompt → structured multi-shot plan

import {
  capPromptText,
  formatPremise,
  isShotPurpose,
  llmModelForTask,
  MAX_QUALITY_BREAKDOWN_MODEL,
  normalizeCameraIntent,
  recordLlmRetry,
  type CameraIntentInput,
  type PremiseLock,
} from '@cinema/core'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { SHOT_TRANSITION_KINDS, type ShotTransition, type ShotTransitionKind, type StructuredShot, type PatientZeroAssets, type ContinuityChain } from './types'
import { MODEL_SPECIALTIES }                       from '@/lib/routing/engineRegistry'
import { enforceScriptFidelity }                   from './scriptFidelity'
import type { CreativeLicense } from '@/lib/cognition/license'
import { groundShots } from './premiseLock'

const DIRECTOR_SHOT_PROMPT_BUDGET = 1500
const BEAT_MIN_SECONDS = 3
const BEAT_MAX_SECONDS = 8
const SEQUENCE = /\b(?:and then|then|after that|afterwards|meanwhile|as the light(?: changes| changed)?)\b/i

export function beatDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 5
  return Math.min(BEAT_MAX_SECONDS, Math.max(BEAT_MIN_SECONDS, value))
}

/** True when one prompt asks the clip to change action or lighting. */
export function promptHasSequence(text: string): boolean {
  const body = text.trim()
  if (!body) return false
  if (SEQUENCE.test(body)) return true
  const sentences = body.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length >= 12)
  return sentences.length >= 3
}

export function readTransition(value: unknown): ShotTransition | null {
  const kindOf = (raw: string): ShotTransitionKind | null =>
    (SHOT_TRANSITION_KINDS as readonly string[]).includes(raw) ? raw as ShotTransitionKind : null
  if (typeof value === 'string') {
    const kind = kindOf(value.trim())
    return kind ? { kind } : null
  }
  if (!value || typeof value !== 'object') return null
  const row = value as { kind?: unknown; durationMs?: unknown }
  const kind = typeof row.kind === 'string' ? kindOf(row.kind.trim()) : null
  if (!kind) return null
  const durationMs = typeof row.durationMs === 'number' && Number.isFinite(row.durationMs) && row.durationMs > 0
    ? Math.round(row.durationMs)
    : undefined
  return durationMs ? { kind, durationMs } : { kind }
}

/** Default is a hard cut. Grammar fills in only when the planner omitted the boundary. */
export function transitionForBoundary(shot: Pick<StructuredShot, 'visualPrompt' | 'mood' | 'sceneNumber'>, previous?: Pick<StructuredShot, 'sceneNumber'>): ShotTransition {
  const text = `${shot.visualPrompt ?? ''} ${shot.mood ?? ''}`.toLowerCase()
  if (/fade to black|closing text|end of the film/.test(text)) return { kind: 'fade-out', durationMs: 800 }
  if (/flashback|years earlier|memory of/.test(text)) return { kind: 'flash', durationMs: 200 }
  if (/\bmontage\b/.test(text)) return { kind: 'dissolve', durationMs: 500 }
  if (/unmask|mask comes off/.test(text)) return { kind: 'match' }
  if (previous && shot.sceneNumber != null && previous.sceneNumber != null && shot.sceneNumber !== previous.sceneNumber) {
    return { kind: 'cut' }
  }
  return { kind: 'cut' }
}

export function sequenceParts(text: string): string[] {
  const body = text.trim()
  if (!promptHasSequence(body)) return body ? [body] : []
  const byWords = body
    .split(SEQUENCE)
    .map((part) => part.replace(/^[,.\s]+|[,.\s]+$/g, '').trim())
    .filter((part) => part.length >= 8)
  if (byWords.length >= 2) return byWords
  const sentences = body.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length >= 12)
  return sentences.length >= 2 ? sentences : [body]
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string {
  return nameList(value).join(', ')
}

function nameList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]
    if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
      const name = (item as { name: string }).name.trim()
      return name ? [name] : []
    }
    return []
  })
}

function shotAction(shot: Record<string, unknown>, basePrompt: string): string {
  const visual = asText(shot.visualPrompt) || asText(shot.prompt)
  if (visual) return capPromptText(visual, DIRECTOR_SHOT_PROMPT_BUDGET)
  const bits = [
    asText(shot.shotSize),
    asText(shot.cameraMove),
    asText(shot.lighting),
    asText(shot.mood),
    stringList(shot.charactersPresent),
    stringList(shot.locationsPresent),
  ].filter(Boolean)
  if (bits.length) return capPromptText(bits.join(', '), DIRECTOR_SHOT_PROMPT_BUDGET)
  const brief = basePrompt.trim()
  if (brief) return capPromptText(brief, DIRECTOR_SHOT_PROMPT_BUDGET)
  return 'Cinematic shot'
}

function asShotArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    for (const key of ['shots', 'shotList', 'scenes']) {
      if (Array.isArray(rec[key])) return rec[key]
    }
  }
  return null
}

function salvageJson(raw: string): unknown {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    const match = cleaned.match(/\[[\s\S]*\]/) ?? cleaned.match(/\{[\s\S]*\}/)
    if (!match) {
      console.warn('[breakdown] json salvage found no object', err instanceof Error ? err.message : err)
      return null
    }
    try {
      return JSON.parse(match[0])
    } catch (inner) {
      console.warn('[breakdown] json salvage failed', inner instanceof Error ? inner.message : inner)
      return null
    }
  }
}

function parseShotArray(raw: string): unknown[] | null {
  return asShotArray(salvageJson(raw))
}

function shotsLackAction(shots: unknown[]): boolean {
  if (!shots.length) return true
  return shots.every((shot) => {
    if (!shot || typeof shot !== 'object') return true
    const row = shot as Record<string, unknown>
    return !asText(row.visualPrompt) && !asText(row.prompt)
  })
}

export async function breakdownToShots(
  prompt:        string,
  totalSeconds:  number,
  assets:        PatientZeroAssets,
  availablePool: string[] = [],
  pacingNote?:   string,
  options?:      { treatment?: string; license?: CreativeLicense; premise?: PremiseLock; qualityTier?: 'draft' | 'standard' | 'blockbuster' },
): Promise<StructuredShot[]> {

  const characterNames = (assets?.characters ?? []).map(c => c.name).join(', ') || 'none'
  const locationNames  = (assets?.locations ?? []).map(l => l.name).join(', ')  || 'none'

  const modelHints = availablePool.length > 0
    ? availablePool
        .map(m => {
          const spec = MODEL_SPECIALTIES[m]
          return spec ? `• ${m}: ${spec.bestFor}` : null
        })
        .filter(Boolean)
        .join('\n')
    : 'All models available — use the full content type range'

  const license = options?.license ?? 'faithful'
  const premise = options?.premise
  const maxQuality = options?.qualityTier === 'blockbuster'
  const structureTier = premise ? 'creative' as const : 'mechanical' as const
  const breakdownModel = maxQuality ? MAX_QUALITY_BREAKDOWN_MODEL : llmModelForTask('scene').model
  const treatment = [options?.treatment?.trim(), pacingNote?.trim() ? `Pacing: ${pacingNote.trim()}` : '']
    .filter(Boolean)
    .join('\n')
  const grounding = license === 'interpretive'
    ? 'You may heighten the telling. The subject, action, character, and setting stay the user\'s.'
    : 'Realize the script as written. Add camera, lighting, and mood only. Do not invent a different story or a different character.'

  const message = await claudeCall({
      model:      breakdownModel,
      max_tokens: 4096,
      system: `You are a Hollywood cinematographer and VFX supervisor.
Break down video prompts into structured shot lists optimised for multi-model AI generation.
You will be given the available AI video models and their specialties.
Design shots that PLAY TO THE STRENGTHS of the available models.
For example: if Kling is available, design locomotion/action shots; if Seedance, dialogue close-ups.
If only budget models are available, keep shots simple and achievable.
Cover each scene as a film, not as one clip.
One shot is ONE camera setup, ONE sustained action, and ONE lighting state, lasting 3 to 8 seconds.
A scene with several beats is several shots: wide establishing, then mediums, close-ups, a POV, an insert, then the action beat.
Do not emit one shot per scene. Do not write "then", "next", "after", "and then", or a lighting change inside one visualPrompt.
Each shot has a transition INTO it. Default is cut. Scene or location change is cut. A flashback is flash. A montage is dissolve. An ending is fade-out. An unmasking matched to the previous frame is match. A cut is two separate clips, never one clip morphing between them.
Duration comes from that one beat. Do not stretch a shot to cover the whole scene.
When an emotional pacing map is provided, lingering beats become slow push-ins and wider frames;
tense or rapid beats become tighter, faster moves. POV is for subjectivity. A low angle is for power.
Camera intent is structured data on each shot, not only prose.
Group shots into continuity chains. Shots that depict ONE continuous unbroken action
(same location, same moment, camera following through) share a continuityGroup number.
A hard cut to a different location/time/subject starts a NEW continuityGroup.
Most narrative films have several short chains rather than one long one.
Each visualPrompt is ONE beat of the user's scene, under 1500 characters, with the same subject already in frame.
${premise ? `Every shot must include premiseElementIds naming which locked character, setting, or "story" it serves. A shot that serves none is drift and must not be returned.\n${formatPremise(premise)}` : ''}
The user's subject, action, character, and setting stay in every visualPrompt.
Never leave visualPrompt empty. ${grounding}
Return ONLY a JSON object {"shots":[ ...shot objects ]}. No markdown.`,
      messages: [{
        role:    'user',
        content: `USER SCRIPT (this is the film):
"""
${prompt}
"""
${treatment ? `\nTREATMENT ONLY (mood, pacing, camera, lighting, style — do not replace the script):\n${treatment}\n` : ''}
Total duration: ${totalSeconds} seconds
Characters available: ${characterNames}
Locations available: ${locationNames}

AVAILABLE MODELS AND THEIR STRENGTHS (design shots to use these):
${modelHints}

${pacingNote?.trim() ? `Emotional pacing (honor this in shot scale): ${pacingNote.trim()}` : ''}

Cover the script in discrete shots. A multi-beat scene is many shots, not one. Each duration is 3-8 seconds. Assign contentType values that match the available models above.

For each shot return:
{
  "shotIndex": number (0-based),
  "startSeconds": number,
  "endSeconds": number,
  "duration": number,
  "contentType": one of [aerial_establishing|dialogue_closeup|physical_action|cgi_vfx|crowd_urban|camera_control|physics_simulation|character_emotion|cgi_character|long_sequence|fast_draft|environment_travel|product_commercial|audio_native],
  "visualPrompt": "one sustained action, one lighting state, one camera move, subjects already in frame, under 1500 characters",
  "cameraMove": "static|slow_push_in|pull_out|pan_left|pan_right|tilt_up|tilt_down|crane_up|aerial_descent|handheld|orbit",
  "camera": {
    "angle": "eye_level|low|high|overhead|dutch|pov",
    "movement": "static|pan_left|pan_right|tilt_up|tilt_down|dolly_in|dolly_out|truck_left|truck_right|crane_up|crane_down|orbit|handheld|push_in|pull_out",
    "speed": "slow|medium|fast",
    "shotSize": "ECU|CU|MCU|MS|MLS|WS|EWS",
    "lensFeel": "wide|normal|telephoto"
  },
  "motionLevel": "static|slow|medium|fast|complex",
  "hasDialogue": boolean,
  "hasFaces": boolean,
  "hasAudio": boolean,
  "hasCGI": boolean,
  "charactersPresent": [],
  "locationsPresent": [],
  "lighting": "natural_day|golden_hour|night|overcast|studio|dramatic|neon",
  "mood": "tension|joy|sorrow|wonder|fear|calm|action",
  "bridgeRequired": boolean (true for all shots after the first),
  "suggestedModel": "which model from the available pool best suits this shot",
  "sceneNumber": number (narrative scene — new location/time = new sceneNumber),
  "scriptBeatId": string (optional id linking to a script dialogue beat),
  "continuity": "continuous|cut (continuous only in the same place and time as the previous shot; a cut, new location, or time change is cut)",
  "continuityGroup": number (same as sceneNumber when possible),
  "isChainStart": boolean (true ONLY for shotIndex 0 — first clip of the entire film),
  "premiseElementIds": ["id of a locked character, setting, or story"],
  "purpose": "hero|fill|camera|consistency|continuity|dialogue|motion|draft",
  "transition": { "kind": "cut|dissolve|fade-in|fade-out|match|flash", "durationMs": 0 }
}
Wrap every shot in {"shots":[...]}.`,
      }],
      response_format: 'json_object',
  }, maxQuality
    ? { source: 'orchestrator.structure' }
    : { source: premise ? 'orchestrator.structure' : 'breakdown', tier: structureTier })

  const basePrompt = typeof prompt === 'string' ? prompt.trim() : ''
  const fallbackShot = (): StructuredShot => {
    const fallbackCamera = normalizeCameraIntent({ cameraMove: 'slow_push_in', motionLevel: 'medium' })
    return {
      shotIndex:         0,
      startSeconds:      0,
      endSeconds:        beatDuration(totalSeconds),
      duration:          beatDuration(totalSeconds),
      contentType:       'physical_action',
      visualPrompt:      shotAction({}, basePrompt),
      cameraMove:        fallbackCamera.cameraMove ?? 'push in',
      cameraAngle:       fallbackCamera.cameraAngle,
      shotSize:          fallbackCamera.shotSize,
      lensFeel:          fallbackCamera.lensFeel,
      cameraSpeed:       fallbackCamera.cameraSpeed,
      cameraPrecision:   fallbackCamera.cameraPrecision,
      motionLevel:       'medium',
      hasDialogue:       false,
      hasFaces:          false,
      hasAudio:          false,
      hasCGI:            false,
      charactersPresent: [],
      locationsPresent:  [],
      lighting:          'natural_day',
      mood:              'calm',
      bridgeRequired:    false,
      continuityGroup:   0,
      isChainStart:      true,
    }
  }

  let rows = parseShotArray(claudeText(message))
  if (!rows || shotsLackAction(rows)) {
    recordLlmRetry('breakdown')
    const retry = await claudeCall({
      model: llmModelForTask('scene').model,
      max_tokens: 2048,
      system: 'Return ONLY a JSON object {"shots":[...]}. Every visualPrompt depicts the user script and is non-empty, under 1500 characters. Do not change the subject, action, character, or setting. No markdown.',
      messages: [{
        role: 'user',
        content: `The previous breakdown omitted visualPrompt. Cover THIS script in multiple shots. Each visualPrompt is one action, one lighting state, and one camera move, 3-8 seconds, subjects already in frame.\nUSER SCRIPT:\n"""\n${basePrompt}\n"""\nCharacters: ${characterNames}\nLocations: ${locationNames}`,
      }],
      response_format: 'json_object',
    }, { source: 'breakdown', tier: 'mechanical' })
    const retried = parseShotArray(claudeText(retry))
    if (retried) rows = retried
  }

  const finish = async (planned: StructuredShot[]) => {
    const locked = premise ? await groundShots(planned, premise) : planned
    return splitCoarsePlan(enforceScriptFidelity(locked, prompt))
  }

  if (!rows) return finish([fallbackShot()])

  const seenGroups = new Set<number>()
  const shots: StructuredShot[] = rows
    .filter((shot): shot is StructuredShot => shot != null && typeof shot === 'object')
    .map((shot, index) => {
      const sceneNumber = shot.sceneNumber ?? shot.continuityGroup ?? shot.shotIndex ?? index
      const continuityGroup = shot.continuityGroup ?? sceneNumber
      const isChainStart = shot.isChainStart ?? index === 0
      seenGroups.add(continuityGroup)
      const row = shot as unknown as Record<string, unknown>
      const visualPrompt = shotAction(row, basePrompt)
      const continuityText = asText(row.continuity)
      const startsAtHardCut = shot.startsAtHardCut ?? (continuityText === 'cut' || index === 0)
      const camera = normalizeCameraIntent({
        camera: (shot as { camera?: CameraIntentInput['camera'] }).camera,
        cameraMove: shot.cameraMove,
        motionLevel: shot.motionLevel,
        contentType: shot.contentType,
      })
      const rawIndex = (shot as { shotIndex?: unknown }).shotIndex
      const shotIndex = typeof rawIndex === 'number' && Number.isFinite(rawIndex)
        ? rawIndex
        : typeof rawIndex === 'string' && Number.isFinite(Number(rawIndex))
          ? Number(rawIndex)
          : index
      return {
        ...shot,
        shotIndex,
        visualPrompt,
        charactersPresent: nameList(row.charactersPresent),
        locationsPresent: nameList(row.locationsPresent),
        premiseElementIds: nameList(row.premiseElementIds),
        purpose: isShotPurpose(asText(row.purpose)) ? asText(row.purpose) as StructuredShot['purpose'] : undefined,
        continuity: continuityText === 'continuous' || continuityText === 'cut' ? continuityText as StructuredShot['continuity'] : undefined,
        sceneNumber,
        continuityGroup,
        isChainStart,
        startsAtHardCut,
        ...camera,
        duration: beatDuration(Number(shot.duration)),
        transition: readTransition(row.transition) ?? undefined,
      }
    })

  if (!shots.length) return finish([fallbackShot()])

  return finish(shots)
}

/** Split a prompt that asks one clip to perform a sequence. Reindex so labels stay 1..N. */
export function splitCoarsePlan(shots: StructuredShot[]): StructuredShot[] {
  const split = shots.flatMap((shot) => {
    const parts = sequenceParts(shot.visualPrompt ?? '')
    if (parts.length < 2) {
      return [{ ...shot, duration: beatDuration(shot.duration), visualPrompt: shot.visualPrompt ?? '' }]
    }
    console.log('[shot_split]', JSON.stringify({ from: shot.shotIndex, parts: parts.length }))
    return parts.map((part, index) => ({
      ...shot,
      visualPrompt: capPromptText(part, DIRECTOR_SHOT_PROMPT_BUDGET),
      duration: beatDuration(shot.duration),
      continuity: index === 0 ? shot.continuity : 'cut' as const,
      startsAtHardCut: index === 0 ? shot.startsAtHardCut : true,
      isChainStart: index === 0 ? shot.isChainStart : false,
      transition: index === 0 ? shot.transition : { kind: 'cut' as const },
    }))
  })
  let cursor = 0
  return split.map((shot, index) => {
    const duration = beatDuration(shot.duration)
    const previous = index > 0 ? split[index - 1] : undefined
    const next = {
      ...shot,
      shotIndex: index,
      startSeconds: cursor,
      duration,
      endSeconds: cursor + duration,
      transition: shot.transition ?? transitionForBoundary(shot, previous),
    }
    cursor += duration
    return next
  })
}

/**
 * Group shots into continuity chains. Shots sharing a continuityGroup form one
 * sequential chain (rendered tail-to-head); separate groups render in parallel.
 */
export function groupIntoChains(shots: StructuredShot[]): ContinuityChain[] {
  const groups = new Map<number, StructuredShot[]>()
  for (const shot of shots) {
    const g = shot.continuityGroup ?? shot.shotIndex   // fallback: each shot its own chain
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(shot)
  }
  return [...groups.entries()]
    .map(([groupId, s]) => ({ groupId, shots: s.sort((a, b) => a.shotIndex - b.shotIndex) }))
    .sort((a, b) => a.shots[0].shotIndex - b.shots[0].shotIndex)
}
