import type { TimelineRecipe, Clip, Track } from '@/store/editor'

export type CutStyle =
  | 'fast-paced'
  | 'cinematic'
  | 'documentary'
  | 'interview'
  | 'music-video'

export type CutTone = 'energetic' | 'serious' | 'humorous' | 'emotional'

export interface RoughCutClipSelection {
  clipId: string
  startTime: number
  duration: number
  trimIn: number
  trimOut: number
  reason: string
}

export interface RoughCutResult {
  selections: RoughCutClipSelection[]
  totalDuration: number
  styleNotes: string
  brollGaps: Array<{ startTime: number; duration: number; suggestion: string }>
}

export function applyRoughCutToRecipe(
  recipe: TimelineRecipe,
  result: RoughCutResult,
): TimelineRecipe {
  const clipLookup = new Map<string, Clip>()
  for (const track of recipe.tracks) {
    for (const clip of track.clips) {
      clipLookup.set(clip.id, clip)
    }
  }

  const videoTrackIndex = recipe.tracks.findIndex((t) => t.type === 'video')
  const baseVideoTrack: Track =
    videoTrackIndex >= 0
      ? recipe.tracks[videoTrackIndex]
      : {
          id: 'track-video-roughcut',
          type: 'video',
          name: 'V1',
          label: 'VIDEO 1',
          height: 80,
          muted: false,
          locked: false,
          solo: false,
          clips: [],
        }

  const newClips: Clip[] = result.selections
    .map((sel) => {
      const original = clipLookup.get(sel.clipId)
      if (!original) return null
      return { ...original, startTime: sel.startTime, duration: sel.duration, trimIn: sel.trimIn, trimOut: sel.trimOut }
    })
    .filter((c): c is Clip => c !== null)

  const newVideoTrack: Track = { ...baseVideoTrack, clips: newClips }
  const otherTracks = recipe.tracks.filter((t) => t.type !== 'video')

  return { ...recipe, tracks: [newVideoTrack, ...otherTracks] }
}
