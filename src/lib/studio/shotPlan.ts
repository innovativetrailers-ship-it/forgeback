import { db } from '@/lib/db'
import { falLog } from '@/lib/fal/falQueue'
import { publicPlaybackUrlForClip } from '@/lib/media/clipPlayback'
import { buildChainForScene, groupIntoScenes } from '@/lib/orchestration/chainBuilder'
import { orchestrate } from '@/lib/orchestration'
import { syncScenesFromShots } from '@/lib/studio/sceneSync'
import { calculateGenerationCost } from '@/lib/credits'
import { failReasonsFor, isShotPurpose, ratingPromptFor } from '@cinema/core'
import type { DAGNode, StructuredShot } from '@/lib/orchestration/types'

export interface ShotPlanCard {
  id: string
  shotNumber: number
  sceneNumber: number
  sceneId: string
  prompt: string
  originalPrompt: string
  duration: number
  aspectRatio: string
  assignedModel: string
  modelOverride?: string
  status: 'pending' | 'awaiting_direction' | 'generating' | 'completed' | 'failed' | 'manual'
  videoUrl?: string
  lastFrame?: string
  keyframeUrl?: string
  anchorFrameUrl?: string
  anchorSource: 'auto' | 'manual' | 'keyframe' | 'none'
  directionNotes?: string
  anchorPolicy: string
  manualVideo: boolean
  estimatedCost: number
  lipSyncEnabled: boolean
  dialogueTrackId?: string
  dialogueText?: string
  dialogueVoiceId?: string
  durationWarning?: boolean
  characterIds: string[]
  locationId?: string | null
  cameraAngle?: string | null
  cameraMove?: string | null
  shotSize?: string | null
  lensFeel?: string | null
  cameraSpeed?: string | null
  cameraPrecision?: boolean
  cameraSource?: string | null
  endFrameUrl?: string | null
  chainFrom?: string | null
  chainBlock?: string | null
  purpose?: string | null
  delegationReason?: string | null
  delegatedMode?: string | null
  moneyShot?: boolean
  characterLoraId?: string | null
  styleLoraId?: string | null
  genrePresetId?: string | null
  rating?: { score: number; worked: boolean; reason: string | null }
  ratingPrompt?: string
  failReasons?: Array<{ id: string; label: string }>
  retryEligible?: boolean
  lastError?: {
    userMessage: string
    suggestedAction: string
    correctable: boolean
    category: string
    correction?: string | null
    rawError: string
    providerLogs?: string[]
  }
  lastQuality?: {
    verdict: string
    dimension?: string | null
    reason?: string | null
    source: string
  }
}

function mapAnchorSource(source: string): ShotPlanCard['anchorSource'] {
  switch (source) {
    case 'AUTO': return 'auto'
    case 'MANUAL': return 'manual'
    case 'KEYFRAME': return 'keyframe'
    default: return 'none'
  }
}

function mapClipStatus(
  status: string,
): ShotPlanCard['status'] {
  switch (status) {
    case 'AWAITING_DIRECTION': return 'awaiting_direction'
    case 'GENERATING': return 'generating'
    case 'COMPLETED': return 'completed'
    case 'FAILED': return 'failed'
    case 'MANUAL': return 'manual'
    default: return 'pending'
  }
}

export async function listShotPlan(projectId: string, userId?: string): Promise<{ shots: ShotPlanCard[]; totalCost: number }> {
  const { recoverOutstandingFalClips } = await import('@/lib/studio/recoverFalClip')
  await recoverOutstandingFalClips(projectId).catch((err) => {
    console.warn('[director] fal recovery skipped', err instanceof Error ? err.message : err)
  })
  const dialogueTracks = await db.audioTrack.findMany({
    where: { projectId, type: 'DIALOGUE' },
  })
  const dialogueByClip = new Map(
    dialogueTracks.filter((t) => t.shotPlanId).map((t) => [t.shotPlanId!, t]),
  )

  const scenes = await db.studioScene.findMany({
    where: { projectId },
    include: { clips: { orderBy: { clipNumber: 'asc' } } },
    orderBy: { sceneNumber: 'asc' },
  })

  const clipIds = scenes.flatMap((scene) => scene.clips.map((clip) => clip.id))
  const ratings = userId && clipIds.length
    ? await db.shotRating.findMany({
      where: { userId, shotId: { in: clipIds } },
      select: { shotId: true, score: true, worked: true, reason: true },
    })
    : []
  const ratingByClip = new Map(ratings.map((row) => [row.shotId, row]))
  const errors = clipIds.length
    ? await db.shotError.findMany({
      where: { shotId: { in: clipIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        shotId: true,
        userMessage: true,
        suggestedAction: true,
        correctable: true,
        category: true,
        correction: true,
        rawError: true,
        providerLogs: true,
      },
    })
    : []
  const errorByClip = new Map<string, (typeof errors)[number]>()
  for (const row of errors) {
    if (row.shotId && !errorByClip.has(row.shotId)) errorByClip.set(row.shotId, row)
  }
  const { latestQualityByShotIds } = await import('@/lib/diagnostics/qualityQuery')
  const qualityByClip = await latestQualityByShotIds(clipIds)

  const shots: ShotPlanCard[] = []
  let shotNumber = 0
  for (const scene of scenes) {
    for (const clip of scene.clips) {
      shotNumber++
      const purpose = clip.purpose && isShotPurpose(clip.purpose) ? clip.purpose : 'hero'
      shots.push({
        id: clip.id,
        shotNumber,
        sceneNumber: scene.sceneNumber,
        sceneId: scene.id,
        prompt: clip.prompt,
        originalPrompt: clip.originalPrompt ?? clip.prompt,
        duration: clip.duration,
        aspectRatio: clip.aspectRatio,
        assignedModel: clip.assignedModel?.trim() || '',
        modelOverride: clip.modelOverride ?? undefined,
        status: mapClipStatus(clip.status),
        videoUrl: publicPlaybackUrlForClip(clip.id, clip.videoUrl, clip.rawVideoUrl),
        lastFrame: clip.lastFrame ?? undefined,
        keyframeUrl: clip.keyframeUrl ?? undefined,
        anchorFrameUrl: clip.anchorFrameUrl ?? undefined,
        anchorSource: mapAnchorSource(clip.anchorSource),
        directionNotes: clip.directionNotes ?? undefined,
        anchorPolicy: clip.anchorPolicy,
        manualVideo: clip.manualVideo,
        estimatedCost: clip.estimatedCost,
        lipSyncEnabled: clip.lipSyncEnabled,
        dialogueTrackId: dialogueByClip.get(clip.id)?.id,
        dialogueText: dialogueByClip.get(clip.id)?.prompt ?? undefined,
        dialogueVoiceId: dialogueByClip.get(clip.id)?.voiceId ?? undefined,
        durationWarning: dialogueByClip.get(clip.id)?.durationWarning ?? false,
        characterIds: clip.characterIds,
        locationId: clip.locationId,
        cameraAngle: clip.cameraAngle,
        cameraMove: clip.cameraMove,
        shotSize: clip.shotSize,
        lensFeel: clip.lensFeel,
        cameraSpeed: clip.cameraSpeed,
        cameraPrecision: clip.cameraPrecision,
        cameraSource: clip.cameraSource,
        endFrameUrl: clip.endFrameUrl,
        chainFrom: clip.chainFrom,
        chainBlock: clip.chainBlock,
        purpose: clip.purpose,
        delegationReason: clip.delegationReason,
        delegatedMode: clip.delegatedMode,
        moneyShot: clip.moneyShot,
        characterLoraId: clip.characterLoraId,
        styleLoraId: clip.styleLoraId,
        genrePresetId: clip.genrePresetId,
        ratingPrompt: ratingPromptFor(purpose),
        failReasons: failReasonsFor(purpose),
        rating: ratingByClip.has(clip.id)
          ? {
            score: ratingByClip.get(clip.id)!.score,
            worked: ratingByClip.get(clip.id)!.worked,
            reason: ratingByClip.get(clip.id)!.reason,
          }
          : undefined,
        lastError: errorByClip.has(clip.id)
          ? {
            userMessage: errorByClip.get(clip.id)!.userMessage,
            suggestedAction: errorByClip.get(clip.id)!.suggestedAction,
            correctable: errorByClip.get(clip.id)!.correctable,
            category: errorByClip.get(clip.id)!.category,
            correction: errorByClip.get(clip.id)!.correction,
            rawError: errorByClip.get(clip.id)!.rawError,
            providerLogs: Array.isArray(errorByClip.get(clip.id)!.providerLogs)
              ? (errorByClip.get(clip.id)!.providerLogs as string[])
              : undefined,
          }
          : clip.status === 'FAILED' && clip.statusReason
            ? {
              userMessage: clip.statusReason,
              suggestedAction: clip.retryEligible ? 'Regenerate this shot.' : 'Edit the shot, then regenerate.',
              correctable: clip.retryEligible,
              category: 'reconciled',
              correction: null,
              rawError: clip.statusReason,
            }
            : undefined,
        retryEligible: clip.retryEligible,
        lastQuality: qualityByClip.has(clip.id)
          ? {
            verdict: qualityByClip.get(clip.id)!.verdict,
            dimension: qualityByClip.get(clip.id)!.dimension,
            reason: qualityByClip.get(clip.id)!.reason,
            source: qualityByClip.get(clip.id)!.source,
          }
          : undefined,
      })
    }
  }

  const totalCost = shots.reduce((a, s) => a + s.estimatedCost, 0)
  return { shots, totalCost }
}

export async function parseScriptToShotPlan(input: {
  projectId: string
  userId: string
  script: string
  selectedModels: string[]
  duration?: number
  qualityTier?: string
}): Promise<{ shots: StructuredShot[]; dag: DAGNode[] }> {
  const duration = input.duration ?? 60
  const planned = await orchestrate({
    prompt: input.script,
    totalDuration: duration,
    selectedModels: input.selectedModels,
    userId: input.userId,
    projectId: input.projectId,
    planOnly: true,
    generationMode: 'draft',
    qualityTier: input.qualityTier === 'Blockbuster' || input.qualityTier === 'blockbuster'
      ? 'blockbuster'
      : input.qualityTier === 'Draft' || input.qualityTier === 'draft'
        ? 'draft'
        : 'standard',
  })
  const shots = planned.plannedShots ?? []
  if (!shots.length) throw new Error('orchestrate returned no shots')
  const dag: DAGNode[] = shots.map((shot, index) => {
    const assignedModel = shot.suggestedModel ?? shot.modelOverride ?? input.selectedModels[0]
    if (!assignedModel) throw new Error(`Shot ${index} has no assignment from orchestrate`)
    return {
      shot,
      assignedModel,
      dependencies: index > 0 ? [index - 1] : [],
      shotMemory: [],
      estimatedCost: estimateShotCost(assignedModel, shot.duration),
      priority: shot.hasDialogue || shot.hasFaces ? 'critical' : 'normal',
      reason: shot.delegationReason,
    }
  })
  await syncScenesFromShots(input.projectId, shots, { dag, selectedModels: input.selectedModels })
  return { shots, dag }
}

export function estimateShotCost(model: string, durationSec: number): number {
  return calculateGenerationCost(model, durationSec)
}

export async function getClipAnchorFrame(
  projectId: string,
  globalShotNumber: number,
): Promise<string | undefined> {
  const { shots } = await listShotPlan(projectId)
  const prev = shots.find((s) => s.shotNumber === globalShotNumber - 1)
  return prev?.lastFrame ?? prev?.videoUrl
}

export function logChainBuilt(
  sceneNumber: number,
  sceneId: string,
  chain: ReturnType<typeof buildChainForScene>,
): void {
  falLog('info', 'chain_built', {
    sceneId,
    sceneNumber,
    clips: chain.map((c) => ({
      shotNumber: c.shotNumber,
      anchorPolicy: c.anchorPolicy,
      hasKeyframe: !!c.keyframeUrl,
      hasStartFrame: !!c.startFrameUrl,
      model: c.assignedModel,
    })),
  })
}
