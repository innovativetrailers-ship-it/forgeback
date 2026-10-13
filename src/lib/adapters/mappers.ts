import type { AnchorSource, Character, Location, Project, Shot, ShotStatus } from '@cinema/core'
import type { StudioClipStatus } from '@/generated/prisma/client'

export interface StudioClipRow {
  id: string
  sceneId: string
  clipNumber: number
  prompt: string
  status: StudioClipStatus | string
  assignedModel: string | null
  modelOverride: string | null
  anchorFrameUrl: string | null
  anchorSource: string
  videoUrl: string | null
  rawVideoUrl: string | null
  lastFrame: string | null
  duration: number
  falRequestId: string | null
  generatingAt: Date | null
  characterIds?: string[]
  locationId?: string | null
}

export interface VaultCharacterRow {
  id: string
  projectId: string
  name: string
  referenceUrls: string[]
  behavioralPrompt: string | null
  voiceId: string | null
  appearance: unknown
}

export interface LocationPlateRow {
  id: string
  displayName: string | null
  imageUrl: string
  lat: number | null
  lng: number | null
}

const SHOT_STATUS: Record<string, ShotStatus> = {
  PENDING: 'pending',
  AWAITING_DIRECTION: 'awaiting_direction',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
  MANUAL: 'completed',
}

const ROW_STATUS: Record<ShotStatus, StudioClipStatus> = {
  pending: 'PENDING',
  awaiting_direction: 'AWAITING_DIRECTION',
  generating: 'GENERATING',
  completed: 'COMPLETED',
  failed: 'FAILED',
}

function anchorSource(value: string): AnchorSource {
  const key = value.toLowerCase()
  if (key === 'auto' || key === 'manual' || key === 'keyframe' || key === 'generated' || key === 'none') {
    return key
  }
  return 'none'
}

export function studioClipToShot(row: StudioClipRow, projectId: string): Shot {
  const selected = row.modelOverride?.trim() || row.assignedModel?.trim() || ''
  return {
    id: row.id,
    sceneId: row.sceneId,
    projectId,
    order: row.clipNumber,
    prompt: row.prompt,
    status: SHOT_STATUS[row.status] ?? 'pending',
    selectedModelId: selected,
    provider: 'fal',
    modelOverride: Boolean(row.modelOverride?.trim()),
    anchorFrameUrl: row.anchorFrameUrl,
    anchorSource: anchorSource(row.anchorSource),
    characterIds: row.characterIds ?? [],
    locationId: row.locationId ?? null,
    videoUrl: row.videoUrl,
    sourceProviderUrl: row.rawVideoUrl,
    lastFrame: row.lastFrame,
    durationSec: row.duration,
    falRequestId: row.falRequestId,
    qualityScore: null,
    continuityGroupId: null,
    createdAt: row.generatingAt?.getTime() ?? 0,
    updatedAt: row.generatingAt?.getTime() ?? 0,
  }
}

export function shotToStudioClipData(shot: Partial<Shot> & { id: string }): {
  prompt?: string
  status?: StudioClipStatus
  assignedModel?: string
  modelOverride?: string | null
  anchorFrameUrl?: string | null
  videoUrl?: string | null
  rawVideoUrl?: string | null
  lastFrame?: string | null
  falRequestId?: string | null
  duration?: number
  characterIds?: string[]
  locationId?: string | null
} {
  return {
    ...(shot.prompt !== undefined ? { prompt: shot.prompt } : {}),
    ...(shot.characterIds !== undefined ? { characterIds: shot.characterIds } : {}),
    ...(shot.locationId !== undefined ? { locationId: shot.locationId } : {}),
    ...(shot.status !== undefined ? { status: ROW_STATUS[shot.status] } : {}),
    ...(shot.selectedModelId !== undefined && !shot.modelOverride ? { assignedModel: shot.selectedModelId } : {}),
    ...(shot.modelOverride ? { modelOverride: shot.selectedModelId ?? null } : {}),
    ...(shot.anchorFrameUrl !== undefined ? { anchorFrameUrl: shot.anchorFrameUrl } : {}),
    ...(shot.videoUrl !== undefined ? { videoUrl: shot.videoUrl } : {}),
    ...(shot.sourceProviderUrl !== undefined ? { rawVideoUrl: shot.sourceProviderUrl } : {}),
    ...(shot.lastFrame !== undefined ? { lastFrame: shot.lastFrame } : {}),
    ...(shot.falRequestId !== undefined ? { falRequestId: shot.falRequestId } : {}),
    ...(shot.durationSec !== undefined && shot.durationSec !== null ? { duration: shot.durationSec } : {}),
  }
}

export function vaultCharacterToCharacter(row: VaultCharacterRow, voiceId?: string | null): Character {
  const appearance = typeof row.appearance === 'string' ? row.appearance : ''
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    referenceImageUrl: row.referenceUrls[0] ?? '',
    seed: null,
    voiceId: row.voiceId ?? voiceId ?? null,
    descriptor: row.behavioralPrompt ?? appearance,
    wardrobe: null,
  }
}

export function locationPlateToLocation(row: LocationPlateRow, projectId: string): Location {
  const coords = row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null
  return {
    id: row.id,
    projectId,
    label: row.displayName ?? 'Location plate',
    plateUrl: row.imageUrl,
    coords,
  }
}

export function projectRowToProject(row: {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  fps: number
}): Project {
  const fps = row.fps === 30 || row.fps === 60 ? row.fps : 24
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    settings: {
      aspectRatio: '16:9',
      fps,
      resolution: '1080p',
      qualityTier: 'studio',
      colorSpace: 'rec709',
    },
  }
}
