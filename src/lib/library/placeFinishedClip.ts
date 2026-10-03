import type { GeneratedClip } from '@/components/simple/types'
import { ensureEditorProject } from '@/lib/projects/loadProject'
import { usePlaybackStore } from '@/store/playbackStore'

export type MediaIntent = 'placement' | 'reference'

/** Finished media. Never an entity reference. */
export async function placeFinishedClip(clip: Pick<GeneratedClip, 'jobId' | 'prompt'> & { label?: string }): Promise<GeneratedClip['mediaId']> {
  const { projectId } = await ensureEditorProject()
  const res = await fetch('/api/studio/library', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: 'placement' satisfies MediaIntent,
      projectId,
      jobId: clip.jobId,
      label: (clip.label ?? clip.prompt).slice(0, 80),
      kind: 'video',
    }),
  })
  const body = await res.json() as {
    item?: { id: string; folderId: string | null; sourceUrl: string; kind: GeneratedClip['libraryKind']; label: string }
    error?: string
  }
  if (!res.ok || !body.item) {
    throw new Error(body.error || 'Could not add the clip to the library')
  }
  usePlaybackStore.getState().upsertLibrary({
    id: body.item.id,
    jobId: clip.jobId,
    prompt: clip.prompt,
    model: 'library',
    quality: 'standard',
    creditsUsed: 0,
    duration: 5,
    aspectRatio: '16:9',
    status: 'complete',
    videoUrl: body.item.sourceUrl,
    createdAt: new Date(),
    folderId: body.item.folderId,
    libraryKind: body.item.kind ?? 'video',
    mediaId: body.item.id,
    label: body.item.label,
  })
  return body.item.id
}
