import { nanoid } from 'nanoid'
import type { Clip, TimelineRecipe, Track } from '@/lib/timeline/schema'

export const WORKSPACES = ['Creator', 'Director', 'Editor', 'Colour', 'Audio', 'VFX', 'Review'] as const
export type WorkspaceName = (typeof WORKSPACES)[number]

export const LOCAL_TRANSITIONS = ['cut', 'dissolve', 'fade', 'fade-in', 'fade-out', 'wipe', 'slide', 'push', 'zoom', 'whip', 'spin', 'glitch', 'blur', 'film_burn', 'light_leak', 'generative-bridge'] as const
export type LocalTransition = (typeof LOCAL_TRANSITIONS)[number]

export interface ThreePointMarks {
  srcIn: number
  srcOut: number
  tlIn: number | null
  tlOut: number | null
  mode: 'insert' | 'overwrite' | 'replace' | 'append'
  trackId: string
  source: Clip
}

function mapClips(recipe: TimelineRecipe, fn: (clip: Clip, track: Track) => Clip | null): TimelineRecipe {
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => {
        const next = fn(clip, track)
        return next ? [next] : []
      }),
    })),
  }
}

export function rippleDelete(recipe: TimelineRecipe, clipId: string): TimelineRecipe {
  let removed: { trackId: string; start: number; span: number } | null = null
  const cleared = mapClips(recipe, (clip) => {
    if (clip.id !== clipId) return clip
    removed = { trackId: clip.trackId, start: clip.startTime, span: clip.endTime - clip.startTime }
    return null
  })
  if (!removed) return recipe
  const gap = removed as { trackId: string; start: number; span: number }
  return mapClips(cleared, (clip) => {
    if (clip.trackId !== gap.trackId || clip.startTime < gap.start) return clip
    return { ...clip, startTime: clip.startTime - gap.span, endTime: clip.endTime - gap.span }
  })
}

export function duplicateClip(recipe: TimelineRecipe, clipId: string): TimelineRecipe {
  const tracks = recipe.tracks.map((track) => {
    const clip = track.clips.find((row) => row.id === clipId)
    if (!clip) return track
    const span = clip.endTime - clip.startTime
    const copy: Clip = { ...clip, id: nanoid(), startTime: clip.endTime, endTime: clip.endTime + span }
    const shifted = track.clips.map((row) => row.startTime >= clip.endTime
      ? { ...row, startTime: row.startTime + span, endTime: row.endTime + span }
      : row)
    return { ...track, clips: [...shifted, copy] }
  })
  return { ...recipe, tracks }
}

export function setClipSpeed(recipe: TimelineRecipe, clipId: string, speed: 0.5 | 1 | 2): TimelineRecipe {
  return mapClips(recipe, (clip) => {
    if (clip.id !== clipId) return clip
    const span = Math.max(0.5, (clip.endTime - clip.startTime) / speed)
    return { ...clip, endTime: clip.startTime + span, metadata: { ...clip.metadata, speed } }
  })
}

export function setClipVolume(recipe: TimelineRecipe, clipId: string, volume: number): TimelineRecipe {
  const next = Math.min(2, Math.max(0, volume))
  return mapClips(recipe, (clip) => clip.id === clipId
    ? { ...clip, audioSettings: { volume: next, pan: clip.audioSettings?.pan ?? 0, fadeIn: clip.audioSettings?.fadeIn, fadeOut: clip.audioSettings?.fadeOut } }
    : clip)
}

export function applyLocalTransition(recipe: TimelineRecipe, clipId: string, type: LocalTransition, duration = 0.5): TimelineRecipe {
  return mapClips(recipe, (clip) => clip.id === clipId ? { ...clip, transition: { type, duration } } : clip)
}

export function addTitle(recipe: TimelineRecipe, text: string, start: number, duration: number): TimelineRecipe {
  const title = text.trim()
  if (!title) return recipe
  let tracks = recipe.tracks
  let track = tracks.find((row) => row.type === 'caption')
  if (!track) {
    track = { id: nanoid(), type: 'caption', label: 'Titles', muted: false, locked: false, solo: false, clips: [] }
    tracks = [...tracks, track]
  }
  const clip: Clip = {
    id: nanoid(),
    trackId: track.id,
    startTime: start,
    endTime: start + Math.max(0.5, duration),
    sourceUrl: '',
    prompt: title,
    control: { overlays: [{ id: nanoid(), lowerThird: { title } }] },
  }
  return {
    ...recipe,
    tracks: tracks.map((row) => {
      if (row.id === track.id) return { ...row, clips: [...row.clips, clip] }
      if (row.type !== 'video') return row
      return {
        ...row,
        clips: row.clips.map((item) => {
          if (start < item.startTime || start >= item.endTime) return item
          const overlays = [...(item.control?.overlays ?? []).filter((overlay) => overlay.id !== 'title'), { id: 'title', lowerThird: { title } }]
          return { ...item, control: { ...item.control, overlays } }
        }),
      }
    }),
  }
}

export function threePointEdit(recipe: TimelineRecipe, marks: ThreePointMarks): TimelineRecipe {
  const span = Math.max(0.5, marks.srcOut - marks.srcIn)
  const start = marks.mode === 'append'
    ? recipe.tracks.find((track) => track.id === marks.trackId)?.clips.reduce((max, clip) => Math.max(max, clip.endTime), 0) ?? 0
    : (marks.tlIn ?? 0)
  const placed: Clip = {
    ...marks.source,
    id: nanoid(),
    trackId: marks.trackId,
    startTime: start,
    endTime: start + span,
  }
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => {
      if (track.id !== marks.trackId) return track
      if (marks.mode === 'insert') {
        const shifted = track.clips.map((clip) => clip.startTime >= start
          ? { ...clip, startTime: clip.startTime + span, endTime: clip.endTime + span }
          : clip)
        return { ...track, clips: [...shifted, placed] }
      }
      if (marks.mode === 'replace') {
        return { ...track, clips: [...track.clips.filter((clip) => clip.endTime <= start || clip.startTime >= start + span), placed] }
      }
      return { ...track, clips: [...track.clips, placed] }
    }),
  }
}

export function ensureOverlayTrack(recipe: TimelineRecipe, label: 'Overlay' | 'Stickers'): TimelineRecipe {
  if (recipe.tracks.some((track) => track.label === label)) return recipe
  const track: Track = {
    id: nanoid(),
    type: 'video',
    label,
    muted: false,
    locked: false,
    solo: false,
    clips: [],
  }
  return { ...recipe, tracks: [...recipe.tracks, track] }
}

export {
  KEY_COMMANDS,
  KEYMAP_PRESETS,
  chordFromEvent,
  commandFor,
  exportKeymap,
  importKeymap,
} from './keymap'
export type { KeyCommand, Keymap } from './keymap'
