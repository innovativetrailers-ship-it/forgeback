import { generationPausedFromEnv, type HostAdapter, type JobEvent, type Shot } from '@cinema/core'
import { db } from '@/lib/db'
import { persistClipVideoToR2 } from '@/lib/storage/persistMedia'
import { clipMediaPath } from '@/lib/media/clipPlayback'
import {
  locationPlateToLocation,
  projectRowToProject,
  shotToStudioClipData,
  studioClipToShot,
  vaultCharacterToCharacter,
  vaultLocationToLocation,
  type StudioClipRow,
} from './mappers'

const listeners = new Set<(event: JobEvent) => void>()

export function emitWebJobEvent(event: JobEvent): void {
  for (const listener of listeners) listener(event)
}

export const webHost: HostAdapter = {
  async getProject(id) {
    const row = await db.project.findUnique({
      where: { id },
      select: { id: true, title: true, createdAt: true, updatedAt: true, fps: true },
    })
    return row ? projectRowToProject(row) : null
  },

  async saveShot(shot) {
    const data = shotToStudioClipData(shot)
    const row = await db.studioClip.update({
      where: { id: shot.id },
      data,
      include: { scene: { select: { projectId: true } } },
    })
    return studioClipToShot(row as StudioClipRow, row.scene.projectId)
  },

  async getShots(projectId) {
    const rows = await db.studioClip.findMany({
      where: { scene: { projectId } },
      include: { scene: { select: { projectId: true } } },
      orderBy: { clipNumber: 'asc' },
    })
    return rows.map((row) => studioClipToShot(row as StudioClipRow, row.scene.projectId))
  },

  async getCharacters(projectId) {
    const rows = await db.vaultCharacter.findMany({ where: { projectId } })
    return rows.map((row) => vaultCharacterToCharacter(row))
  },

  async getLocations(projectId) {
    const vault = await db.vaultLocation.findMany({ where: { projectId } })
    return vault.map(vaultLocationToLocation)
  },

  async enqueue(job) {
    const payload = job.payload as { userId?: string; projectId?: string }
    const created = await db.renderJob.create({
      data: {
        userId: payload.userId ?? 'system',
        projectId: payload.projectId,
        type: 'GENERATE',
        status: 'QUEUED',
        inputPayload: job.payload as object,
      },
      select: { id: true },
    })
    return { jobId: created.id }
  },

  onJobEvent(cb) {
    listeners.add(cb)
  },

  async persistMedia(srcUrl, key) {
    const [projectId, clipId] = key.split('/')
    if (!projectId || !clipId) return srcUrl
    return persistClipVideoToR2(srcUrl, projectId, clipId)
  },

  mediaPlaybackUrl(assetId) {
    return clipMediaPath(assetId)
  },

  async getSecret(name) {
    const value = process.env[name]
    return value?.trim() ? value : null
  },

  async isGenerationPaused() {
    return generationPausedFromEnv(process.env.GENERATION_PAUSED)
  },
}

export async function loadShot(projectId: string, shotId: string): Promise<Shot | null> {
  const shots = await webHost.getShots(projectId)
  return shots.find((shot) => shot.id === shotId) ?? null
}

export { locationPlateToLocation }
