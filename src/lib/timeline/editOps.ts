import { nanoid } from 'nanoid'
import type { Clip, TimelineRecipe } from './schema'

/** Split one clip at a timeline time. Returns the same recipe when the cut is outside the clip. */
export function splitClipAt(recipe: TimelineRecipe, clipId: string, atTime: number): TimelineRecipe {
  let changed = false
  const tracks = recipe.tracks.map((track) => {
    const index = track.clips.findIndex((clip) => clip.id === clipId)
    if (index < 0) return track
    const clip = track.clips[index]
    if (!clip || atTime <= clip.startTime + 0.05 || atTime >= clip.endTime - 0.05) return track
    changed = true
    const left: Clip = { ...clip, id: `${clip.id}_a_${nanoid(4)}`, endTime: atTime }
    const right: Clip = { ...clip, id: `${clip.id}_b_${nanoid(4)}`, startTime: atTime }
    const clips = [...track.clips]
    clips.splice(index, 1, left, right)
    return { ...track, clips }
  })
  return changed ? { ...recipe, tracks } : recipe
}
