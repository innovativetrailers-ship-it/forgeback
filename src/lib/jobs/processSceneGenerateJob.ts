import { db } from '@/lib/db'
import { appendJobProgressEvent } from '@/lib/jobs/jobProgressEvents'
import { toRagConstraint } from '@/lib/orchestration/tierPolicy'
import { isShotPurpose } from '@cinema/core'
import { orchestrate } from '@/lib/orchestration'
import { extractDialogueForShots } from '@/lib/orchestration/dialogueExtractor'
import type { StructuredShot } from '@/lib/orchestration/types'

export interface ProcessSceneGenerateInput {
  jobId: string
  userId: string
  projectId: string
  sceneId: string
  sceneNumber: number
  isFirstScene: boolean
  crossSceneAnchor?: string
  selectedModels: string[]
  mode: 'draft' | 'production'
}

export async function processSceneGenerateJob(input: ProcessSceneGenerateInput): Promise<void> {
  const {
    jobId, projectId, sceneId, sceneNumber, isFirstScene,
    crossSceneAnchor, selectedModels, mode,
  } = input

  const scene = await db.studioScene.findUnique({
    where: { id: sceneId },
    include: { clips: { orderBy: { clipNumber: 'asc' } } },
  })
  if (!scene) throw new Error(`Scene ${sceneId} not found`)

  const baseIndex = (sceneNumber - 1) * 100
  const shots: StructuredShot[] = scene.clips.map((clip, i) => ({
    shotIndex: baseIndex + i,
    startSeconds: 0,
    endSeconds: clip.duration,
    duration: clip.duration,
    contentType: 'dialogue_closeup' as const,
    visualPrompt: clip.prompt,
    cameraMove: clip.cameraMove ?? 'slow_push_in',
    motionLevel: 'medium',
    hasDialogue: Boolean(clip.lipSyncEnabled),
    hasFaces: true,
    hasAudio: false,
    hasCGI: false,
    charactersPresent: [],
    locationsPresent: [],
    lighting: 'natural_day',
    mood: 'calm',
    bridgeRequired: i > 0,
    sceneNumber,
    scriptBeatId: clip.scriptBeatId ?? undefined,
    continuityGroup: sceneNumber,
    isChainStart: isFirstScene && i === 0,
    storyboardUrl: clip.keyframeUrl ?? undefined,
    purpose: clip.purpose && isShotPurpose(clip.purpose) ? clip.purpose : undefined,
    modelOverride: clip.modelOverride,
    moneyShot: clip.moneyShot,
    chainFrom: clip.chainFrom,
    characterIds: clip.characterIds,
    locationId: clip.locationId,
    cameraPrecision: clip.cameraPrecision,
    endFrameUrl: clip.endFrameUrl,
  }))

  await appendJobProgressEvent(
    jobId,
    { phase: `scene_${sceneNumber}_start`, status: 'running', detail: 'Generating scene…', pct: 10 },
    { status: 'PROCESSING', progressPct: 10, phase: 'generating' },
  )

  const planned = await orchestrate({
    prompt: shots.map((shot) => shot.visualPrompt).filter(Boolean).join('\n') || `Scene ${sceneNumber}`,
    totalDuration: Math.max(5, shots.reduce((sum, shot) => sum + shot.duration, 0)),
    selectedModels,
    userId: input.userId,
    jobId,
    projectId,
    skipInterpret: true,
    directedShots: shots,
    generationMode: mode,
    qualityTier: toRagConstraint(mode === 'draft' ? 'draft' : 'standard'),
    onProgress: (phase, detail, pct) => {
      void appendJobProgressEvent(
        jobId,
        { phase, status: 'running', detail, pct },
        { progressPct: pct },
      )
    },
  })
  let segments = planned.segments

  await extractDialogueForShots(shots, projectId)

  const lastSeg = segments[segments.length - 1]
  if (lastSeg?.tailFrameUrl) {
    await db.studioScene.update({
      where: { id: sceneId },
      data: { transitionFrame: lastSeg.tailFrameUrl, status: 'GENERATED' },
    })
  } else {
    await db.studioScene.update({ where: { id: sceneId }, data: { status: 'GENERATED' } })
  }

  for (let i = 0; i < scene.clips.length; i++) {
    const seg = segments[i]
    if (!seg) continue
    await db.studioClip.update({
      where: { sceneId_clipNumber: { sceneId, clipNumber: i + 1 } },
      data: { videoUrl: seg.videoUrl },
    })
  }

  await appendJobProgressEvent(
    jobId,
    { phase: 'complete', status: 'completed', detail: 'Scene complete', pct: 100 },
    {
      status: 'COMPLETE',
      progressPct: 100,
      outputUrl: segments[0]?.videoUrl,
      completedAt: new Date(),
    },
  )

  void crossSceneAnchor
  void isFirstScene
}
