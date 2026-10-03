import { nanoid } from 'nanoid'
import {
  matchEntityName,
  mergePremiseLocks,
  premiseFromTreatmentText,
  type IngestType,
  type PremiseLock,
  type UnderstandResult,
} from '@cinema/core'
import { db } from '@/lib/db'
import { extractPremiseLock, loadPremiseLock, savePremiseLock } from '@/lib/orchestration/premiseLock'
import { parseScriptToShotPlan } from '@/lib/studio/shotPlan'
import { createLocation } from '@/lib/vault/location'
import { isTimelineRecipe, buildDefaultRecipe } from '@/lib/timeline/defaultRecipe'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import { isGenerationPaused } from '@/lib/generation/pause'
import type { ParsedIngest } from './parse'
import { recordIngestMemory, recordProjectContextChunks } from './embed'

const COUNCIL = [
  'gemini-omni',
  'veo-3.1',
  'kling-3.0',
  'seedance-2.0',
  'runway-gen4',
  'grok-imagine-video',
  'wan-2.7',
  'ltx-2.3-fast',
]

export interface LinkedEntities {
  characterId?: string
  locationId?: string
  voiceId?: string
  clipId?: string
  premiseUpdated: boolean
  shotPlan: boolean
  rag: boolean
}

export async function linkIngest(input: {
  userId: string
  projectId: string
  type: IngestType
  parsed: ParsedIngest
  understood: UnderstandResult
  mediaUrl?: string
}): Promise<LinkedEntities> {
  const linked: LinkedEntities = { premiseUpdated: false, shotPlan: false, rag: false }
  const type = input.understood.type || input.type

  if (type === 'character_ref' && input.mediaUrl) {
    linked.characterId = await linkCharacter(input)
  }
  if (type === 'location_ref' && input.mediaUrl) {
    linked.locationId = await linkLocation(input)
  }
  if (type === 'audio_sample' && input.mediaUrl) {
    linked.voiceId = await linkVoiceCandidate(input)
  }
  if (type === 'treatment') {
    linked.premiseUpdated = await linkTreatment(input)
  }
  if (type === 'script') {
    const scriptResult = await linkScript(input)
    linked.shotPlan = scriptResult.shotPlan
    linked.premiseUpdated = scriptResult.premiseUpdated || linked.premiseUpdated
  }
  if (type === 'rough_cut' && input.mediaUrl) {
    linked.clipId = await linkRoughCut({
      projectId: input.projectId,
      mediaUrl: input.mediaUrl,
      parsed: input.parsed,
    })
  }

  const summary = input.understood.description
    || input.parsed.look?.summary
    || input.parsed.text.slice(0, 400)
    || `${type} ingested`
  if (!isGenerationPaused()) {
    await recordIngestMemory({
      userId: input.userId,
      projectId: input.projectId,
      summary,
      intent: { type, role: input.understood.role, links: input.understood.links },
      brief: {
        type,
        look: input.parsed.look,
        boundaries: input.parsed.boundaries,
        mediaUrl: input.mediaUrl,
        characterId: linked.characterId,
        locationId: linked.locationId,
        voiceId: linked.voiceId,
        clipId: linked.clipId,
      },
    })
    const chunks = input.parsed.chunks.length ? input.parsed.chunks : (input.parsed.text ? [input.parsed.text] : [])
    if (chunks.length && (type === 'pdf' || type === 'link' || type === 'treatment' || type === 'unknown' || type === 'script')) {
      await recordProjectContextChunks({
        userId: input.userId,
        projectId: input.projectId,
        chunks,
        sourceType: type,
      })
    }
    linked.rag = true
  }
  return linked
}

async function linkCharacter(input: {
  userId: string
  projectId: string
  understood: UnderstandResult
  mediaUrl?: string
  imageBuffer?: Buffer
  imageFilename?: string
  imageMime?: string
}): Promise<string> {
  const name = input.understood.links.characterName
    || input.understood.role.replace(/^character reference of\s+/i, '').trim()
    || 'Cast'
  const existing = await db.vaultCharacter.findMany({
    where: { projectId: input.projectId },
    select: { id: true, name: true, referenceUrls: true },
  })
  const matched = matchEntityName(name, existing.map((row) => row.name))
  const row = matched ? existing.find((item) => item.name === matched) : null
  if (row) {
    const urls = input.mediaUrl && !row.referenceUrls.includes(input.mediaUrl)
      ? [...row.referenceUrls, input.mediaUrl]
      : row.referenceUrls
    await db.vaultCharacter.update({ where: { id: row.id }, data: { referenceUrls: urls } })
    return row.id
  }
  const created = await db.vaultCharacter.create({
    data: {
      projectId: input.projectId,
      name,
      referenceUrls: input.mediaUrl ? [input.mediaUrl] : [],
      behavioralPrompt: input.understood.description || undefined,
    },
  })
  return created.id
}

async function linkLocation(input: {
  projectId: string
  understood: UnderstandResult
  mediaUrl?: string
  parsed: ParsedIngest
}): Promise<string> {
  const name = input.understood.links.locationName
    || input.understood.role.replace(/^location reference of\s+/i, '').trim()
    || 'Location'
  const existing = await db.vaultLocation.findMany({
    where: { projectId: input.projectId },
    select: { id: true, name: true, referenceUrls: true },
  })
  const matched = matchEntityName(name, existing.map((row) => row.name))
  const row = matched ? existing.find((item) => item.name === matched) : null
  if (row) {
    const urls = input.mediaUrl && !row.referenceUrls.includes(input.mediaUrl)
      ? [...row.referenceUrls, input.mediaUrl]
      : row.referenceUrls
    await db.vaultLocation.update({ where: { id: row.id }, data: { referenceUrls: urls } })
    return row.id
  }
  const created = await createLocation({
    projectId: input.projectId,
    name,
    source: 'USER_UPLOAD',
    imageUrls: input.mediaUrl ? [input.mediaUrl] : [],
    generativePrompt: input.understood.description,
    metaJson: { look: input.parsed.look, ingest: true },
  })
  return created.id
}

async function linkVoiceCandidate(input: {
  userId: string
  understood: UnderstandResult
  mediaUrl?: string
}): Promise<string> {
  const name = input.understood.links.characterName
    || input.understood.role.replace(/^voice of\s+/i, '').trim()
    || 'Voice candidate'
  const voiceId = `candidate:${nanoid()}`
  await db.clonedVoice.create({
    data: {
      userId: input.userId,
      voiceId,
      name,
      description: input.mediaUrl ?? input.understood.description,
      source: 'ingest_candidate',
    },
  })
  return voiceId
}

async function linkTreatment(input: {
  projectId: string
  parsed: ParsedIngest
}): Promise<boolean> {
  const stored = await loadPremiseLock(input.projectId)
  let incoming: PremiseLock | null = null
  if (!isGenerationPaused()) {
    try {
      incoming = await extractPremiseLock(input.parsed.text)
    } catch (err) {
      console.warn("[caught] src/lib/ingest/link.ts:211", err instanceof Error ? { name: err.name, message: err.message } : err)

      incoming = premiseFromTreatmentText(input.parsed.text)
    }
  } else {
    incoming = premiseFromTreatmentText(input.parsed.text)
  }
  if (!incoming) return false
  const lock = stored ? mergePremiseLocks(stored, incoming) : incoming
  await savePremiseLock(input.projectId, lock)
  return true
}

async function linkScript(input: {
  userId: string
  projectId: string
  parsed: ParsedIngest
  understood: UnderstandResult
}): Promise<{ shotPlan: boolean; premiseUpdated: boolean }> {
  let premiseUpdated = false
  const names = input.parsed.script?.characters ?? []
  for (const name of names) {
    const existing = await db.vaultCharacter.findFirst({
      where: { projectId: input.projectId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) continue
    await db.vaultCharacter.create({
      data: { projectId: input.projectId, name, referenceUrls: [] },
    })
  }
  const locNames = input.parsed.script?.locations ?? []
  for (const name of locNames) {
    const existing = await db.vaultLocation.findFirst({
      where: { projectId: input.projectId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) continue
    await createLocation({
      projectId: input.projectId,
      name,
      source: 'USER_UPLOAD',
    })
  }
  const text = input.parsed.text
  if (text.length > 40 && !isGenerationPaused()) {
    try {
      await parseScriptToShotPlan({
        projectId: input.projectId,
        userId: input.userId,
        script: text,
        selectedModels: COUNCIL,
      })
      const stored = await loadPremiseLock(input.projectId)
      const extracted = await extractPremiseLock(text)
      await savePremiseLock(input.projectId, stored ? mergePremiseLocks(stored, extracted) : extracted)
      premiseUpdated = true
      return { shotPlan: true, premiseUpdated }
    } catch (err) {
      console.warn("[caught] src/lib/ingest/link.ts:266", err instanceof Error ? { name: err.name, message: err.message } : err)

      return { shotPlan: false, premiseUpdated }
    }
  }
  return { shotPlan: false, premiseUpdated }
}

async function linkRoughCut(input: {
  projectId: string
  mediaUrl: string
  parsed: ParsedIngest
}): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { timelineJson: true },
  })
  const base = isTimelineRecipe(project?.timelineJson)
    ? project.timelineJson
    : buildDefaultRecipe(input.projectId)
  const recipe = appendRoughCutClip(base, input.mediaUrl, input.parsed.boundaries, input.parsed.look?.summary)
  await db.project.update({
    where: { id: input.projectId },
    data: { timelineJson: JSON.parse(JSON.stringify(recipe)) },
  })
  const clip = recipe.tracks.find((t) => t.id === 't-v1')?.clips.at(-1)
  return clip?.id ?? ''
}

function appendRoughCutClip(
  recipe: TimelineRecipe,
  sourceUrl: string,
  boundaries: Array<{ start: number; end: number }>,
  prompt?: string,
): TimelineRecipe {
  const duration = boundaries.at(-1)?.end ?? 0
  const track = recipe.tracks.find((t) => t.id === 't-v1')
  if (!track) return recipe
  const lastEnd = track.clips.reduce((max, c) => Math.max(max, c.endTime), 0)
  const id = nanoid()
  const clipEnd = lastEnd + Math.max(duration, 1)
  track.clips.push({
    id,
    trackId: track.id,
    startTime: lastEnd,
    endTime: clipEnd,
    sourceUrl,
    prompt,
    metadata: { ingest: 'rough_cut', shotBoundaries: boundaries },
  })
  return {
    ...recipe,
    durationSeconds: Math.max(recipe.durationSeconds, clipEnd),
    tracks: recipe.tracks.map((t) => t.id === track.id ? { ...t, clips: [...track.clips] } : t),
  }
}
