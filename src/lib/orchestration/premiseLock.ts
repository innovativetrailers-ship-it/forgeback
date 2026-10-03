import {
  applyShotSpec,
  enrichmentKeepsPremise,
  formatPremise,
  groundingCheck as premiseGrounded,
  llmModelForTier,
  parsePremiseLock,
  recordLlmRetry,
  type PremiseLock,
  type ShotPurpose,
} from '@cinema/core'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { db } from '@/lib/db'
import type { StructuredShot } from './types'

const REGEN_LIMIT = 1

function jsonObject(raw: string): unknown {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    const match = cleaned.match(/\{[\s\S]*\}/) ?? cleaned.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        console.warn("[caught] src/lib/orchestration/premiseLock.ts:20", err instanceof Error ? { name: err.name, message: err.message } : err)
      }
    }
    return null
  }
}

export async function extractPremiseLock(script: string): Promise<PremiseLock> {
  const ask = async (extra: string): Promise<PremiseLock | null> => {
    const message = await claudeCall({
      model: llmModelForTier('mechanical'),
      max_tokens: 1200,
      system: `Extract the immutable premise of this film. Return ONLY JSON with characters, settings, story, genre, tone.
characters and settings are arrays of { id, name, description }.
Include only people, places, and actions that the script states. Do not invent a new subject.
${extra}`,
      messages: [{ role: 'user', content: script }],
      response_format: 'json_object',
    }, { source: 'orchestrator.premise', tier: 'mechanical' })
    return parsePremiseLock(jsonObject(claudeText(message)))
  }
  const first = await ask('')
  if (first) return first
  recordLlmRetry('orchestrator.premise')
  const second = await ask('The previous reply was not valid JSON. Return one JSON object and nothing else.')
  if (!second) throw new Error('Premise lock could not be read')
  return second
}

export async function savePremiseLock(projectId: string, lock: PremiseLock): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: { premiseLock: JSON.parse(JSON.stringify(lock)) },
  })
}

export async function loadPremiseLock(projectId: string): Promise<PremiseLock | null> {
  const row = await db.project.findUnique({
    where: { id: projectId },
    select: { premiseLock: true },
  })
  return parsePremiseLock(row?.premiseLock)
}

export async function groundingCheck(
  shot: { visualPrompt?: string; premiseElementIds?: string[] },
  premise: PremiseLock,
): Promise<{ grounded: boolean; reason?: string }> {
  const local = premiseGrounded(shot, premise)
  if (!local.grounded) return local
  const message = await claudeCall({
    model: llmModelForTier('mechanical'),
    max_tokens: 200,
    system: 'Decide whether this shot stays inside the locked premise. Return ONLY JSON {"grounded":boolean,"reason":string}. grounded is false when the shot adds a subject, place, or action the premise did not ask for.',
    messages: [{
      role: 'user',
      content: `PREMISE\n${formatPremise(premise)}\n\nSHOT\n${shot.visualPrompt ?? ''}`,
    }],
  }, { source: 'orchestrator.grounding', tier: 'mechanical' })
  const parsed = jsonObject(claudeText(message))
  if (!parsed || typeof parsed !== 'object') return local
  const row = parsed as { grounded?: unknown; reason?: unknown }
  if (typeof row.grounded !== 'boolean') return local
  return {
    grounded: row.grounded,
    reason: typeof row.reason === 'string' ? row.reason : undefined,
  }
}

async function regenerateShot(
  shot: StructuredShot,
  premise: PremiseLock,
  reason: string,
): Promise<StructuredShot> {
  const message = await claudeCall({
    model: llmModelForTier('mechanical'),
    max_tokens: 700,
    system: 'Rewrite this one shot so it depicts the locked premise. Return ONLY JSON with visualPrompt, premiseElementIds, charactersPresent, locationsPresent. Keep the premise characters, settings, and story. Change only the wording.',
    messages: [{
      role: 'user',
      content: `PREMISE\n${formatPremise(premise)}\n\nFAILED SHOT\n${shot.visualPrompt}\n\nREASON\n${reason}`,
    }],
  }, { source: 'orchestrator.grounding', tier: 'mechanical' })
  const parsed = jsonObject(claudeText(message))
  if (!parsed || typeof parsed !== 'object') return shot
  const row = parsed as Record<string, unknown>
  const visualPrompt = typeof row.visualPrompt === 'string' ? row.visualPrompt.trim() : ''
  if (!visualPrompt) return shot
  const ids = Array.isArray(row.premiseElementIds)
    ? row.premiseElementIds.filter((id): id is string => typeof id === 'string')
    : shot.premiseElementIds
  const names = (value: unknown, fallback: string[]) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : fallback
  return {
    ...shot,
    visualPrompt,
    premiseElementIds: ids,
    charactersPresent: names(row.charactersPresent, shot.charactersPresent),
    locationsPresent: names(row.locationsPresent, shot.locationsPresent),
  }
}

async function enrichShots(shots: StructuredShot[], premise: PremiseLock): Promise<StructuredShot[]> {
  if (!shots.length) return shots
  const message = await claudeCall({
    model: llmModelForTier('mechanical'),
    max_tokens: 1600,
    system: 'Add cinematic treatment only: pacing, mood, camera, lighting, shot variety. The premise characters, settings, and story are fixed. Return ONLY a JSON array of { shotIndex, mood, lighting, cameraMove, visualPrompt }. visualPrompt must still name the same characters and places.',
    messages: [{
      role: 'user',
      content: `PREMISE\n${formatPremise(premise)}\n\nSHOTS\n${JSON.stringify(shots.map((shot) => ({
        shotIndex: shot.shotIndex,
        visualPrompt: shot.visualPrompt,
        mood: shot.mood,
        lighting: shot.lighting,
        cameraMove: shot.cameraMove,
      })))}`,
    }],
  }, { source: 'orchestrator.enrichment', tier: 'mechanical' })
  const parsed = jsonObject(claudeText(message))
  if (!Array.isArray(parsed)) return shots
  const byIndex = new Map<number, Record<string, unknown>>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.shotIndex === 'number') byIndex.set(row.shotIndex, row)
  }
  return shots.map((shot) => {
    const patch = byIndex.get(shot.shotIndex)
    if (!patch) return shot
    const nextPrompt = typeof patch.visualPrompt === 'string' ? patch.visualPrompt.trim() : ''
    const visualPrompt = nextPrompt && enrichmentKeepsPremise(shot.visualPrompt, nextPrompt, premise)
      ? nextPrompt
      : shot.visualPrompt
    return {
      ...shot,
      visualPrompt,
      mood: typeof patch.mood === 'string' && patch.mood.trim() ? patch.mood.trim() : shot.mood,
      lighting: typeof patch.lighting === 'string' && patch.lighting.trim() ? patch.lighting.trim() : shot.lighting,
      cameraMove: typeof patch.cameraMove === 'string' && patch.cameraMove.trim() ? patch.cameraMove.trim() : shot.cameraMove,
    }
  })
}

/** Structural premise check only. A second model pass per shot is not part of generation. */
export async function groundShots(shots: StructuredShot[], premise: PremiseLock): Promise<StructuredShot[]> {
  const spec = applyShotSpec(shots, premise) as StructuredShot[]
  const kept = spec.filter((shot) => premiseGrounded(shot, premise).grounded)
  if (kept.length) return kept
  const base = shots[0]
  if (!base) return []
  const spine = premise.characters.map((el) => el.name).concat(premise.settings.map((el) => el.name)).join(', ')
  const fallback: StructuredShot = {
    ...base,
    shotIndex: 0,
    visualPrompt: [premise.story, spine].filter(Boolean).join(' '),
    premiseElementIds: ['story', ...premise.characters.map((el) => el.id), ...premise.settings.map((el) => el.id)],
    purpose: 'hero' as ShotPurpose,
    chainFrom: null,
    charactersPresent: premise.characters.map((el) => el.name),
    locationsPresent: premise.settings.map((el) => el.name),
  }
  const [only] = applyShotSpec([fallback], premise)
  return only ? [only as StructuredShot] : []
}
