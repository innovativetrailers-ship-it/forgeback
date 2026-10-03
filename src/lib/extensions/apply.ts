import type { ExtensionClipView, ExtensionPatch } from '@cinema/core'
import type { Clip, TimelineRecipe } from '@/lib/timeline/schema'

export function clipsForExtension(recipe: TimelineRecipe): { clips: ExtensionClipView[]; trackIds: string[] } {
  const clips = recipe.tracks.flatMap((track) => track.clips.map((clip) => ({
    id: clip.id,
    trackId: clip.trackId,
    start: clip.startTime,
    end: clip.endTime,
    sourceUrl: clip.sourceUrl,
    label: clip.prompt ?? '',
  })))
  return { clips, trackIds: recipe.tracks.map((track) => track.id) }
}

export function applyExtensionPatches(recipe: TimelineRecipe, patches: readonly ExtensionPatch[]): TimelineRecipe {
  let next = recipe
  for (const patch of patches) {
    if (patch.op === 'move' || patch.op === 'trim') {
      next = {
        ...next,
        tracks: next.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => clip.id === patch.clipId && typeof patch.start === 'number' && typeof patch.end === 'number'
            ? { ...clip, startTime: patch.start, endTime: patch.end }
            : clip),
        })),
      }
      continue
    }
    if ((patch.op !== 'add' && patch.op !== 'add-take') || !patch.clipId || !patch.trackId || !patch.sourceUrl) continue
    const clip: Clip = {
      id: patch.clipId,
      trackId: patch.trackId,
      startTime: patch.start ?? 0,
      endTime: patch.end ?? 1,
      sourceUrl: patch.sourceUrl,
      prompt: patch.label ?? '',
    }
    next = {
      ...next,
      tracks: next.tracks.map((track) => track.id === patch.trackId ? { ...track, clips: [...track.clips, clip] } : track),
    }
  }
  return next
}
