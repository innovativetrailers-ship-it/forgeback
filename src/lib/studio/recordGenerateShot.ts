import { logCaught } from '@/lib/diagnostics/caught'
import { db } from '@/lib/db'
import { ensureOwnedProject } from '@/lib/projects/ensureOwnedProject'
import { objectKeyFromStored } from '@/lib/storage/r2'
import { noteClipTerminal } from '@/lib/studio/sceneRollup'

export async function recordGenerateShot(input: {
  userId: string
  projectId: string
  prompt: string
  duration: number
  aspectRatio?: string
  characterIds?: string[]
  locationId?: string | null
}): Promise<string> {
  return db.$transaction(async (tx) => {
    const projectId = await ensureOwnedProject(input.userId, input.projectId, tx)
    const last = await tx.studioScene.findFirst({
      where: { projectId },
      orderBy: { sceneNumber: 'desc' },
      select: { sceneNumber: true },
    })
    const scene = await tx.studioScene.create({
      data: {
        projectId,
        sceneNumber: (last?.sceneNumber ?? 0) + 1,
        title: 'Untitled',
      },
    })
    const clip = await tx.studioClip.create({
      data: {
        sceneId: scene.id,
        clipNumber: 1,
        prompt: input.prompt,
        originalPrompt: input.prompt,
        duration: Math.max(1, Math.round(input.duration) || 5),
        aspectRatio: input.aspectRatio?.trim() || '16:9',
        status: 'GENERATING',
        characterIds: input.characterIds ?? [],
        ...(input.locationId ? { locationId: input.locationId } : {}),
      },
    })
    return clip.id
  })
}

export async function completeGenerateShot(
  clipId: string,
  videoUrl: string,
  providerUrl?: string,
): Promise<void> {
  if (!clipId || !videoUrl.trim()) return
  const before = await db.studioClip.findUnique({ where: { id: clipId }, select: { status: true } })
  await db.studioClip.update({
    where: { id: clipId },
    data: {
      status: 'COMPLETED',
      videoUrl,
      storageKey: objectKeyFromStored(videoUrl),
      rawVideoUrl: providerUrl && providerUrl !== videoUrl ? providerUrl : null,
      generatingAt: null,
    },
  })
  await noteClipTerminal(clipId, before?.status !== 'COMPLETED')
}

export async function failGenerateShot(clipId: string | undefined): Promise<void> {
  if (!clipId) return
  await db.studioClip.update({
    where: { id: clipId },
    data: { status: 'FAILED', generatingAt: null, statusReason: 'Generation failed before a provider reason was stored. The clip was kept.' },
  }).catch((err) => logCaught('lib/studio/recordGenerateShot', err))
  await noteClipTerminal(clipId, false).catch((err) => logCaught('lib/studio/recordGenerateShot', err))
}
