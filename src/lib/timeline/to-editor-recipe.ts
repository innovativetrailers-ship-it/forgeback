import { useMemo } from 'react'
import type { TimelineRecipe as SchemaRecipe, Track as SchemaTrack, Clip as SchemaClip } from '@/lib/timeline/schema'
import type { TimelineRecipe as EditorRecipe, Track as EditorTrack, Clip as EditorClip } from '@/store/editor'
import { usePlaybackStore } from '@/store/playbackStore'

const mapTrackType = (type: SchemaTrack['type']): EditorTrack['type'] => {
  if (type === 'caption') return 'text'
  if (type === 'cgi' || type === 'vfx' || type === 'audio' || type === 'video') return type
  return 'video'
}

const toEditorClip = (clip: SchemaClip, trackType: EditorTrack['type']): EditorClip => {
  const duration = Math.max(0, clip.endTime - clip.startTime)
  return {
    id: clip.id,
    trackId: clip.trackId,
    startTime: clip.startTime,
    duration,
    videoUrl: clip.sourceUrl || null,
    proxyUrl: clip.proxyUrl ?? null,
    thumbnailUrl: null,
    prompt: clip.prompt ?? '',
    engineUsed: clip.modelUsed ?? 'imported',
    tier: 'Draft',
    characterIds: clip.characterId ? [clip.characterId] : [],
    locationId: clip.locationId ?? null,
    isGenerating: false,
    generationProgress: 0,
    jobId: null,
    trimIn: 0,
    trimOut: duration,
    volume: 1,
    opacity: 1,
    speed: 1,
    colourGradeJson: clip.colourGrade ?? null,
    sfxMakeupJson: null,
    name: clip.prompt,
    src: clip.sourceUrl,
    type: trackType,
    metadata: clip.metadata,
  }
}

const toEditorTrack = (track: SchemaTrack): EditorTrack => {
  const type = mapTrackType(track.type)
  return {
    id: track.id,
    type,
    name: track.label,
    label: track.label,
    height: type === 'audio' ? 48 : 72,
    muted: track.muted,
    locked: track.locked,
    solo: track.solo,
    volume: track.volume,
    clips: track.clips.map((c) => toEditorClip(c, type)),
  }
}

export const toEditorTimelineRecipe = (recipe: SchemaRecipe): EditorRecipe => ({
  id: recipe.id,
  projectId: recipe.projectId,
  tracks: recipe.tracks.map(toEditorTrack),
  totalDuration: recipe.durationSeconds,
  durationSeconds: recipe.durationSeconds,
  fps: recipe.fps,
  resolution: recipe.resolution,
  colourSpace: recipe.colorSpace,
})

function schemaFps(fps: number): 24 | 30 | 60 {
  if (fps === 30 || fps === 60) return fps
  return 24
}

function schemaColor(value: string): SchemaRecipe['colorSpace'] {
  if (value === 'dci-p3' || value === 'rec2020') return value
  return 'rec709'
}

function schemaTrackType(type: EditorTrack['type']): SchemaTrack['type'] {
  if (type === 'text') return 'caption'
  return type
}

const toSchemaClip = (clip: EditorClip & { sourceUrl?: string }): SchemaClip => {
  const duration = clip.duration > 0 ? clip.duration : 5
  return {
    id: clip.id,
    trackId: clip.trackId,
    startTime: clip.startTime,
    endTime: clip.startTime + duration,
    sourceUrl: clip.sourceUrl || clip.videoUrl || clip.src || '',
    proxyUrl: clip.proxyUrl ?? undefined,
    prompt: clip.prompt,
    modelUsed: clip.engineUsed,
    characterId: clip.characterIds[0],
    locationId: clip.locationId ?? undefined,
    metadata: clip.metadata,
  }
}

const toSchemaTrack = (track: EditorTrack): SchemaTrack => ({
  id: track.id,
  type: schemaTrackType(track.type),
  label: track.label || track.name,
  muted: track.muted,
  locked: track.locked,
  solo: track.solo,
  volume: track.volume,
  clips: track.clips.map((clip) => toSchemaClip(clip)),
})

export const toSchemaTimelineRecipe = (recipe: EditorRecipe): SchemaRecipe => ({
  id: recipe.id,
  projectId: recipe.projectId,
  fps: schemaFps(recipe.fps),
  resolution: recipe.resolution,
  durationSeconds: recipe.durationSeconds ?? recipe.totalDuration,
  colorSpace: schemaColor(recipe.colourSpace),
  tracks: recipe.tracks.map(toSchemaTrack),
})

/** Editor panels read the canonical recipe. Not a second store. */
export function useEditorRecipeView(): EditorRecipe | null {
  const recipe = usePlaybackStore((state) => state.recipe)
  return useMemo(() => (recipe ? toEditorTimelineRecipe(recipe) : null), [recipe])
}

export function commitEditorRecipe(recipe: EditorRecipe): void {
  const next = toSchemaTimelineRecipe(recipe)
  const current = usePlaybackStore.getState().recipe
  if (current && JSON.stringify(current) === JSON.stringify(next)) return
  usePlaybackStore.getState().commitRecipe(next)
}
