import type { Character, Location, Project, Shot } from '../types/entities'
import type { JobEvent } from '../types/provider'

export interface EnqueueJob {
  type: string
  payload: unknown
}

/**
 * The only host seam. Web (Prisma/BullMQ/R2/env) and desktop
 * (SQLite/JobRunner/MEDIA_DIR/keychain) each implement this.
 * Spine code does not branch on host.
 */
export interface HostAdapter {
  getProject(id: string): Promise<Project | null>
  saveShot(shot: Partial<Shot> & { id: string }): Promise<Shot>
  getShots(projectId: string): Promise<Shot[]>
  getCharacters(projectId: string): Promise<Character[]>
  getLocations(projectId: string): Promise<Location[]>
  enqueue(job: EnqueueJob): Promise<{ jobId: string }>
  onJobEvent(cb: (event: JobEvent) => void): void
  persistMedia(srcUrl: string, key: string): Promise<string>
  mediaPlaybackUrl(assetId: string): string
  saveFileDialog?(name: string, srcPath: string): Promise<void>
  getSecret(name: string): Promise<string | null>
  isGenerationPaused(): Promise<boolean>
}
