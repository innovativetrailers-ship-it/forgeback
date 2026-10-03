import { nanoid } from 'nanoid'
import type { Clip, TimelineRecipe, Track } from '@/lib/timeline/schema'
import { computeTimelineDuration, isVideoMediaUrl } from '@/lib/timeline/playback'
import { usePlaybackStore } from '@/store/playbackStore'

export interface TimelineClip {
  id: string
  sourceUrl: string
  posterUrl?: string
  startSec: number
  durationSec: number
  track: 'video' | 'audio'
  label?: string
}

export type TimelineClipInput = Omit<TimelineClip, 'startSec' | 'track'> & {
  startSec?: number
  track?: 'video' | 'music' | 'voice' | TimelineClip['track']
  imported?: boolean
  mediaId?: string
  transition?: import('@/lib/timeline/schema').Transition
}

const VIDEO_TRACK_ID = 't-v1'
const TRACK_BY_KIND = { video: 't-v1', music: 't-music', voice: 't-voice', audio: 't-voice' } as const

function trackIdFor(track: TimelineClipInput['track']): string {
  if (track === 'music') return TRACK_BY_KIND.music
  if (track === 'voice' || track === 'audio') return TRACK_BY_KIND.voice
  return VIDEO_TRACK_ID
}

function defaultTracks(clips: Clip[]): Track[] {
  return [
    { id: 't-v1', type: 'video', label: 'VIDEO 1', muted: false, locked: false, solo: false, clips },
    { id: 't-v2', type: 'video', label: 'VIDEO 2', muted: false, locked: false, solo: false, clips: [] },
    { id: 't-vfx', type: 'vfx', label: 'VFX', muted: false, locked: false, solo: false, clips: [] },
    { id: 't-cgi', type: 'cgi', label: 'CGI', muted: false, locked: false, solo: false, clips: [] },
    { id: 't-music', type: 'audio', label: 'MUSIC', muted: false, locked: false, solo: false, volume: 0.7, clips: [] },
    { id: 't-voice', type: 'audio', label: 'VOICE', muted: false, locked: false, solo: false, volume: 1, clips: [] },
    { id: 't-sfx', type: 'audio', label: 'SFX', muted: false, locked: false, solo: false, volume: 0.6, clips: [] },
    { id: 't-cap', type: 'caption', label: 'CAPTIONS', muted: false, locked: false, solo: false, clips: [] },
  ]
}

function shotKey(clip: Clip): string | undefined {
  const meta = clip.metadata as { shotPlanId?: string } | undefined
  return meta?.shotPlanId
}

function hasPlayableSource(clip: Clip): boolean {
  return Boolean(clip.sourceUrl?.trim()) && isVideoMediaUrl(clip.sourceUrl)
}

/** Write one Simple/editor clip into the canonical recipe. Rejects a missing sourceUrl. */
export function appendTimelineClipToPlayback(input: TimelineClipInput): void {
  console.log('addClip input', {
    id: input.id,
    sourceUrl: input.sourceUrl,
    hasUrl: Boolean(input.sourceUrl),
  })
  if (!input.sourceUrl?.trim()) {
    console.error('addClip REJECTED: no sourceUrl', input)
    return
  }
  if (!input.durationSec || input.durationSec <= 0 || input.durationSec > 3600) {
    console.warn('addClip_suspect_duration', { id: input.id, durationSec: input.durationSec })
  }

  const durationSec = input.durationSec > 0 && input.durationSec <= 3600 ? input.durationSec : 5
  const store = usePlaybackStore.getState()
  const editorProjectId = store.projectId ?? store.recipe?.projectId ?? nanoid()
  if (store.projectId !== editorProjectId) store.setProjectId(editorProjectId)
  const recipe = store.recipe
  const base: TimelineRecipe = recipe
    ? { ...recipe, projectId: editorProjectId }
    : {
        id: nanoid(),
        projectId: editorProjectId,
        fps: 24,
        resolution: { width: 1920, height: 1080 },
        durationSeconds: 10,
        colorSpace: 'rec709',
        tracks: defaultTracks([]),
      }

  const tracks = base.tracks.some((t) => t.id === VIDEO_TRACK_ID)
    ? base.tracks
    : [...defaultTracks([]), ...base.tracks]

  const targetTrackId = trackIdFor(input.track)
  const nextTracks = tracks.map((track) => {
    if (track.id !== targetTrackId) return track
    const clips = [...track.clips]
    const idx = clips.findIndex((c) => c.id === input.id || shotKey(c) === input.id)
    if (idx >= 0) {
      const shell = clips[idx]
      clips[idx] = {
        ...shell,
        sourceUrl: input.sourceUrl,
        posterUrl: input.posterUrl ?? shell.posterUrl,
        prompt: input.label ?? shell.prompt,
        endTime: hasPlayableSource(shell)
          ? shell.endTime
          : shell.startTime + durationSec,
      }
      return { ...track, clips }
    }
    if (input.mediaId && input.startSec != null) {
      const hit = clips.findIndex((clip) => input.startSec! >= clip.startTime && input.startSec! < clip.endTime)
      if (hit >= 0) {
        const shell = clips[hit]
        clips[hit] = {
          ...shell,
          sourceUrl: input.sourceUrl,
          posterUrl: input.posterUrl ?? shell.posterUrl,
          prompt: input.label ?? shell.prompt,
          metadata: { ...(shell.metadata ?? {}), imported: true, mediaId: input.mediaId },
        }
        return { ...track, clips }
      }
    }
    const startSec = input.startSec ?? clips.reduce((max, c) => Math.max(max, c.endTime), 0)
    clips.push({
      id: input.id,
      trackId: targetTrackId,
      startTime: startSec,
      endTime: startSec + durationSec,
      sourceUrl: input.sourceUrl,
      posterUrl: input.posterUrl,
      prompt: input.label,
      transition: input.transition ?? { type: 'cut', duration: 0 },
      metadata: input.mediaId || input.imported
        ? { imported: true, mediaId: input.mediaId ?? input.id }
        : { shotPlanId: input.id },
    })
    return { ...track, clips: clips.sort((a, b) => a.startTime - b.startTime) }
  })

  store.setRecipe({
    ...base,
    tracks: nextTracks,
    durationSeconds: computeTimelineDuration(nextTracks, base.durationSeconds),
  })
}

function withClip(clipId: string, edit: (clip: Clip) => Clip | Clip[]): void {
  const store = usePlaybackStore.getState()
  const recipe = store.recipe
  if (!recipe) return
  const tracks = recipe.tracks.map((track) => {
    const index = track.clips.findIndex((clip) => clip.id === clipId)
    if (index < 0) return track
    const next = edit(track.clips[index])
    const clips = [...track.clips]
    clips.splice(index, 1, ...(Array.isArray(next) ? next : [next]))
    return { ...track, clips }
  })
  store.setRecipe({
    ...recipe,
    tracks,
    durationSeconds: computeTimelineDuration(tracks, recipe.durationSeconds),
  })
}

export function patchTimelineClip(clipId: string, patch: Partial<Clip>): void {
  withClip(clipId, (clip) => ({ ...clip, ...patch, id: clip.id }))
}

export function splitTimelineClip(clipId: string, atTime: number): void {
  withClip(clipId, (clip) => {
    if (atTime <= clip.startTime + 0.05 || atTime >= clip.endTime - 0.05) return clip
    const rightId = nanoid()
    return [
      { ...clip, endTime: atTime },
      { ...clip, id: rightId, startTime: atTime },
    ]
  })
}

export function reorderTimelineClip(clipId: string, direction: -1 | 1): void {
  const store = usePlaybackStore.getState()
  const recipe = store.recipe
  if (!recipe) return
  const tracks = recipe.tracks.map((track) => {
    const index = track.clips.findIndex((clip) => clip.id === clipId)
    const swap = index + direction
    if (index < 0 || swap < 0 || swap >= track.clips.length) return track
    const clips = [...track.clips]
    const a = clips[index]
    const b = clips[swap]
    clips[index] = { ...a, startTime: b.startTime, endTime: b.startTime + (a.endTime - a.startTime) }
    clips[swap] = { ...b, startTime: a.startTime, endTime: a.startTime + (b.endTime - b.startTime) }
    return { ...track, clips: clips.sort((left, right) => left.startTime - right.startTime) }
  })
  store.setRecipe({ ...recipe, tracks })
}
