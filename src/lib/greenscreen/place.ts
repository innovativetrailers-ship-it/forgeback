import { isVideoMediaUrl } from '@/lib/timeline/playback'
import { commitEditorRecipe, toEditorTimelineRecipe } from '@/lib/timeline/to-editor-recipe'
import { useEditorStore, type Clip } from '@/store/editor'
import { usePlaybackStore } from '@/store/playbackStore'

export interface GreenScreenKeyerRecord {
  mode: string
  colour: string
  tolerance: number
  softness: number
  spill: number
  invert: boolean
  lightWrap: number
  shadow: number
  colourMatch: number
  backdropUrl?: string | null
  perFrame?: boolean
}

function layerClip(input: {
  trackId: string
  videoUrl: string
  start: number
  duration: number
  metadata: Record<string, unknown>
}): Clip {
  return {
    id: crypto.randomUUID(),
    trackId: input.trackId,
    startTime: input.start,
    duration: input.duration,
    videoUrl: input.videoUrl,
    proxyUrl: null,
    thumbnailUrl: null,
    prompt: 'Green screen',
    engineUsed: 'greenscreen',
    tier: 'Draft',
    characterIds: [],
    locationId: null,
    isGenerating: false,
    generationProgress: 0,
    jobId: null,
    trimIn: 0,
    trimOut: input.duration,
    volume: 1,
    opacity: 1,
    speed: 1,
    colourGradeJson: null,
    sfxMakeupJson: null,
    metadata: input.metadata,
  }
}

/** User-initiated. New clip ids. The source URL is copied, never replaced. */
export function placeGreenScreenLayers(input: {
  subjectUrl: string
  backdropUrl?: string | null
  playhead: number
  durationSec: number
  keyer: GreenScreenKeyerRecord
}): { placed: boolean; reason: string } {
  const recipe = usePlaybackStore.getState().recipe
  if (!recipe) {
    return { placed: false, reason: 'Open a project timeline first. Nothing was placed.' }
  }
  if (!isVideoMediaUrl(input.subjectUrl)) {
    return {
      placed: false,
      reason: 'The timeline plays video. This still stays in the library. The original file was not changed.',
    }
  }
  const view = toEditorTimelineRecipe(recipe)
  if (!view.tracks.some((track) => track.id === 't-v2')) {
    commitEditorRecipe({
      ...view,
      tracks: [
        ...view.tracks,
        { id: 't-v2', type: 'video', name: 'VIDEO 2', label: 'VIDEO 2', height: 72, muted: false, locked: false, solo: false, clips: [] },
      ],
    })
  }
  const linkId = crypto.randomUUID()
  const duration = input.durationSec > 0 ? input.durationSec : 5
  useEditorStore.getState().addClip('t-v1', layerClip({
    trackId: 't-v1',
    videoUrl: input.subjectUrl,
    start: input.playhead,
    duration,
    metadata: { greenScreen: { role: 'subject', linkId, keyer: input.keyer } },
  }))
  if (input.backdropUrl && isVideoMediaUrl(input.backdropUrl)) {
    useEditorStore.getState().addClip('t-v2', layerClip({
      trackId: 't-v2',
      videoUrl: input.backdropUrl,
      start: input.playhead,
      duration,
      metadata: { greenScreen: { role: 'backdrop', linkId } },
    }))
    return { placed: true, reason: 'Subject is on VIDEO 1 and the plate is on VIDEO 2. The original files were not replaced.' }
  }
  return {
    placed: true,
    reason: 'Subject is on VIDEO 1. A still plate stays in the library and on the clip. The original file was not replaced.',
  }
}
